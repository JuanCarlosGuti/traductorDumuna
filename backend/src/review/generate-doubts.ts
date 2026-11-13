import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { QueryModule } from '../query/query.module';
import { CorpusRepository } from '../query/corpus.repository';
import { DatabaseModule } from '../database/database.module';
import { resolveDataDir, defaultDbPath } from '../importer/data-paths';
import { DoubtsService } from './doubts.service';
import { buildDoubtsWorkbook } from './doubts-workbook';
import { PARADIGMS_FILE, buildParadigmsWorkbook, PARADIGMS } from './paradigms';

// Own CLI module: read-only over the already imported corpus.
@Module({
  imports: [DatabaseModule.forRoot({ dbPath: defaultDbPath() }), QueryModule],
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

  console.log('\n=== Doubts to clear up with the native speakers ===');
  console.log(`1 spelling (same word, several spellings):     ${report.spelling.length} groups`);
  console.log(`2 same meaning (Spanish → several Damana):     ${report.synonyms.length} groups`);
  console.log(`3 several meanings (Damana → several):        ${report.polysemy.length} groups`);
  console.log(`     of which only the accent changes:        ${report.polysemy.filter((g) => g.accentOnly).length}`);
  console.log(`4 entries to clear up:                         ${report.doubtful.length}`);
  console.log(`5 frequent endings:                            ${report.endings.length}`);
  console.log(`\nDocumento: ${doubtsPath}`);

  // The grammar batch is not regenerated if it already exists: it may be filled in.
  const paradigmsPath = path.join(dataDir, PARADIGMS_FILE);
  if (fs.existsSync(paradigmsPath)) {
    console.log(`Grammar batch: already exists and is left untouched (${paradigmsPath})`);
  } else {
    await buildParadigmsWorkbook().xlsx.writeFile(paradigmsPath);
    console.log(`Grammar batch: ${PARADIGMS.length} sentences in ${paradigmsPath}`);
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
