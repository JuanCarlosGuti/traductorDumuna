import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { DatabaseModule } from '../database/database.module';
import { resolverDirDatos, rutaDbPorDefecto } from '../importador/rutas-datos';
import { NecesitoModule } from './necesito.module';
import { FilaNecesito, NecesitoService } from './necesito.service';

export const ARCHIVO_SALIDA = 'por_traducir_auto.xlsx';

// Módulo CLI propio: no arrastra controladores HTTP.
@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    NecesitoModule,
  ],
})
class NecesitoCliModule {}

/** Escribe el .xlsx con el mismo formato que los otros por_traducir_*.xlsx. */
export async function escribirExcel(filas: FilaNecesito[], ruta: string): Promise<void> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('por traducir');

  hoja.columns = [
    { header: 'espanol', key: 'espanol', width: 22 },
    { header: 'damana', key: 'damana', width: 26 },
    { header: 'motivo', key: 'motivo', width: 28 },
    { header: 'prioridad', key: 'prioridad', width: 11 },
    { header: 'veces_visto', key: 'vecesVisto', width: 13 },
    { header: 'fecha', key: 'fecha', width: 13 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE8F0' },
  };
  filas.forEach((f) => hoja.addRow(f));

  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: 'A1', to: `F${filas.length + 1}` };

  await libro.xlsx.writeFile(ruta);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(NecesitoCliModule, {
    logger: ['error', 'warn'],
  });

  const hoy = new Date().toISOString().slice(0, 10);
  const filas = app.get(NecesitoService).calcular(hoy);
  const ruta = path.join(resolverDirDatos(), ARCHIVO_SALIDA);
  await escribirExcel(filas, ruta);

  const porPrioridad = filas.reduce<Record<number, number>>((acc, f) => {
    acc[f.prioridad] = (acc[f.prioridad] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n=== ${ARCHIVO_SALIDA} generado ===`);
  console.log(`Ruta:   ${ruta}`);
  console.log(`Filas:  ${filas.length}`);
  console.log(`  prioridad 1 (uso real con poco apoyo): ${porPrioridad[1] ?? 0}`);
  console.log(`  prioridad 2 (corpus sin glosario):     ${porPrioridad[2] ?? 0}`);
  console.log('\nPrimeras 10:');
  filas.slice(0, 10).forEach((f, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${f.espanol.padEnd(18)} [p${f.prioridad}] visto ${f.vecesVisto}`,
    );
  });
  console.log(
    '\nLlena la columna "damana" y luego ejecuta: npm run necesito:aplicar',
  );

  await app.close();
}

// Solo corre como CLI; al importarlo desde un test no ejecuta nada.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
