import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { CONEXION_DB, OpcionesDatabase } from './database.constants';
import { ejecutarMigraciones } from './migraciones';

@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  static forRoot(opciones: OpcionesDatabase): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: CONEXION_DB,
          useFactory: (): Database.Database => {
            const db = new Database(opciones.rutaDb);
            if (opciones.rutaDb !== ':memory:') {
              db.pragma('journal_mode = WAL');
            }
            ejecutarMigraciones(db);
            return db;
          },
        },
      ],
      exports: [CONEXION_DB],
    };
  }

  constructor(
    @Inject(CONEXION_DB) private readonly db: Database.Database,
  ) {}

  onApplicationShutdown(): void {
    if (this.db.open) {
      this.db.close();
    }
  }
}
