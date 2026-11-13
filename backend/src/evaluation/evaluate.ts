import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { QueryModule } from '../query/query.module';
import { DatabaseModule } from '../database/database.module';
import { readTests } from '../importer/tests-csv';
import { resolveDataDir, defaultDbPath } from '../importer/data-paths';
import { TranslationDirection } from '../translation/dto/translation.dto';
import { TranslationModule } from '../translation/translation.module';
import { TranslationService } from '../translation/translation.service';
import {
  buildReport,
  evaluateTest,
  reportBaseName,
  failedTest,
  EvaluatedTest,
  renderMarkdown,
} from './evaluator';

// Own CLI module: it does not drag in HTTP controllers or static files.
@Module({
  imports: [
    DatabaseModule.forRoot({ dbPath: defaultDbPath() }),
    QueryModule,
    TranslationModule,
  ],
})
class EvaluateCliModule {}

/** The /evaluations folder lives next to /data, at the repo root. */
export function evaluationsDir(dataDir: string): string {
  return path.resolve(dataDir, '..', 'evaluations');
}

/** --pause <ms>: wait between translations (free Groq allows ~4 per minute). */
function readPause(argv: string[]): number {
  const i = argv.indexOf('--pause');
  if (i === -1) return 0;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function readLimit(argv: string[]): number | undefined {
  const i = argv.indexOf('--limit');
  if (i === -1) return undefined;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir();
  const all = readTests(dataDir);
  const limit = readLimit(process.argv);
  const pause = readPause(process.argv);
  const testCases = limit ? all.slice(0, limit) : all;

  if (testCases.length === 0) {
    console.log(
      `There are no tests in ${path.join(dataDir, 'pruebas_traduccion.csv')}.\n` +
        'It fills itself when importing elicitation batches with complete examples ' +
        '(1 in every 10 rows) or by adding rows by hand: espanol,damana_esperado,ambito.',
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(EvaluateCliModule, {
    logger: ['error', 'warn'],
  });
  const translator = app.get(TranslationService);
  const config = translator.configuration();
  if (!translator.available()) {
    console.error(
      'No translation engine configured (TRANSLATOR_BASE_URL + TRANSLATOR_MODEL or ANTHROPIC_API_KEY).',
    );
    await app.close();
    process.exit(1);
  }

  console.log(
    `Evaluating ${testCases.length} tests with ${config.provider} · ${config.model}` +
      (pause ? ` (${pause} ms pause between calls)` : '') +
      '…',
  );
  const results: EvaluatedTest[] = [];
  for (const [i, testCase] of testCases.entries()) {
    if (i > 0 && pause > 0) await new Promise((r) => setTimeout(r, pause));
    try {
      const response = await translator.translate(
        { text: testCase.spanish, direction: TranslationDirection.spanish_to_damana },
        { record: false },
      );
      const evaluated = evaluateTest(testCase, response);
      results.push(evaluated);
      console.log(
        `${String(i + 1).padStart(3)}. ${evaluated.exact ? '✓' : ' '} chrF ${evaluated.chrf.toFixed(2)}  ${testCase.spanish}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(failedTest(testCase, message));
      console.log(`${String(i + 1).padStart(3)}. ✗ ERROR ${message}  ${testCase.spanish}`);
    }
  }

  const date = new Date();
  const report = buildReport(results, {
    date,
    provider: config.provider,
    model: config.model,
  });
  const folder = evaluationsDir(dataDir);
  fs.mkdirSync(folder, { recursive: true });
  const base = path.join(folder, reportBaseName(date, config.model));
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(`${base}.md`, renderMarkdown(report), 'utf8');

  console.log('\n=== Results by scope ===');
  console.table(
    [...report.byScope, report.total].map((r) => ({
      scope: r.scope,
      tests: r.tests,
      'exact %': r.exactPercent.toFixed(1),
      'mean chrF': r.meanChrf.toFixed(3),
      'no equiv. %': r.withoutEquivalentPercent.toFixed(1),
      errors: r.errors,
    })),
  );
  console.log(`\nReport saved to:\n  ${base}.md\n  ${base}.json`);
  await app.close();
}

// Only runs as a CLI; importing it from a test executes nothing.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
