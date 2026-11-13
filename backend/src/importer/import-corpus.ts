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
  console.log(`Importing corpus from: ${dataDir}`);
  const stats = await app.get(ImporterService).importAll(dataDir);
  const e = stats.elicitation;

  console.log('\n=== Import completed ===');
  console.log(`Sentences:        ${stats.sentences}`);
  console.log(`Phrases:          ${stats.phrases}`);
  console.log(`Vocabulary:       ${stats.vocabulary}`);
  console.log(`Conjugations:     ${stats.conjugations}`);
  console.log(`Rules:            ${stats.rules}`);
  console.log(`Proper names:     ${stats.properNames}`);
  console.log(
    `Elicitation:      ${e.files} file(s), ${e.rows} rows → ` +
      `${e.vocabulary} words, ${e.sentences} sentences, ${e.tests} reserved tests, ` +
      `${e.pending} pending, ${e.resolved} resolved` +
      (e.coveredByVocabulary ? `, ${e.coveredByVocabulary} already in the vocabulary (not requested)` : '') +
      (e.repeatedIds ? `, ${e.repeatedIds} repeated ids (the last batch won)` : ''),
  );
  if (e.closedByVocabulary) {
    console.log(`Pending items closed because the vocabulary already covers them: ${e.closedByVocabulary}`);
  }
  console.log(`Tests (CSV):      ${stats.testsInFile}`);
  console.log(`Tokens:           ${stats.totalTokens}`);
  console.log('\nTop 20 most frequent Damana words:');
  console.table(stats.topWords);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
