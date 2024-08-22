import { Body, Controller, Get, Post, Render, Res } from '@nestjs/common';
import { AppService, student } from './app.service';
import exceljs from 'exceljs';
//import fs from 'fs';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Render('index')
  getIndex() {}

  @Post()
  async postIndex(
    @Body() body: { sccUrl: string; username: string; password: string },
    @Res() res: Response,
  ) {

    let students: student[];
    try {
      students = await this.appService.getStudents(body);
    } catch(e) {
      res.render('index', {
        sccUrl: body.sccUrl,
        username: body.username,
        errors: [e]
      });
      return;
    }

    const buffers: {buffer: Buffer, name: string}[] = [];

    const ICWorkbook = await this.appService.createICLog(students);
    buffers.push({ 
      buffer: Buffer.from(await ICWorkbook.xlsx.writeBuffer()),
      name: `${this.appService.getFloor(students[0])}_IC_Log.xlsx`
    });
    console.log('Created IC Log');

    const imageBuffers = await this.appService.getImageBuffers(students);
    for (let i = 0; i < students.length; i++) {
      buffers.push({ 
        buffer: imageBuffers[i],
        name: `photos/${students[i].fullName.split(/\s|,\s/g).join('_')}.jpg`,
      });
    }
    console.log('Downloaded images');

    const FDWorkbook = await this.appService.createFD(students, imageBuffers);

    const FDbuffer = await FDWorkbook.xlsx.writeBuffer();
    buffers.push({ buffer: Buffer.from(FDbuffer),
      name: `${this.appService.getFloor(students[0])}_Floor_Directory.xlsx`,
    });
    console.log('Created Floor Directory');

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="output.zip"`,
    });
    const zip = await this.appService.createZip(buffers);
    res.send(zip);
    return;
  }
}
