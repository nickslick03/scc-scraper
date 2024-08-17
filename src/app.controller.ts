import { Body, Controller, Get, Post, Render, Res } from '@nestjs/common';
import { AppService } from './app.service';
import puppeteer from "puppeteer";
import exceljs from 'exceljs';
import fs from "fs";
import archiver from 'archiver';
import { Response } from 'express';
import { PassThrough } from 'stream';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @Render('index')
  getIndex() {

  }

  @Post()
  async postIndex(@Body() body: { sccUrl: string, username: string, password: string }, @Res() res: Response) {

    const sleep = async (seconds) => new Promise((res) => setTimeout(res, seconds * 1000));

    const browser = await puppeteer.launch({ headless: true });
    const mainPage = await browser.newPage();
    const url = body.sccUrl;
    await mainPage.goto(url);


    const { username, password } = body;
    try {
      await mainPage.type('#username', username);
      await mainPage.type('#password', password);
      await mainPage.click('button[name=submit]');  
    } catch (e) {
      browser.close();
      return { errors: ['URL is invalid'] };
    }

    await sleep(5);
    if (await mainPage.title() === 'Students') {

    } else {
      res.render('index', {
        errors: ['username or password incorrect']
      });
      return;
    }

    // create /output and /output/profile_images
    // if (!fs.existsSync('/output')) {
    //   fs.mkdirSync('output');
    //   fs.mkdirSync('output/profile_images');
    // }

    // click advanced button to sort by room numbber
    await Promise.all([
      mainPage.waitForNavigation(),
      mainPage.evaluate(() =>
        [...document.querySelectorAll<HTMLAnchorElement>('.t15c a')]
          .filter(a => a.textContent === 'Advanced')[0] 
          .click())
    ]);

    const numOfStudents = await mainPage.evaluate(() =>
      [...document.querySelectorAll('a')]
        .filter(a => a.textContent.includes(', '))
        .length
    );

    const students = [];

    for (let i = 0; i < numOfStudents; i++) {
      await Promise.all([
        mainPage.waitForNavigation(),
        mainPage.evaluate((i) =>
          {
            console.log([...document.querySelectorAll('a')]
            .filter(a => a.textContent.includes(', '))[i])
            return [...document.querySelectorAll('a')]
            .filter(a => a.textContent.includes(', '))[i]
            .click()}
          , i)
      ]);

      const student = await mainPage.evaluate(() => {
        const studentCells = [...document.querySelectorAll('#R27143324834839494 .t15data')];
        const programCells = [...document.querySelectorAll('#R27348423794699608 .t15data')];
        const imageTag = studentCells[0].children[0] as HTMLImageElement;
        return {
          imageUrl: imageTag.src,
          fullName: studentCells[1].children[0].textContent,
          id: studentCells[2].textContent,
          email: studentCells[9].children[0].textContent,
          building: studentCells.at(-1).textContent.split(' ')[0],
          room: studentCells.at(-1).textContent.split(' ').at(-1),
          major: programCells[1].textContent
        };
      });
      console.log(student);
      students.push(student);
      // const imageRes = await fetch(student.imageUrl);
      // const buffer = Buffer.from(await imageRes.arrayBuffer());
      // fs.writeFileSync(`output/profile_images/${student.fullName.split(/\s|,\s/g).join('_')}.jpg`, buffer);
      await mainPage.goBack();
    }

    await browser.close();

    const archive = archiver('zip', {
      zlib: { level: 9 }
    });
    const chunks: Buffer[] = [];

    archive.on('data', chunk => chunks.push(chunk));
    archive.on('error', err => { throw err });

    const floor = students[0].building + '_' +
      (isNaN(+students[0].room[0])
        ? [...students[0].room].slice(0, 2).reverse().join('')
        : students[0].room[0]);

    // IC log
    const ICWorkbook = new exceljs.Workbook();
    await ICWorkbook.xlsx.readFile('templates/IC_Template.xlsx');
    const ICWorksheet = ICWorkbook.getWorksheet('IC_Logs');

    for (let i = 0; i < students.length; i++) {
      ICWorksheet.getCell(`A${i + 3}`).value = students[i].room;
      ICWorksheet.getCell(`B${i + 3}`).value = students[i].fullName;
    }

    //await ICWorkbook.xlsx.writeFile(`output/${floor}_IC_Log.xlsx`);
    const ICbuffer = await ICWorkbook.xlsx.writeBuffer();
    archive.append(Buffer.from(ICbuffer), { name: `${floor}_IC_Log.xlsx` });
    console.log('Created IC Log');

    // Floor Directory
    const columns = [...'ABCDEF'];

    const FDWorkbook = new exceljs.Workbook();
    const FDWorksheet = FDWorkbook.addWorksheet('Residents');

    for (let col of columns) {
      FDWorksheet.getColumn(col).width = 200 / 7;
    }

    for (let i = 0; i < students.length; i++) {
      const baseRow = (Math.floor(i / columns.length) * 5) + 1;
      const imageRes = await fetch(students[i].imageUrl);
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      const imageId = FDWorkbook.addImage({
        buffer: imageBuffer,
        extension: 'jpeg'
      });
      FDWorksheet.getRow(baseRow).height = 200;
      FDWorksheet.addImage(imageId, {
        tl: {
          col: i % columns.length,
          row: baseRow - 1
        },
        ext: {
          width: 200,
          height: 200
        },
        editAs: 'oneCell'
      });
      const col = columns[i % columns.length];
      FDWorksheet.getCell(`${col}${baseRow + 1}`).value = `Name: ${students[i].fullName}`;
      FDWorksheet.getCell(`${col}${baseRow + 2}`).value = `Room Number: ${students[i].room}`;
      FDWorksheet.getCell(`${col}${baseRow + 3}`).value = `Major: ${students[i].major}`;
      FDWorksheet.getCell(`${col}${baseRow + 4}`).value = `Interests: `;

      archive.append(imageBuffer, { name: `photos/${students[i].fullName.split(/\s|,\s/g).join('_')}.jpg`});
    }

    const FDbuffer = await FDWorkbook.xlsx.writeBuffer();
    archive.append(Buffer.from(FDbuffer), { name: `${floor}_Floor_Directory.xlsx` });
    //await FDWorkbook.xlsx.writeFile(`output/${floor}_Floor_Directory.xlsx`);
    console.log('Created Floor Directory');

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="files.zip"',
    });
    await archive.finalize();
    res.send(Buffer.concat(chunks));
    return;
  }
}
