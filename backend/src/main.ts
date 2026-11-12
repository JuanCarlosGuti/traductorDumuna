import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configurar-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  // Render puts a proxy in front: without this req.ip would always be the
  // proxy's and the login attempt limit would apply to everyone at
  // once, so an attacker could lock the owner out. Only the last
  // hop is trusted.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const config = new DocumentBuilder()
    .setTitle('Corpus Damana API')
    .setDescription(
      'API de consulta del corpus damana (dʉmʉna) — concordancias, fichas de palabra, frecuencias y listados. ' +
        'Salvo /auth/estado y /auth/login, todo exige cabecera Authorization: Bearer <token>.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  // Configurable via env to coexist with other apps on the same machine (e.g. another
  // project using 3000) and for deployments where the platform assigns the port.
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Backend escuchando en http://localhost:${port} (docs en /api/docs)`);
}

void bootstrap();
