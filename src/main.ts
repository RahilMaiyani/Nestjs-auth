import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: "https://localhost:5173/" } });

  app.enableCors();

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
