import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { ImporterModule } from './importer.module';
import { ImporterService } from './importer.service';
import { resolveDataDir, defaultDbPath } from './data-paths';

// Own CLI module: the importer does not drag in HTTP controllers.
@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: defaultDbPath() }),
    ImporterModule,
  ],
})
class ImportCliModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ImportCliModule, {
    logger: ['error', 'warn'],
  });

  const dataDir = resolveDataDir();
  console.log(`Importando corpus desde: ${dataDir}`);
  const stats = await app.get(ImporterService).importAll(dataDir);
  const e = stats.elicitacion;

  console.log('\n=== Importación completada ===');
  console.log(`Oraciones:        ${stats.oraciones}`);
  console.log(`Frases:           ${stats.frases}`);
  console.log(`Vocabulario:      ${stats.vocabulario}`);
  console.log(`Conjugaciones:    ${stats.conjugaciones}`);
  console.log(`Reglas:           ${stats.reglas}`);
  console.log(`Nombres propios:  ${stats.nombresPropios}`);
  console.log(
    `Elicitación:      ${e.archivos} archivo(s), ${e.filas} filas → ` +
      `${e.vocabulario} palabras, ${e.oraciones} oraciones, ${e.pruebas} pruebas reservadas, ` +
      `${e.pendientes} pendientes, ${e.resueltas} resueltas` +
      (e.cubiertasPorVocabulario ? `, ${e.cubiertasPorVocabulario} ya en el vocabulario (no se piden)` : '') +
      (e.idsRepetidos ? `, ${e.idsRepetidos} ids repetidos (ganó el último lote)` : ''),
  );
  if (e.cerradasPorVocabulario) {
    console.log(`Pendientes cerradas porque el vocabulario ya las cubre: ${e.cerradasPorVocabulario}`);
  }
  console.log(`Pruebas (CSV):    ${stats.pruebasEnArchivo}`);
  console.log(`Tokens:           ${stats.totalTokens}`);
  console.log('\nTop 20 palabras damana más frecuentes:');
  console.table(stats.topPalabras);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
