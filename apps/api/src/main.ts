import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:8080', credentials: true });
  const swagger = new DocumentBuilder()
    .setTitle('Flowboard API')
    .setDescription('Day 1 API: local authentication, session lifecycle, and initial hierarchy.')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  app
    .getHttpAdapter()
    .get(
      '/health',
      (_req: unknown, res: { status: (code: number) => { json: (value: unknown) => void } }) =>
        res.status(200).json({ status: 'ok' }),
    );
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
void bootstrap();
