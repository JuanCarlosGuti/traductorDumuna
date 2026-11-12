import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { DatabaseModule } from '../database/database.module';
import { resolverDirDatos, rutaDbPorDefecto } from '../importador/rutas-datos';
import { NecesitoModule } from './necesito.module';
import { NecesitoService } from './necesito.service';

/** The speaker fills in the empty column of each file. */
export const ARCHIVO_ESPANOL = 'por_traducir_espanol.xlsx';
export const ARCHIVO_DAMANA = 'por_traducir_damana.xlsx';

// Own CLI module: it does not drag in HTTP controllers.
@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    NecesitoModule,
  ],
})
class NecesitoCliModule {}

interface ColumnaHoja {
  header: string;
  key: string;
  width: number;
}

async function escribirHoja(
  ruta: string,
  nombreHoja: string,
  columnas: ColumnaHoja[],
  filas: object[],
): Promise<void> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja);
  hoja.columns = columnas;

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true };
  encabezado.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE8F0' },
  };
  filas.forEach((f) => hoja.addRow(f));

  // Example sentences are long: they are wrapped and top-aligned.
  hoja.eachRow((fila, numero) => {
    if (numero === 1) return;
    fila.alignment = { vertical: 'top', wrapText: true };
  });
  hoja.getRow(1).alignment = { vertical: 'middle', wrapText: false };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: filas.length + 1, column: columnas.length },
  };

  await libro.xlsx.writeFile(ruta);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(NecesitoCliModule, {
    logger: ['error', 'warn'],
  });
  const servicio = app.get(NecesitoService);
  const dirDatos = resolverDirDatos();
  const hoy = new Date().toISOString().slice(0, 10);

  // 1) Spanish -> Damana
  const espanol = servicio.calcular(hoy);
  await escribirHoja(
    path.join(dirDatos, ARCHIVO_ESPANOL),
    'espanol por traducir',
    [
      { header: 'palabra en español', key: 'espanol', width: 22 },
      { header: 'palabra en damana', key: 'damana', width: 26 },
      { header: 'ejemplo en español', key: 'ejemploEspanol', width: 52 },
      { header: 'ejemplo en damana', key: 'ejemploDamana', width: 52 },
      { header: 'veces_visto', key: 'vecesVisto', width: 12 },
      { header: 'prioridad', key: 'prioridad', width: 10 },
    ],
    espanol,
  );

  // 2) Damana -> Spanish
  const damana = servicio.calcularDamana();
  await escribirHoja(
    path.join(dirDatos, ARCHIVO_DAMANA),
    'damana por traducir',
    [
      { header: 'palabra en damana', key: 'damana', width: 22 },
      { header: 'palabra en español', key: 'espanol', width: 26 },
      { header: 'ejemplo en damana', key: 'ejemploDamana', width: 52 },
      { header: 'ejemplo en español', key: 'ejemploEspanol', width: 52 },
      { header: 'veces_visto', key: 'vecesVisto', width: 12 },
    ],
    damana,
  );

  const prioridad1 = espanol.filter((f) => f.prioridad === 1).length;
  console.log('\n=== Listas de trabajo generadas ===');
  console.log(`${ARCHIVO_ESPANOL}: ${espanol.length} palabras españolas sin equivalente damana`);
  console.log(`   (${prioridad1} de traducciones tuyas con poco apoyo, el resto del corpus)`);
  console.log(`${ARCHIVO_DAMANA}:  ${damana.length} palabras damana sin traducción`);
  console.log(`\nCarpeta: ${dirDatos}`);
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
