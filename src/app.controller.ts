import { Body, Controller, Get, Post, Render, Res } from '@nestjs/common';
import { AppService, student } from './app.service';
import { Response } from 'express';
import { AppGateway } from './app.gateway';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly appGateway: AppGateway,
  ) {}

  static studentFetchUrl = process.argv.find((arg) =>
    /^studentFetchUrl=/.test(arg),
  )
    ? process.argv
        .find((arg) => /^studentFetchUrl=/.test(arg))
        .split('studentFetchUrl=')[1]
    : null;

  @Get()
  @Render('index')
  getIndex() {}

  @Post()
  async postIndex(
    @Body() body: { username: string; password: string; socketID: string },
    @Res() res: Response,
  ) {
    const studentFetchUrl = AppController.studentFetchUrl;
    let students: student[];
    try {
      if (studentFetchUrl)
        this.appGateway.emitEvent(
          body.socketID,
          'updateProgress',
          'Gathering student info',
        );
      students = await (studentFetchUrl
        ? this.appService.getStudentsFetch({ ...body, url: studentFetchUrl })
        : this.appService.getStudents(body));
      this.appService;
    } catch (e) {
      console.error(new Date().toDateString(), e);
      res.status(400);
      res.send({
        error: e.message,
      });
      return;
    }

    const buffers: { buffer: Buffer; name: string }[] = [];

    this.appGateway.emitEvent(
      body.socketID,
      'updateProgress',
      'Creating IC log',
    );
    const ICWorkbook = await this.appService.createICLog(students);
    buffers.push({
      buffer: Buffer.from(await ICWorkbook.xlsx.writeBuffer()),
      name: `${this.appService.getFloor(students[0])}_IC_Log.xlsx`,
    });

    let imageBuffers: Buffer[];
    try {
      this.appGateway.emitEvent(
        body.socketID,
        'updateProgress',
        'Downloading student images',
      );
      imageBuffers = await this.appService.getImageBuffers(students);
    } catch (e) {
      console.error(new Date().toDateString(), e);
      res.status(400);
      res.send({
        error:
          'Failed to get profile images from Messiah servers. Please try again later.',
      });
      return;
    }
    for (let i = 0; i < students.length; i++) {
      buffers.push({
        buffer: imageBuffers[i],
        name: `photos/${students[i].fullName.split(/\s|,\s/g).join('_')}.jpg`,
      });
    }

    this.appGateway.emitEvent(
      body.socketID,
      'updateProgress',
      'Creating floor directory',
    );
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
      'Content-Length': zip.length,
    });
    res.send(zip);
    return;
  }
}
