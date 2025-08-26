import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { configDotenv } from 'dotenv';
configDotenv();
import { env } from 'process';

// the messiah image url's certs are invalid, as fetched in app.service.ts line 132
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', '..', 'public'));
  app.useStaticAssets(join(__dirname, '..', '..', 'views'));
  app.setViewEngine('pug');
  app.enableCors();

  await app.listen(env.PORT || 3000);
}
bootstrap();
