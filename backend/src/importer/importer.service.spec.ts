import Database from 'better-sqlite3';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runMigrations } from '../database/migrations';
import { PendingRepository } from '../pending/pending.repository';
import { isTestRow } from './elicitation';
import { ImporterService } from './importer.service';
import { readTests } from './tests-csv';

const BOM = String.fromCharCode(0xfeff);
const U_DIAERESIS = String.fromCharCode(0x00fc); // ü — Word workaround for ʉ

const CSV_SENTENCES =
  BOM +
  'id,damana,espanol,estado,fuente\n' +
  'o1,"nʉnka kʉñingui gontka\nñingui tua ukurra",Dios hizo el agua,aprobado,lfb oraciones\n' +
  'o2,¿Zhinzhoma nanu? 42,¿Conoces? cuarenta y dos,revisar,lfb oraciones\n';

const CSV_PHRASES =
  BOM +
  'fuente,damana,espanol,notas\n' +
  "Prueba,shke'ta ukurra,anda ligero,\n" +
  `Prueba,bug${U_DIAERESIS}i we ugunga,en la casa de arriba,\n`;

const CSV_VOCABULARY =
  BOM +
  'espanol,damana,categoria,notas,fuente\n' +
  'agua,nʉnka,Otros,,diccionario wiwa\n' +
  'año,ñandua,Tiempo / días / clima,con ñ,diccionario wiwa\n';

const CSV_CONJUGATIONS =
  BOM +
  'damana,espanol,lema,fuente,notas\n' +
  'nujkunʉnanka,yo tuve,tener,VERBO TENER.docx,\n' +
  'mujkunʉnanka,tú tuviste,tener,VERBO TENER.docx,\n';

const ELICITATION_HEADERS = [
  'id', 'ambito', 'palabra_es', 'palabra_dm', 'ejemplo_es', 'ejemplo_dm', 'variante', 'notas',
];

// Ids are chosen with the same function the importer uses: that way the test
// does not depend on which specific ids fall in the 10% reserved for tests.
const IDS = Array.from({ length: 300 }, (_, i) => String(i + 1));
const TEST_ID = IDS.find(isTestRow)!;
const [ID_WATER, ID_NEIGHBOR, ID_PENGUIN, ID_HELLO, ID_YEARS] = IDS.filter((id) => !isTestRow(id));

const BATCH_1 = [
  [ID_WATER, 'naturaleza', 'agua', `n${U_DIAERESIS}nka`, 'El agua está fría.', `nu+nka se n${U_DIAERESIS}ka`, '', ''],
  [ID_NEIGHBOR, 'familia', 'vecina', '', 'Mi vecina cocina.', '', '', 'registrado antes: ? (confirmar)'],
  [ID_PENGUIN, 'otro', 'pingüino', 'pingüino', 'El pingüino nada.', 'pingüino senu', '', ''],
  [TEST_ID, 'casa', 'casa', 'Urraga', 'Mi casa es grande.', 'Ranzhe urraga aikuia', '', ''],
  [ID_HELLO, 'saludos', 'hola', 'Zungui', 'Hola, ¿cómo estás?', '', 'pregunta', ''],
  // Unfilled, but the vocabulary already has «año»: it must not be requested.
  [ID_YEARS, 'tiempo', 'años', '', 'Pasaron dos años.', '', '', ''],
];

const BATCH_2 = [
  [ID_NEIGHBOR, 'familia', 'vecina', 'anzhirru', 'Mi vecina cocina.', 'ranzhe anzhirru duzhi', '', ''],
];

async function writeExcel(
  filePath: string,
  sheets: { name: string; rows: (string | number)[][] }[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((row) => ws.addRow(row));
  }
  await workbook.xlsx.writeFile(filePath);
}

function writeCsvs(dir: string): void {
  fs.writeFileSync(path.join(dir, 'corpus_oraciones.csv'), CSV_SENTENCES, 'utf8');
  fs.writeFileSync(path.join(dir, 'corpus_frases_v2.csv'), CSV_PHRASES, 'utf8');
  fs.writeFileSync(path.join(dir, 'corpus_vocabulario_v3.csv'), CSV_VOCABULARY, 'utf8');
  fs.writeFileSync(path.join(dir, 'corpus_conjugaciones.csv'), CSV_CONJUGATIONS, 'utf8');
}

