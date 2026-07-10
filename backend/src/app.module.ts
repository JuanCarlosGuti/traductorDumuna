import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaModule } from './consulta/consulta.module';
import { DatabaseModule } from './database/database.module';
import { ImportadorModule } from './importador/importador.module';
import { rutaDbPorDefecto } from './importador/rutas-datos';
import { SrsModule } from './srs/srs.module';
import { TraduccionModule } from './traduccion/traduccion.module';

// backend/public: ahí deja su build el frontend (npm run build -w frontend).
// En dev __dirname es backend/src y compilado es backend/dist; en ambos
// casos ../public resuelve a backend/public. Si no existe (aún no se
// construyó el frontend), la app arranca igual solo con la API.
const RUTA_PUBLICO = path.resolve(__dirname, '..', 'public');

@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    ImportadorModule,
    ConsultaModule,
    SrsModule,
    TraduccionModule,
    ...(fs.existsSync(RUTA_PUBLICO)
      ? [
          ServeStaticModule.forRoot({
            rootPath: RUTA_PUBLICO,
            exclude: ['/api/{*splat}'],
            serveStaticOptions: {
              // Los bundles de Angular llevan hash en el nombre (inmutables),
              // pero index.html no: sin esto el navegador se queda con la
              // versión vieja de la app tras cada build.
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
