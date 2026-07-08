import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Configuración común de la app HTTP (usada por main.ts y por los e2e):
 * prefijo global /api y validación estricta de DTOs.
 */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
}
