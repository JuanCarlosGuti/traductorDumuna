import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import { AuthModule } from './auth/auth.module';
import { QueryModule } from './query/query.module';
import { DatabaseModule } from './database/database.module';
import { ImporterModule } from './importer/importer.module';
import { defaultDbPath } from './importer/data-paths';
import { PendingModule } from './pending/pending.module';
import { HealthModule } from './health/health.module';
import { SrsModule } from './srs/srs.module';
import { TranslationModule } from './translation/translation.module';

// backend/public: where the frontend leaves its build (npm run build -w frontend).
// In dev __dirname is backend/src and compiled it is backend/dist; in both
// cases ../public resolves to backend/public. If it does not exist (the frontend
// has not been built yet), the app still starts with just the API.
const PUBLIC_PATH = path.resolve(__dirname, '..', 'public');

@Module({
  imports: [
    // First: registers the global guard that protects everything that comes
    // after it. If credentials are missing in production, startup blows up
    // here on purpose (see readAuthConfig).
    AuthModule.forRoot(),
    DatabaseModule.forRoot({ dbPath: defaultDbPath() }),
    ImporterModule,
    QueryModule,
    SrsModule,
    TranslationModule,
    PendingModule,
    HealthModule,
    ...(fs.existsSync(PUBLIC_PATH)
      ? [
          ServeStaticModule.forRoot({
            rootPath: PUBLIC_PATH,
            exclude: ['/api/{*splat}'],
            serveStaticOptions: {
              // Angular bundles carry a hash in their name (immutable),
              // but index.html does not: without this the browser keeps the
              // old version of the app after every build.
              setHeaders: (res, filePath) => {
                if (filePath.endsWith('index.html')) {
                  res.setHeader('Cache-Control', 'no-cache');
                }
              },
            },
          }),
        ]
      : []),
  ],
})
export class AppModule {}
