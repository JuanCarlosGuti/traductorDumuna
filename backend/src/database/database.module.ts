import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { DB_CONNECTION, DatabaseOptions } from './database.constants';
import { runMigrations } from './migraciones';

@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DB_CONNECTION,
          useFactory: (): Database.Database => {
            const db = new Database(options.rutaDb);
            if (options.rutaDb !== ':memory:') {
              db.pragma('journal_mode = WAL');
            }
            runMigrations(db);
            return db;
          },
        },
      ],
      exports: [DB_CONNECTION],
    };
  }

  constructor(
    @Inject(DB_CONNECTION) private readonly db: Database.Database,
  ) {}

  onApplicationShutdown(): void {
    if (this.db.open) {
      this.db.close();
    }
  }
}
