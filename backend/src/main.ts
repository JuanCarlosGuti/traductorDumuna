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

  // Configurable por env para convivir con otras apps en la misma máquina (p. ej. otro
  // proyecto ocupando el 3000) y para despliegues donde el puerto lo asigna la plataforma.
  const puerto = Number(process.env.PORT) || 3000;
  await app.listen(puerto);
  console.log(`Backend escuchando en http://localhost:${puerto} (docs en /api/docs)`);
}

void bootstrap();
