import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { configDotenv } from 'dotenv';
configDotenv();
import { env } from 'process';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.useStaticAssets(join(__dirname, '..', 'views'));
  app.setViewEngine('pug');

  await app.listen(env.PORT || 3000);
}
bootstrap();
