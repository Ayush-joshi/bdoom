import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { getConfig } from './config';

async function bootstrap() {
  const config = getConfig();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.nodeEnv !== 'production') {
    app.enableCors({
      origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
      credentials: true,
    });
  }

  await app.listen(config.port, config.host);
}

void bootstrap();
