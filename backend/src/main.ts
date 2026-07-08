import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);

  const config = new DocumentBuilder()
    .setTitle('Corpus Damana API')
    .setDescription(
      'API de consulta del corpus damana (dʉmʉna) — concordancias, fichas de palabra, frecuencias y listados.',
    )
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(3000);
  console.log('Backend escuchando en http://localhost:3000 (docs en /api/docs)');
}

void bootstrap();
