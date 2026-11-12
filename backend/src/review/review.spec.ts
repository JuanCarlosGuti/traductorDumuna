import Database from 'better-sqlite3';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CorpusRepository } from '../query/corpus.repository';
import { runMigrations } from '../database/migrations';
import { isTestRow, parseRow, planElicitation } from '../importer/elicitation';
import { readWorkbook } from '../importer/read-excel';
import { YELLOW, ELICITATION_COLUMNS } from '../pending/pending.service';
import { DoubtsService } from './doubts.service';
import { buildDoubtsWorkbook, DOUBT_SHEETS } from './doubts-workbook';
import { buildParadigmsWorkbook, PARADIGMS } from './paradigms';

const argb = (cell: ExcelJS.Cell) => (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

describe('DoubtsService + doubts workbook', () => {
  let db: Database.Database;
  let service: DoubtsService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const vocab = db.prepare(
      'INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES (?, ?, ?, ?, ?)',
    );
    vocab.run('Casa', 'Urraga', 'Casa', null, 'diccionario wiwa');
    vocab.run('Día', 'Dzuia', 'Tiempo', null, 'diccionario wiwa');
    vocab.run('Día', 'Dzwia', 'Tiempo', null, 'diccionario wiwa');
    vocab.run('Grande', 'Aikuia', 'Adjetivos', null, 'diccionario wiwa');
    vocab.run('Grande', 'Alkwega', 'Adjetivos', null, 'diccionario wiwa');
    vocab.run('Córtelo', 'Ako', 'Verbos', null, 'diccionario wiwa');
    vocab.run('lo cortó', 'Akó', 'Verbos', null, 'diccionario wiwa');
    vocab.run('tan', 'tan', 'Palabra frecuente', 'no hay forma para traducirlo', 'nativas 2026-10');
    const sentence = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
       VALUES (?, ?, ?, ?, 'lfb', 'biblico')`,
    );
    sentence.run('o1', 'Urragamba nʉnka ingui', 'Está en la casa otra vez', 'aprobado');
    sentence.run('o2', 'nʉnka aikuia', 'es grande', 'aprobado');
    sentence.run('o3', 'nunka ingui urragamba ñingui', 'no es otra vez en la casa algo', 'revisar');
    db.prepare(
      `INSERT INTO reglas (tipo, forma, significado, disparador) VALUES ('sufijo', '-nzhe', 'posesivo', 'posesivo')`,
    ).run();
    service = new DoubtsService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('gathers in one report the doubts about spelling, synonyms, meanings and entries', () => {
    const report = service.generate();

    const nunka = report.spelling.find((g) => g.forms.some((f) => f.form === 'nunka'))!;
    expect(nunka.forms.map((f) => [f.form, f.frequency])).toEqual([
      ['nʉnka', 2],
      ['nunka', 1],
    ]);
    // the example comes from a short approved sentence, never from a «revisar» one
    expect(nunka.forms[0].example).toEqual({ damana: 'nʉnka aikuia', spanish: 'es grande' });

    const day = report.spelling.find((g) => g.forms.some((f) => f.form === 'dzwia'))!;
    expect(day.type).toBe('w / u');
    expect(day.forms[0].meanings).toEqual(['Día']);

    expect(report.synonyms.map((g) => g.spanish)).toEqual(['Grande']);
    expect(report.synonyms[0].options.map((o) => [o.damana, o.frequency])).toEqual([
      ['Aikuia', 1],
      ['Alkwega', 0],
    ]);
    expect(report.polysemy).toEqual([expect.objectContaining({ key: 'ako', accentOnly: true })]);
    expect(report.doubtful.map((d) => d.entry.spanish)).toEqual(['tan']);
  });

  it('does not modify any corpus data', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM vocabulario').get();
    service.generate();
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulario').get()).toEqual(before);
    expect(db.prepare("SELECT damana FROM vocabulario WHERE espanol = 'tan'").get()).toEqual({ damana: 'tan' });
  });

  it('the workbook has one sheet per kind of doubt, with the answer cells in yellow', async () => {
    const workbook = buildDoubtsWorkbook(service.generate(), new Date('2026-10-05T12:00:00.000Z'));
    expect(workbook.worksheets.map((h) => h.name)).toEqual(Object.values(DOUBT_SHEETS));

    const spelling = workbook.getWorksheet(DOUBT_SHEETS.escritura)!;
    const nunkaRow = spelling
      .getRows(2, spelling.rowCount - 1)!
      .find((f) => f.getCell(3).value === 'nʉnka')!;
    expect(nunkaRow.getCell(5).value).toBe('nunka'); // ʉ and u, side by side
    expect(nunkaRow.getCell(4).value).toBe(2);
    expect(argb(nunkaRow.getCell(14))).toBe(YELLOW); // which is the correct form?
    expect(argb(nunkaRow.getCell(3))).toBeUndefined();

    const polysemy = workbook.getWorksheet(DOUBT_SHEETS.polisemia)!;
    expect(polysemy.getRow(2).getCell(5).value).toBe('solo cambia la tilde');

    // survives being saved and reopened
    const copy = new ExcelJS.Workbook();
    await copy.xlsx.load((await workbook.xlsx.writeBuffer()) as ExcelJS.Buffer);
    expect(copy.worksheets).toHaveLength(6);
    expect(copy.getWorksheet(DOUBT_SHEETS.instrucciones)!.getRow(1).getCell(1).value).toContain('2026-10-05');
  });
});

describe('grammar batch (paradigms)', () => {
  it('has unique and stable ids, with variants of the elicitation format', () => {
    expect(PARADIGMS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(PARADIGMS.map((p) => p.id)).size).toBe(PARADIGMS.length);
    expect(PARADIGMS[0]).toMatchObject({ id: 'g001', exampleEs: 'Yo como yuca.' });
    const variants = new Set(PARADIGMS.map((p) => p.variant));
    for (const v of variants) {
      expect(['', 'pasado', 'futuro', 'negativo', 'plural', 'pregunta']).toContain(v);
    }
    // covers the six features that trigger rules
    expect(variants.size).toBe(6);
  });

  it('the workbook is read with the same reader as the importer and only asks for ejemplo_dm', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paradigmas-'));
    try {
      const filePath = path.join(dir, 'formato_elicitacion_lote2_gramatica.xlsx');
      const workbook = buildParadigmsWorkbook();
      const sheet = workbook.getWorksheet('elicitacion')!;
      expect((sheet.getRow(1).values as string[]).slice(1)).toEqual([...ELICITATION_COLUMNS]);
      expect(argb(sheet.getRow(2).getCell(6))).toBe(YELLOW); // ejemplo_dm
      expect(argb(sheet.getRow(2).getCell(4))).toBeUndefined(); // palabra_dm is not requested
      await workbook.xlsx.writeFile(filePath);

      const parsed = (await readWorkbook(filePath)).find((h) => h.name === 'elicitacion')!;
      expect(parsed.rows).toHaveLength(PARADIGMS.length);
      expect(parsed.rows[0]).toMatchObject({ id: 'g001', ambito: 'gramatica', ejemplo_es: 'Yo como yuca.' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a filled row produces an everyday sentence and no word or pending item (with ʉ from u+)', () => {
    const normal = PARADIGMS.find((p) => !isTestRow(p.id))!;
    const row = parseRow(
      { id: normal.id, ambito: 'gramatica', palabra_es: '', palabra_dm: '', ejemplo_es: normal.exampleEs, ejemplo_dm: 'ra irrugwa zhu+nka', variante: normal.variant, notas: normal.label },
      'formato_elicitacion_lote2_gramatica.xlsx',
    )!;
    const plan = planElicitation([row]);
    expect(plan.sentences).toEqual([
      { externalId: `elic_${normal.id}`, damana: 'ra irrugwa zhʉnka', spanish: normal.exampleEs, source: 'elicitacion' },
    ]);
    expect(plan.vocabulary).toEqual([]);
    expect(plan.pending).toEqual([]);
  });

  it('unfilled it leaves nothing: neither sentences nor pending items', () => {
    const rows = PARADIGMS.map(
      (p) => parseRow({ id: p.id, ambito: 'gramatica', palabra_es: '', ejemplo_es: p.exampleEs }, 'x')!,
    );
    const plan = planElicitation(rows);
    expect(plan.sentences).toEqual([]);
    expect(plan.pending).toEqual([]);
    expect(plan.tests).toEqual([]);
  });
});
