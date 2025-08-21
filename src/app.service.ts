/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import puppeteer from 'puppeteer';
import exceljs from 'exceljs';
import { AppGateway } from './app.gateway';
import { io } from 'socket.io-client';

export interface student {
  imageUrl: string;
  fullName: string;
  id: string;
  email: string;
  building: string;
  room: string;
  major: string;
  imageBuffer?: Buffer;
}

const sleep = async (seconds: number) =>
  new Promise((res) => setTimeout(res, seconds * 1000));

@Injectable()
export class AppService {
  constructor(private readonly AppGateway: AppGateway) {}

  static sccUrl = 'https://apex.messiah.edu/apex/f?p=294';

  static apartments = ['Smith', 'Mellinger', 'Fry', 'Kelly'];

  async getStudents({
    username,
    password,
    socketID,
  }: {
    username: string;
    password: string;
    socketID: string;
  }): Promise<student[]> {
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox'],
    });
    const mainPage = await browser.newPage();
    try {
      await mainPage.goto(AppService.sccUrl, { waitUntil: 'networkidle0' });
    } catch (e) {
      await browser.close();
      throw new Error('Messiah CAS is not loading. Please try again later.');
    }

    try {
      await mainPage.type('#username', username);
      await mainPage.type('#password', password);

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

      const students: student[] = [];

      while (true) {
        const studentUrls = await mainPage.evaluate(() =>
          [...document.querySelectorAll('a')]
            .filter((a) => a.textContent.includes(', '))
            .map((a) => a.href),
        );

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

          this.AppGateway.emitEvent(
            socketID,
            'updateProgress',
            `Gathering info on ${student.fullName}`,
          );

          students.push(student);

          studentPage.close();
        }

        const isNext = await mainPage.evaluate(async (): Promise<boolean> => {
          const nextButton = [
            ...document.querySelectorAll('a.fielddata'),
          ].filter((a) => a.textContent === 'Next')[0] as HTMLAnchorElement;
          if (nextButton === undefined) return false;
          return await new Promise((res) => {
            const observer = new MutationObserver((records) => {
              console.log(records);
              if (
                (
                  records.at(-1).target as HTMLTableCellElement | undefined
                )?.classList.contains('t15Body')
              ) {
                observer.disconnect();
                res(true);
              }
            });
            observer.observe(document.body, {
              childList: true, // observe direct children
              subtree: true, // and lower descendants too
              characterDataOldValue: true, // pass old data to callback
            });
            nextButton.click();
          });
        });

        if (!isNext) break;
      }

      return students;
    } catch (e) {
      console.error(e);
      throw new Error(
        e?.message ?? "Please tell web admin SCC Scraper isn't working.",
      );
    } finally {
      await browser.close();
    }
  }

  async getStudentsFetch({
    url,
    username,
    password,
    socketID,
  }: {
    url: string;
    username: string;
    password: string;
    socketID: string;
  }): Promise<student[]> {
    const socket = io(url);
    const fetchSocketID: string = await new Promise((res) =>
      socket.on('id', (id) => res(id)),
    );
    socket.on(
      'updateProgress',
      ((message: string) => {
        this.AppGateway.emitEvent(socketID, 'updateProgress', message);
      }).bind(this),
    );
    const params = new URLSearchParams({
      username,
      password,
      socketID: fetchSocketID,
    });
    const res = await fetch(`${url}/students`, {
      method: 'POST',
      body: params,
    });
    const json = (await res.json()) as student[] | string;
    socket.disconnect();
    if (res.ok) {
      return json as student[];
    } else {
      console.error(json);
      throw new Error(json as string);
    }
  }

  async createZip(buffers: { buffer: Buffer; name: string }[]) {
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

  getFloor(student: student, dropFloorNumber = false) {
    return (
      student.building +
      '_' +
      (dropFloorNumber
        ? student.room.replaceAll(/\d/g, '')
        : isNaN(+student.room[0])
          ? [...student.room].slice(0, 2).reverse().join('')
          : student.room[0])
    );
  }

  groupStudentsByFloor(students: student[]) {
    const studentsByFloor = new Map<string, student[]>();
    const sortedStudents = [...students].sort((a, b) => {
      if (a.building < b.building) return -1;
      if (a.building > b.building) return 1;
      if (a.room < b.room) return -1;
      else return 1;
    });
    for (const student of sortedStudents) {
      const floor = this.getFloor(
        student,
        AppService.apartments.includes(student.building),
      );
      if (studentsByFloor.has(floor)) {
        studentsByFloor.get(floor).push(student);
      } else {
        studentsByFloor.set(floor, [student]);
      }
    }
    return studentsByFloor;
  }

  async createICLog(students: student[]) {
    const ICWorkbook = new exceljs.Workbook();
    await ICWorkbook.xlsx.readFile('templates/IC_Template.xlsx');

    const studentsByFloor = this.groupStudentsByFloor(students);

    let floorIndex = 0;

    for (const floor of studentsByFloor.keys()) {
      const floorStudents = studentsByFloor.get(floor);
      const ICWorksheet = ICWorkbook.getWorksheet(
        `IC_Logs${floorIndex > 0 ? ` (${floorIndex + 1})` : ''}`,
      );
      ICWorksheet.name = this.getFloor(
        floorStudents[0],
        AppService.apartments.includes(floorStudents[0].building),
      );

      for (let i = 0; i < floorStudents.length; i++) {
        ICWorksheet.getCell(`A${i + 3}`).value = floorStudents[i].room;
        ICWorksheet.getCell(`B${i + 3}`).value = floorStudents[i].fullName;
      }

      floorIndex++;
    }

    for (let i = floorIndex; i < 60; i++) {
      ICWorkbook.getWorksheet(`IC_Logs (${i + 1})`).destroy();
    }

    return ICWorkbook;
  }

  async getImageBuffers(students: student[]) {
    return await Promise.all(
      students.map(async (student) => {
        const imageRes = await fetch(student.imageUrl);
        student.imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      }),
    );
  }

  async createFD(students: student[]) {
    const columns = [...'ABCDEF'];
    const FDWorkbook = new exceljs.Workbook();

    const studentsByFloor = this.groupStudentsByFloor(students);

    for (const floor of studentsByFloor.keys()) {

      const floorStudents = studentsByFloor.get(floor);
      const FDWorksheet = FDWorkbook.addWorksheet(floor);

      for (const col of columns) {
        FDWorksheet.getColumn(col).width = 200 / 7;
      }

      for (let i = 0; i < floorStudents.length; i++) {
        const baseRow = Math.floor(i / columns.length) * 5 + 1;
        const imageId = FDWorkbook.addImage({
          buffer: floorStudents[i].imageBuffer,
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
          `Name: ${floorStudents[i].fullName}`;
        FDWorksheet.getCell(`${col}${baseRow + 2}`).value =
          `Room Number: ${floorStudents[i].room}`;
        FDWorksheet.getCell(`${col}${baseRow + 3}`).value =
          `Major: ${floorStudents[i].major}`;
        FDWorksheet.getCell(`${col}${baseRow + 4}`).value = `Interests: `;
      }
    }

    return FDWorkbook;
  }
}