async function writeRules(dir: string): Promise<void> {
  await writeExcel(path.join(dir, 'reglas_damana.xlsx'), [
    {
      name: 'reglas',
      rows: [
        ['tipo de regla', 'forma (sufijo/partícula)', 'qué hace / significado', 'ejemplo: palabra base', 'ejemplo: palabra con la regla', 'traducción del ejemplo', 'notas'],
        ['sufijo', '-ndzina', 'pluraliza sustantivos', 'terrua (hombre)', 'terruandzina', 'hombres', ''],
        ['sufijo', '-nzhe', 'posesivo / "de"', 'Kunkujshina (Dios)', 'Kunkujshinanzhe', 'de Dios', 'confirmar'],
        ['', '', '', '', '', '', ''],
      ],
    },
    {
      name: 'nombres propios',
      rows: [
        ['como aparece en damana', 'nombre en español', '¿se escribe igual? (sí/no)', 'otras grafías vistas', 'notas'],
        ['Jehová', 'Jehová', 'sí', 'Jehova', ''],
        ['faraón', 'faraón', 'sí', 'Faraón', ''],
      ],
    },
  ]);
}

async function writeBatch(dir: string, name: string, rows: string[][]): Promise<void> {
  await writeExcel(path.join(dir, name), [
    { name: 'instrucciones', rows: [['LOTE DE PRUEBA'], ['Solo se llenan las columnas amarillas.']] },
    { name: 'elicitacion', rows: [ELICITATION_HEADERS, ...rows] },
  ]);
}

