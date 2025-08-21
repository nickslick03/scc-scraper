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

  static studentApiUrl = process.argv.find((arg) => /^studentApiUrl=/.test(arg))
    ? process.argv
        .find((arg) => /^studentApiUrl=/.test(arg))
        .split('studentApiUrl=')[1]
    : null;

  @Get()
  @Render('index')
  getIndex() {}

  @Post()
  async postIndex(
    @Body() body: { username: string; password: string; socketID: string },
    @Res() res: Response,
  ) {
    const studentApiUrl = AppController.studentApiUrl;
    let students: student[];
    try {
      students = await (studentApiUrl
        ? this.appService.getStudentsFetch({ ...body, url: studentApiUrl })
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
      name: `IC_Log.xlsx`,
    });

    try {
      this.appGateway.emitEvent(
        body.socketID,
        'updateProgress',
        'Downloading student images',
      );
      await this.appService.getImageBuffers(students);
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
        buffer: students[i].imageBuffer,
        name: `photos/${this.appService.getFloor(students[i], AppService.apartments.includes(students[i].building))}/${students[i].fullName.split(/\s|,\s/g).join('_')}.jpg`,
      });
    }

    this.appGateway.emitEvent(
      body.socketID,
      'updateProgress',
      'Creating floor directory',
    );
    const FDWorkbook = await this.appService.createFD(students);

    const FDbuffer = await FDWorkbook.xlsx.writeBuffer();
    buffers.push({
      buffer: Buffer.from(FDbuffer),
      name: `Floor_Directory.xlsx`,
    });

    const zip = await this.appService.createZip(buffers);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Logs.zip"`,
      'Content-Length': zip.length,
    });
    res.send(zip);
    return;
  }
}
