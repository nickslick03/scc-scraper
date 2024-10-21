import { Body, Controller, Get, Post, Render, Res } from '@nestjs/common';
import { AppService, student } from './app.service';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Render('index')
  getIndex() {}

  @Post()
  async postIndex(
    @Body() body: { username: string; password: string },
    @Res() res: Response,
  ) {
    let students: student[];
    try {
      students = await this.appService.getStudents(body);
    } catch(e) {
      console.error((new Date()).toDateString(), e);
      res.status(400);
      res.send({
        error: e.message
      });
      return;
    }

    const buffers: {buffer: Buffer, name: string}[] = [];

    const ICWorkbook = await this.appService.createICLog(students);
    buffers.push({ 
      buffer: Buffer.from(await ICWorkbook.xlsx.writeBuffer()),
      name: `${this.appService.getFloor(students[0])}_IC_Log.xlsx`
    });

    const imageBuffers = await this.appService.getImageBuffers(students);
    for (let i = 0; i < students.length; i++) {
      buffers.push({ 
        buffer: imageBuffers[i],
        name: `photos/${students[i].fullName.split(/\s|,\s/g).join('_')}.jpg`,
      });
    }

    const FDWorkbook = await this.appService.createFD(students, imageBuffers);

    const FDbuffer = await FDWorkbook.xlsx.writeBuffer();
    buffers.push({ 
      buffer: Buffer.from(FDbuffer),
      name: `${this.appService.getFloor(students[0])}_Floor_Directory.xlsx`,
    });

    const zip = await this.appService.createZip(buffers);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${this.appService.getFloor(students[0])}.zip"`,
      'Content-Length': zip.length
    });
    res.send(zip);
    return;
  }
}
