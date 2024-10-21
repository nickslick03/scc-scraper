import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import puppeteer from 'puppeteer';
import exceljs from 'exceljs';

export interface student {
  imageUrl: string,
  fullName: string,
  id: string,
  email: string,
  building: string,
  room: string,
  major: string
};

const sleep = async (seconds: number) =>
  new Promise(res => setTimeout(res, seconds * 1000));

@Injectable()
export class AppService {

  static sccUrl = 'https://apex.messiah.edu/apex/f?p=294';

  async getStudents({username, password}: {username: string, password: string}): Promise<student[]> {
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox'],
    });
    const mainPage = await browser.newPage();
    await mainPage.goto(AppService.sccUrl, { waitUntil: 'networkidle0' });
    console.log({username, password})
    try {
      await mainPage.type('#username', username);
      await mainPage.type('#password', password);
    } catch (e) {
      await browser.close();
      throw new Error('URL is invalid');
    }

    await mainPage.click('button[name=submit]');
    await sleep(5);
    if ((await mainPage.title()) !== 'Students') {
      await browser.close();
      throw new Error('Username or password is incorrect.');
    }

    // click advanced button to sort by room numbber
    await Promise.all([
      mainPage.waitForNavigation(),
      mainPage.evaluate(() =>
        [...document.querySelectorAll<HTMLAnchorElement>('.t15c a')]
          .filter((a) => a.textContent === 'Advanced')[0]
          .click(),
      ),
    ]);

    const studentUrls = await mainPage.evaluate(() =>
      [...document.querySelectorAll('a')]
        .filter((a) => a.textContent.includes(', '))
        .map((a) => a.href),
    );
    const students: student[] = [];

    for (const url of studentUrls) {
      const studentPage = await browser.newPage();
      await studentPage.goto(url);

      const student = await studentPage.evaluate(() => {
        const studentCells = [
          ...document.querySelectorAll('#R27143324834839494 .t15data'),
        ];
        const programCells = [
          ...document.querySelectorAll('#R27348423794699608 .t15data'),
        ];
        const imageTag = studentCells[0].children[0] as HTMLImageElement;
        return {
          imageUrl: imageTag.src,
          fullName: studentCells[1].children[0].textContent,
          id: studentCells[2].textContent,
          email: studentCells[9].children[0].textContent,
          building: studentCells.at(-1).textContent.split(' ')[0],
          room: studentCells.at(-1).textContent.split(' ').at(-1),
          major: programCells[1].textContent,
        };
      });
      console.log(student);
      students.push(student);
      await studentPage.close();
    }

    await browser.close();

    return students;
  }

  async createZip(buffers: {buffer: Buffer, name: string}[]) {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('error', (err) => {
      throw err;
    });
    for (const buff of buffers) {
      archive.append(buff.buffer, { name: buff.name });
    }
    await archive.finalize();
    return Buffer.concat(chunks);
  }

  getFloor(student: student) {
    return  student.building + '_' +
    (isNaN(+student.room[0])
      ? [...student.room].slice(0, 2).reverse().join('')
      : student.room[0]);
  }

  async createICLog(students: student[]) {
    const ICWorkbook = new exceljs.Workbook();
    await ICWorkbook.xlsx.readFile('templates/IC_Template.xlsx');
    const ICWorksheet = ICWorkbook.getWorksheet('IC_Logs');

    for (let i = 0; i < students.length; i++) {
      ICWorksheet.getCell(`A${i + 3}`).value = students[i].room;
      ICWorksheet.getCell(`B${i + 3}`).value = students[i].fullName;
    }
    return ICWorkbook;
  }

  async getImageBuffers(students: student[]) {
    return await Promise.all(
      students.map(async student => {
        const imageRes = await fetch(student.imageUrl);
        return Buffer.from(await imageRes.arrayBuffer());
      })
    );
  }

  async createFD(students: student[], imageBuffers: Buffer[]) {
    const columns = [...'ABCDEF'];

    const FDWorkbook = new exceljs.Workbook();
    const FDWorksheet = FDWorkbook.addWorksheet('Residents');

    for (const col of columns) {
      FDWorksheet.getColumn(col).width = 200 / 7;
    }

    for (let i = 0; i < students.length; i++) {
      const baseRow = Math.floor(i / columns.length) * 5 + 1;
      const imageId = FDWorkbook.addImage({
        buffer: imageBuffers[i],
        extension: 'jpeg',
      });
      FDWorksheet.getRow(baseRow).height = 225;
      FDWorksheet.addImage(imageId, {
        tl: {
          col: i % columns.length,
          row: baseRow - 1,
        },
        ext: {
          width: 200,
          height: 200,
        },
        editAs: 'oneCell',
      });
      const col = columns[i % columns.length];
      FDWorksheet.getCell(`${col}${baseRow + 1}`).value =
        `Name: ${students[i].fullName}`;
      FDWorksheet.getCell(`${col}${baseRow + 2}`).value =
        `Room Number: ${students[i].room}`;
      FDWorksheet.getCell(`${col}${baseRow + 3}`).value =
        `Major: ${students[i].major}`;
      FDWorksheet.getCell(`${col}${baseRow + 4}`).value = `Interests: `;
    }

    return FDWorkbook;
  }
}
