import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { QueryModule } from '../consulta/consulta.module';
import { CorpusRepository } from '../consulta/corpus.repository';
import { DatabaseModule } from '../database/database.module';
import { resolveDataDir, defaultDbPath } from '../importador/rutas-datos';
import { DoubtsService } from './dudas.service';
import { buildDoubtsWorkbook } from './libro-dudas';
import { PARADIGMS_FILE, buildParadigmsWorkbook, PARADIGMS } from './paradigmas';

// Own CLI module: read-only over the already imported corpus.
@Module({
  imports: [DatabaseModule.forRoot({ rutaDb: defaultDbPath() }), QueryModule],
})
class DoubtsCliModule {}

export function doubtsFile(date: Date): string {
  return `dudas_para_hablantes_${date.toISOString().slice(0, 10)}.xlsx`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DoubtsCliModule, {
    logger: ['error', 'warn'],
  });
  const dataDir = resolveDataDir();
  const today = new Date();

  const report = new DoubtsService(app.get(CorpusRepository)).generate();
  const doubtsPath = path.join(dataDir, doubtsFile(today));
  await buildDoubtsWorkbook(report, today).xlsx.writeFile(doubtsPath);

  console.log('\n=== Dudas para aclarar con hablantes ===');
  console.log(`1 escritura (misma palabra, varias grafías):   ${report.escritura.length} grupos`);
  console.log(`2 mismo significado (español → varias damana): ${report.sinonimos.length} grupos`);
  console.log(`3 varios significados (damana → varios):       ${report.polisemia.length} grupos`);
  console.log(`     de ellos, solo cambia la tilde:           ${report.polisemia.filter((g) => g.soloTilde).length}`);
  console.log(`4 entradas por aclarar:                        ${report.dudosas.length}`);
  console.log(`5 terminaciones frecuentes:                    ${report.terminaciones.length}`);
  console.log(`\nDocumento: ${doubtsPath}`);

  // The grammar batch is not regenerated if it already exists: it may be filled in.
  const paradigmsPath = path.join(dataDir, PARADIGMS_FILE);
  if (fs.existsSync(paradigmsPath)) {
    console.log(`Lote de gramática: ya existe y no se toca (${paradigmsPath})`);
  } else {
    await buildParadigmsWorkbook().xlsx.writeFile(paradigmsPath);
    console.log(`Lote de gramática: ${PARADIGMS.length} oraciones en ${paradigmsPath}`);
  }

  await app.close();
}

// Only runs as a CLI; importing it from a test executes nothing.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
