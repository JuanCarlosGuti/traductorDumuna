import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { DatabaseModule } from '../database/database.module';
import { resolveDataDir, defaultDbPath } from '../importer/data-paths';
import { MissingWordsModule } from './missing-words.module';
import { MissingWordsService } from './missing-words.service';

/** The speaker fills in the empty column of each file. */
export const SPANISH_FILE = 'por_traducir_espanol.xlsx';
export const DAMANA_FILE = 'por_traducir_damana.xlsx';

// Own CLI module: it does not drag in HTTP controllers.
@Module({
  imports: [
    DatabaseModule.forRoot({ dbPath: defaultDbPath() }),
    MissingWordsModule,
  ],
})
class MissingWordsCliModule {}

interface SheetColumn {
  header: string;
  key: string;
  width: number;
}

async function writeSheet(
  filePath: string,
  sheetName: string,
  columns: SheetColumn[],
  rows: object[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;

  const heading = sheet.getRow(1);
  heading.font = { bold: true };
  heading.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE8F0' },
  };
  rows.forEach((f) => sheet.addRow(f));

  // Example sentences are long: they are wrapped and top-aligned.
  sheet.eachRow((row, num) => {
    if (num === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
  });
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: false };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: columns.length },
  };

  await workbook.xlsx.writeFile(filePath);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MissingWordsCliModule, {
    logger: ['error', 'warn'],
  });
  const service = app.get(MissingWordsService);
  const dataDir = resolveDataDir();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Spanish -> Damana
  const spanish = service.compute(today);
  await writeSheet(
    path.join(dataDir, SPANISH_FILE),
    'espanol por traducir',
    [
      { header: 'palabra en español', key: 'spanish', width: 22 },
      { header: 'palabra en damana', key: 'damana', width: 26 },
      { header: 'ejemplo en español', key: 'spanishExample', width: 52 },
      { header: 'ejemplo en damana', key: 'damanaExample', width: 52 },
      { header: 'veces_visto', key: 'timesSeen', width: 12 },
      { header: 'prioridad', key: 'priority', width: 10 },
    ],
    spanish,
  );

  // 2) Damana -> Spanish
  const damana = service.computeDamana();
  await writeSheet(
    path.join(dataDir, DAMANA_FILE),
    'damana por traducir',
    [
      { header: 'palabra en damana', key: 'damana', width: 22 },
      { header: 'palabra en español', key: 'spanish', width: 26 },
      { header: 'ejemplo en damana', key: 'damanaExample', width: 52 },
      { header: 'ejemplo en español', key: 'spanishExample', width: 52 },
      { header: 'veces_visto', key: 'timesSeen', width: 12 },
    ],
    damana,
  );

  const priority1 = spanish.filter((f) => f.priority === 1).length;
  console.log('\n=== Listas de trabajo generadas ===');
  console.log(`${SPANISH_FILE}: ${spanish.length} palabras españolas sin equivalente damana`);
  console.log(`   (${priority1} de traducciones tuyas con poco apoyo, el resto del corpus)`);
  console.log(`${DAMANA_FILE}:  ${damana.length} palabras damana sin traducción`);
  console.log(`\nCarpeta: ${dataDir}`);
  console.log('\nRellena la columna vacía de cada archivo y luego ejecuta:');
  console.log('   npm run necesito:aplicar');

  await app.close();
}

// Only runs as a CLI; importing it from a test executes nothing.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
