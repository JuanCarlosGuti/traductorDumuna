import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Common configuration of the HTTP app (used by main.ts and by the e2e tests):
 * global /api prefix and strict DTO validation.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
}
