import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { ImporterModule } from './importer.module';
import { ImporterService } from './importer.service';
import { resolveDataDir, defaultDbPath } from './data-paths';

// Own CLI module: the importer does not drag in HTTP controllers.
@Module({
  imports: [
    DatabaseModule.forRoot({ dbPath: defaultDbPath() }),
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
  const e = stats.elicitation;

  console.log('\n=== Importación completada ===');
  console.log(`Oraciones:        ${stats.sentences}`);
  console.log(`Frases:           ${stats.phrases}`);
  console.log(`Vocabulario:      ${stats.vocabulary}`);
  console.log(`Conjugaciones:    ${stats.conjugations}`);
  console.log(`Reglas:           ${stats.rules}`);
  console.log(`Nombres propios:  ${stats.properNames}`);
  console.log(
    `Elicitación:      ${e.files} archivo(s), ${e.rows} filas → ` +
      `${e.vocabulary} palabras, ${e.sentences} oraciones, ${e.tests} pruebas reservadas, ` +
      `${e.pending} pendientes, ${e.resolved} resueltas` +
      (e.coveredByVocabulary ? `, ${e.coveredByVocabulary} ya en el vocabulario (no se piden)` : '') +
      (e.repeatedIds ? `, ${e.repeatedIds} ids repetidos (ganó el último lote)` : ''),
  );
  if (e.closedByVocabulary) {
    console.log(`Pendientes cerradas porque el vocabulario ya las cubre: ${e.closedByVocabulary}`);
  }
  console.log(`Pruebas (CSV):    ${stats.testsInFile}`);
  console.log(`Tokens:           ${stats.totalTokens}`);
  console.log('\nTop 20 palabras damana más frecuentes:');
  console.table(stats.topWords);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
