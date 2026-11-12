import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { QueryModule } from '../consulta/consulta.module';
import { DatabaseModule } from '../database/database.module';
import { readTests } from '../importador/pruebas-csv';
import { resolveDataDir, defaultDbPath } from '../importador/rutas-datos';
import { TranslationDirection } from '../traduccion/dto/traduccion.dto';
import { TranslationModule } from '../traduccion/traduccion.module';
import { TranslationService } from '../traduccion/traduccion.service';
import {
  buildReport,
  evaluateTest,
  reportBaseName,
  failedTest,
  EvaluatedTest,
  renderMarkdown,
} from './evaluador';

// Own CLI module: it does not drag in HTTP controllers or static files.
@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: defaultDbPath() }),
    QueryModule,
    TranslationModule,
  ],
})
class EvaluateCliModule {}

/** The /evaluaciones folder lives next to /datos, at the repo root. */
export function evaluationsDir(dataDir: string): string {
  return path.resolve(dataDir, '..', 'evaluaciones');
}

/** --pausa <ms>: wait between translations (free Groq allows ~4 per minute). */
function readPause(argv: string[]): number {
  const i = argv.indexOf('--pausa');
  if (i === -1) return 0;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function readLimit(argv: string[]): number | undefined {
  const i = argv.indexOf('--limite');
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
      `No hay pruebas en ${path.join(dataDir, 'pruebas_traduccion.csv')}.\n` +
        'Se llena solo al importar lotes de elicitación con ejemplos completos ' +
        '(1 de cada 10 filas) o añadiendo filas a mano: espanol,damana_esperado,ambito.',
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
      'No hay motor de traducción configurado (TRADUCTOR_BASE_URL + TRADUCTOR_MODELO o ANTHROPIC_API_KEY).',
    );
    await app.close();
    process.exit(1);
  }

  console.log(
    `Evaluando ${testCases.length} pruebas con ${config.proveedor} · ${config.modelo}` +
      (pause ? ` (pausa de ${pause} ms entre llamadas)` : '') +
      '…',
  );
  const results: EvaluatedTest[] = [];
  for (const [i, testCase] of testCases.entries()) {
    if (i > 0 && pause > 0) await new Promise((r) => setTimeout(r, pause));
    try {
      const response = await translator.translate(
        { texto: testCase.espanol, direccion: TranslationDirection.espanol_a_damana },
        { registrar: false },
      );
      const evaluated = evaluateTest(testCase, response);
      results.push(evaluated);
      console.log(
        `${String(i + 1).padStart(3)}. ${evaluated.exacta ? '✓' : ' '} chrF ${evaluated.chrf.toFixed(2)}  ${testCase.espanol}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(failedTest(testCase, message));
      console.log(`${String(i + 1).padStart(3)}. ✗ ERROR ${message}  ${testCase.espanol}`);
    }
  }

  const date = new Date();
  const report = buildReport(results, {
    fecha: date,
    proveedor: config.proveedor,
    modelo: config.modelo,
  });
  const folder = evaluationsDir(dataDir);
  fs.mkdirSync(folder, { recursive: true });
  const base = path.join(folder, reportBaseName(date, config.modelo));
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(`${base}.md`, renderMarkdown(report), 'utf8');

  console.log('\n=== Resultado por ámbito ===');
  console.table(
    [...report.porAmbito, report.total].map((r) => ({
      ambito: r.ambito,
      pruebas: r.pruebas,
      'exactas %': r.porcentajeExactas.toFixed(1),
      'chrF medio': r.chrfMedio.toFixed(3),
      'sin equiv. %': r.porcentajeSinEquivalente.toFixed(1),
      errores: r.errores,
    })),
  );
  console.log(`\nInforme guardado en:\n  ${base}.md\n  ${base}.json`);
  await app.close();
}

// Only runs as a CLI; importing it from a test executes nothing.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
