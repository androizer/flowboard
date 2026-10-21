import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { ApiErrorFilter } from './app/api-error.filter';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:8080', credentials: true });
  const swagger = new DocumentBuilder()
    .setTitle('Flowboard API')
    .setDescription(
      'Flowboard API: authentication, permission-filtered hierarchy, resolved boards, and task workflows.',
    )
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
