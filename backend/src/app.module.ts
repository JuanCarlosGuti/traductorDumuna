import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import { AuthModule } from './auth/auth.module';
import { ConsultaModule } from './consulta/consulta.module';
import { DatabaseModule } from './database/database.module';
import { ImportadorModule } from './importador/importador.module';
import { rutaDbPorDefecto } from './importador/rutas-datos';
import { PendientesModule } from './pendientes/pendientes.module';
import { SaludModule } from './salud/salud.module';
import { SrsModule } from './srs/srs.module';
import { TraduccionModule } from './traduccion/traduccion.module';

// backend/public: where the frontend leaves its build (npm run build -w frontend).
// In dev __dirname is backend/src and compiled it is backend/dist; in both
// cases ../public resolves to backend/public. If it does not exist (the frontend
// has not been built yet), the app still starts with just the API.
const RUTA_PUBLICO = path.resolve(__dirname, '..', 'public');

@Module({
  imports: [
    // First: registers the global guard that protects everything that comes
    // after it. If credentials are missing in production, startup blows up
    // here on purpose (see leerConfigAuth).
    AuthModule.forRoot(),
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    ImportadorModule,
    ConsultaModule,
    SrsModule,
    TraduccionModule,
    PendientesModule,
    SaludModule,
    ...(fs.existsSync(RUTA_PUBLICO)
      ? [
          ServeStaticModule.forRoot({
            rootPath: RUTA_PUBLICO,
            exclude: ['/api/{*splat}'],
            serveStaticOptions: {
              // Angular bundles carry a hash in their name (immutable),
              // but index.html does not: without this the browser keeps the
              // old version of the app after every build.
              setHeaders: (res, ruta) => {
                if (ruta.endsWith('index.html')) {
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
