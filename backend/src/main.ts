import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Bootstrap mínimo; la Fase 2 añade Swagger, API REST y serve-static.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log('Backend escuchando en http://localhost:3000');
}

void bootstrap();