describe('ImporterService (corpus v3 + rules + elicitation)', () => {
  let dirTmp: string;
  let db: Database.Database;
  let service: ImporterService;

  beforeAll(async () => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
    writeCsvs(dirTmp);
    await writeRules(dirTmp);
    await writeBatch(dirTmp, 'formato_elicitacion_lote1.xlsx', BATCH_1);
  });

  afterAll(() => {
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    service = new ImporterService(db, new PendingRepository(db));
    // The tests CSV is regenerated per test: the importer writes it.
    fs.rmSync(path.join(dirTmp, 'pruebas_traduccion.csv'), { force: true });
  });

  afterEach(() => {
    db.close();
  });

  const rows = <T = any>(sql: string, ...params: unknown[]): T[] =>
    db.prepare(sql).all(...params) as T[];

  it('imports the counts from the CSVs, the rules, the names and the elicitation', async () => {
    const stats = await service.importAll(dirTmp);
    expect(stats.sentences).toBe(2 + 2); // CSV + elicitation (agua, pingüino); the test does not go in
    expect(stats.phrases).toBe(2);
    expect(stats.vocabulary).toBe(2 + 4); // CSV + agua, pingüino, casa, hola
    expect(stats.conjugations).toBe(2);
    expect(stats.rules).toBe(2);
    expect(stats.properNames).toBe(2);
    expect(stats.elicitation).toEqual({
      files: 1,
      rows: 6,
      vocabulary: 4,
      sentences: 2,
      tests: 1,
      pending: 1, // vecina (nothing filled in)
      resolved: 3, // agua, pingüino, casa
      // hola already has word_dm in the batch itself and «años» is in the CSV
      // as «año»: the speakers are not asked for them.
      coveredByVocabulary: 2,
      closedByVocabulary: 0,
      repeatedIds: 0,
    });
    expect(stats.testsInFile).toBe(1);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('fixes the Word ü to ʉ in the Damana of the CSVs and in the tokens', async () => {
    await service.importAll(dirTmp);
    const row = db.prepare('SELECT damana FROM phrases WHERE rowid = 2').get() as { damana: string };
    expect(row.damana).toBe('bugʉi we ugunga');
    const words = rows('SELECT DISTINCT normalized_word AS p FROM damana_tokens').map((f) => f.p);
    expect(words).toContain('bugʉi');
    expect(words).not.toContain('bugui');
  });

  it('in elicitation it converts ü and u+ to ʉ, but respects pingüino', async () => {
    await service.importAll(dirTmp);
    const agua = db.prepare("SELECT damana, category, source FROM vocabulary WHERE spanish = 'agua' AND source = 'elicitation'").get() as any;
    expect(agua).toMatchObject({ damana: 'nʉnka', category: 'naturaleza' });
    const sentence = db.prepare(`SELECT damana, spanish, source, domain, status FROM sentences WHERE external_id = ?`).get(`elic_${ID_WATER}`) as any;
    expect(sentence).toMatchObject({
      damana: 'nʉnka se nʉka',
      spanish: 'El agua está fría.',
      source: 'elicitation',
      domain: 'everyday',
      status: 'approved',
    });
    const pinguino = db.prepare("SELECT damana FROM vocabulary WHERE spanish = 'pingüino'").get() as any;
    expect(pinguino.damana).toBe('pingüino');
  });

  it('marks the domain: lfb → biblico, phrases and elicitation → cotidiano', async () => {
    await service.importAll(dirTmp);
    expect(rows("SELECT domain FROM sentences WHERE source LIKE 'lfb%'").map((f) => f.domain)).toEqual(['biblical', 'biblical']);
    expect(rows("SELECT domain FROM sentences WHERE source = 'elicitation'").map((f) => f.domain)).toEqual(['everyday', 'everyday']);
    expect(rows('SELECT domain FROM phrases').map((f) => f.domain)).toEqual(['everyday', 'everyday']);
  });

  it('imports the rules with their trigger and the proper names with their spellings', async () => {
    await service.importAll(dirTmp);
    expect(rows('SELECT form, meaning, trigger_feature, rule_example FROM rules ORDER BY rowid')).toEqual([
      { form: '-ndzina', meaning: 'pluraliza sustantivos', trigger_feature: 'plural', rule_example: 'terruandzina' },
      { form: '-nzhe', meaning: 'posesivo / "de"', trigger_feature: 'possessive', rule_example: 'Kunkujshinanzhe' },
    ]);
    expect(rows('SELECT damana, spanish, same_spelling, other_spellings FROM proper_names ORDER BY rowid')).toEqual([
      { damana: 'Jehová', spanish: 'Jehová', same_spelling: 1, other_spellings: 'Jehova' },
      { damana: 'faraón', spanish: 'faraón', same_spelling: 1, other_spellings: 'Faraón' },
    ]);
  });

  it('reserves the test row in pruebas_traduccion.csv and leaves it out of the sentences', async () => {
    await service.importAll(dirTmp);
    expect(readTests(dirTmp)).toEqual([
      { spanish: 'Mi casa es grande.', expectedDamana: 'Ranzhe urraga aikuia', scope: 'casa' },
    ]);
    expect(rows("SELECT 1 FROM sentences WHERE damana = 'Ranzhe urraga aikuia'")).toHaveLength(0);
    // the word does go into the dictionary: the test measures composition, not lexicon
    expect(rows("SELECT damana FROM vocabulary WHERE spanish = 'casa'")).toEqual([{ damana: 'Urraga' }]);
    // and the file carries a BOM and CRLF like the rest of the project's CSVs
    const rawText = fs.readFileSync(path.join(dirTmp, 'pruebas_traduccion.csv'), 'utf8');
    expect(rawText.charCodeAt(0)).toBe(0xfeff);
    expect(rawText).toContain('\r\n');
  });

  it('unfilled rows stay as pending elicitation items, without duplicating on re-import', async () => {
    await service.importAll(dirTmp);
    await service.importAll(dirTmp);
    // hola carries word_dm in the batch itself and «años» is already in the
    // vocabulary as «año»: the speakers are asked for neither.
    expect(rows('SELECT word, status, origin, context, times_requested FROM pending_items ORDER BY word')).toEqual([
      { word: 'vecina', status: 'pending', origin: 'elicitation', context: 'Mi vecina cocina.', times_requested: 1 },
    ]);
  });

  it('a later batch that fills in the row closes the pending item and wins by id (idempotent by id)', async () => {
    await service.importAll(dirTmp);
    await writeBatch(dirTmp, 'formato_elicitacion_lote2.xlsx', BATCH_2);
    try {
      const stats = await service.importAll(dirTmp);
      expect(stats.elicitation.files).toBe(2);
      expect(stats.elicitation.repeatedIds).toBe(1);
      expect(stats.elicitation.pending).toBe(0); // vecina has arrived; hola and años are covered
      expect(stats.elicitation.coveredByVocabulary).toBe(2);
      expect(db.prepare("SELECT status FROM pending_items WHERE word = 'vecina'").get()).toEqual({ status: 'resolved' });
      expect(rows("SELECT damana FROM vocabulary WHERE spanish = 'vecina'")).toEqual([{ damana: 'anzhirru' }]);
      expect(rows(`SELECT damana FROM sentences WHERE external_id = ?`, `elic_${ID_NEIGHBOR}`)).toEqual([{ damana: 'ranzhe anzhirru duzhi' }]);
    } finally {
      fs.rmSync(path.join(dirTmp, 'formato_elicitacion_lote2.xlsx'), { force: true });
    }
  });

  it('without reglas_damana.xlsx or elicitation batches it still imports (minimal corpus)', async () => {
    const minimalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-min-'));
    try {
      writeCsvs(minimalDir);
      const stats = await service.importAll(minimalDir);
      expect(stats.rules).toBe(0);
      expect(stats.properNames).toBe(0);
      expect(stats.elicitation.files).toBe(0);
      expect(stats.sentences).toBe(2);
      expect(readTests(minimalDir)).toEqual([]);
    } finally {
      fs.rmSync(minimalDir, { recursive: true, force: true });
    }
  });

  it('stores id_externo and estado of the sentences (multi-line cells intact)', async () => {
    await service.importAll(dirTmp);
    const csv = rows('SELECT external_id, damana, status FROM sentences WHERE external_id LIKE ? ORDER BY rowid', 'o%');
    expect(csv[0].external_id).toBe('o1');
    expect(csv[0].status).toBe('approved');
    expect(csv[0].damana).toContain('\n');
    expect(csv[1].status).toBe('review');
  });

  it('tokenizes all sources keeping ʉ and ñ', async () => {
    await service.importAll(dirTmp);
    const origins = rows('SELECT DISTINCT source_table AS t FROM damana_tokens ORDER BY t').map((f) => f.t);
    expect(origins).toEqual(['conjugations', 'phrases', 'sentences', 'vocabulary']);
    const words = rows('SELECT DISTINCT normalized_word AS p FROM damana_tokens').map((f) => f.p);
    expect(words).toContain('nʉnka');
    expect(words).toContain('ñingui');
    expect(words).not.toContain('nunka');
    expect(words).not.toContain('ningui');
  });

  it('is idempotent: importing twice leaves the same statistics', async () => {
    const first = await service.importAll(dirTmp);
    const second = await service.importAll(dirTmp);
    expect(second).toEqual(first);
  });

  it('does not touch translations, SRS progress, validated pairs or translator pending items on re-import', async () => {
    db.prepare(
      `INSERT INTO translations
         (created_at, text, translation, direction, top_score, mean_score,
          top_source, retrieved_examples, doubtful_words, vocabulary_used, model)
       VALUES ('2026-07-20T10:00:00.000Z', 'nʉnka', 'es', 'damana_to_spanish',
               0.9, 0.4, 'sentences', 8, '[]', '[]', 'test-model')`,
    ).run();
    db.prepare(
      `INSERT INTO srs_progress (word, repetitions, ease_factor, interval_days, next_review, updated_at)
       VALUES ('nʉnka', 2, 2.5, 6, '2026-07-01T00:00:00.000Z', '2026-06-25T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO validated_pairs (created_at, spanish, damana, direction, origin, model_translation)
       VALUES ('2026-10-01T00:00:00.000Z', 'el agua', 'nʉnka', 'spanish_to_damana', 'confirmed', 'nʉnka')`,
    ).run();
    new PendingRepository(db).recordRequested('ñame', 'spanish', 'quiero ñame');

    await service.importAll(dirTmp);

    expect(db.prepare('SELECT text FROM translations').get()).toEqual({ text: 'nʉnka' });
    expect(db.prepare("SELECT repetitions FROM srs_progress WHERE word = 'nʉnka'").get()).toEqual({ repetitions: 2 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM validated_pairs').get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT times_requested, origin FROM pending_items WHERE word = 'ñame'").get()).toEqual({ times_requested: 1, origin: 'translator' });
  });

  it('closes open pending items the vocabulary already covers (Spanish and Damana) and leaves the rest', async () => {
    const repo = new PendingRepository(db);
    repo.recordRequested('aguas', 'spanish', 'las aguas del río'); // plural of «agua», which is in the CSV
    repo.recordRequested('ñame', 'spanish', 'quiero ñame'); // not anywhere
    repo.recordRequested('nʉnka', 'damana', 'nʉnka gontka'); // the Damana form of «agua»
    repo.recordRequested('nunka', 'damana', 'nunka'); // u ≠ ʉ: not the same word

    const stats = await service.importAll(dirTmp);

    expect(stats.elicitation.closedByVocabulary).toBe(2);
    const status = (p: string) => (db.prepare('SELECT status FROM pending_items WHERE word = ?').get(p) as { status: string }).status;
    expect(status('aguas')).toBe('resolved');
    expect(status('nʉnka')).toBe('resolved');
    expect(status('ñame')).toBe('pending');
    expect(status('nunka')).toBe('pending');
    // and the «años» row of the batch was never recorded
    expect(db.prepare("SELECT COUNT(*) AS n FROM pending_items WHERE word = 'años'").get()).toEqual({ n: 0 });
  });
});
