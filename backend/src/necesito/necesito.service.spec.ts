import Database from 'better-sqlite3';
import { CorpusRepository } from '../consulta/corpus.repository';
import { runMigrations } from '../database/migraciones';
import { TranslationsRepository } from '../traduccion/traducciones.repository';
import { MissingWordsService } from './necesito.service';

const TODAY = '2026-07-28';

describe('MissingWordsService', () => {
  let db: Database.Database;
  let service: MissingWordsService;

  const insertSentence = (damana: string, spanish: string, status = 'aprobado') =>
    db
      .prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
         VALUES ('x', ?, ?, ?, 'lfb')`,
      )
      .run(damana, spanish, status);

  const insertTranslation = (
    text: string,
    translation: string,
    direction: string,
    meanScore: number,
    topSource: string | null,
    examples: number,
  ) =>
    db
      .prepare(
        `INSERT INTO traducciones
           (creado_en, texto, traduccion, direccion, puntaje_top, puntaje_medio,
            fuente_top, ejemplos_recuperados, palabras_dudosas, vocabulario_usado, modelo)
         VALUES ('2026-07-28T10:00:00.000Z', ?, ?, ?, 0.5, ?, ?, ?, '[]', '[]', 'm')`,
      )
      .run(text, translation, direction, meanScore, topSource, examples);

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', NULL, NULL, 'dic')`,
    ).run();
    const repo = new CorpusRepository(db);
    service = new MissingWordsService(repo, new TranslationsRepository(db));
  });

  afterEach(() => db.close());

  it('lists corpus words that are not in the glossary, by frequency', () => {
    insertSentence('a b c', 'pueblo pueblo montaña');
    insertSentence('d e', 'pueblo casa');
    const rows = service.compute(TODAY);
    expect(rows.map((f) => f.espanol)).toEqual(['pueblo', 'casa', 'montaña']);
    expect(rows[0]).toMatchObject({
      espanol: 'pueblo',
      damana: '',
      motivo: 'en_corpus_sin_glosario',
      prioridad: 2,
      vecesVisto: 3,
      fecha: TODAY,
    });
  });

  it('excludes what is already in the glossary, stopwords and keyboard noise', () => {
    insertSentence('x', 'el agua de la zzzz montaña');
    const words = service.compute(TODAY).map((f) => f.espanol);
    expect(words).toContain('montaña');
    expect(words).not.toContain('agua'); // already in the glossary
    expect(words).not.toContain('el'); // stopword
    expect(words).not.toContain('zzzz'); // no vowels
  });

  it('excludes probable proper names (initial capital only)', () => {
    insertSentence('a', 'Jesús llegó');
    insertSentence('b', 'Jesús habló');
    const words = service.compute(TODAY).map((f) => f.espanol);
    expect(words).not.toContain('jesús');
    expect(words).toContain('llegó');
  });

  it('excludes words that are written the same in Damana (case with ʉ)', () => {
    // 'nʉnka' is in the Damana glossary and also appears as a Damana token
    db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES ('ciudad', 'ciudad', 'oraciones', 1, 0)`,
    ).run();
    insertSentence('ciudad guma', 'ciudad grande');
    const words = service.compute(TODAY).map((f) => f.espanol);
    expect(words).not.toContain('ciudad'); // written the same in Damana
    expect(words).toContain('grande');
  });

  it('ignores sentences marked «revisar» (doubtful alignment)', () => {
    insertSentence('a', 'fiable', 'aprobado');
    insertSentence('b', 'dudosa', 'revisar');
    const words = service.compute(TODAY).map((f) => f.espanol);
    expect(words).toContain('fiable');
    expect(words).not.toContain('dudosa');
  });

  it('prioritizes words from poorly supported translations over corpus ones', () => {
    insertSentence('x', 'pueblo pueblo pueblo pueblo pueblo'); // very frequent
    // Translation with no example at all → revisar level
    insertTranslation('quiero sanar', 'x', 'espanol_a_damana', 0, null, 0);
    const rows = service.compute(TODAY);
    expect(rows[0].prioridad).toBe(1);
    expect(['quiero', 'sanar']).toContain(rows[0].espanol);
    expect(rows[0].motivo).toBe('traduccion_con_poco_apoyo');
    // 'pueblo' is still there, but later
    expect(rows.find((f) => f.espanol === 'pueblo')?.prioridad).toBe(2);
  });

  it('does NOT prioritize translations that did have good support', () => {
    insertTranslation('sanar', 'x', 'espanol_a_damana', 0.55, 'oraciones', 8);
    expect(service.compute(TODAY)).toEqual([]);
  });

  it('counts the times a word was requested in different translations', () => {
    insertTranslation('sanar rápido', 'x', 'espanol_a_damana', 0, null, 0);
    insertTranslation('sanar pronto', 'y', 'espanol_a_damana', 0, null, 0);
    const sanitize = service.compute(TODAY).find((f) => f.espanol === 'sanar');
    expect(sanitize?.vecesVisto).toBe(2);
  });

  it('respects the row cap', () => {
    insertSentence('x', 'una dos tres cuatro cinco seis siete ocho nueve');
    expect(service.compute(TODAY, 3)).toHaveLength(3);
  });

  it('accompanies each word with an example sentence in both languages', () => {
    insertSentence('nʉnka gontka shkua', 'el agua hizo montaña');
    const row = service.compute(TODAY).find((f) => f.espanol === 'montaña');
    expect(row?.ejemploEspanol).toBe('el agua hizo montaña');
    expect(row?.ejemploDamana).toBe('nʉnka gontka shkua');
  });
});

describe('MissingWordsService.calcularDamana', () => {
  let db: Database.Database;
  let service: MissingWordsService;

  const token = (word: string, original: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      db.prepare(
        `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
         VALUES (?, ?, 'oraciones', 1, ?)`,
      ).run(word, original, i);
    }
  };

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o1', 'gontka nʉnka Jehovága zhaguasheka', 'hizo el agua', 'aprobado', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', NULL, NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('zhaguasheka', 'él acechó', 'acechar', 'doc', NULL)`,
    ).run();
    token('gontka', 'gontka', 3);
    token('nʉnka', 'nʉnka', 5); // already in the glossary
    token('jehovaga', 'Jehovága', 4); // always capitalized
    token('zhaguasheka', 'zhaguasheka', 2); // already has a gloss in conjugaciones
    const repo = new CorpusRepository(db);
    service = new MissingWordsService(repo, new TranslationsRepository(db));
  });

  afterEach(() => db.close());

  it('proposes Damana words without a translation, by frequency', () => {
    const rows = service.computeDamana();
    expect(rows.map((f) => f.damana)).toEqual(['gontka']);
    expect(rows[0]).toMatchObject({
      damana: 'gontka',
      espanol: '', // the column the speaker fills in
      vecesVisto: 3,
      ejemploDamana: 'gontka nʉnka Jehovága zhaguasheka',
      ejemploEspanol: 'hizo el agua',
    });
  });

  it('excludes what is already in the glossary (case with ʉ), conjugations and proper names', () => {
    const words = service.computeDamana().map((f) => f.damana);
    expect(words).not.toContain('nʉnka'); // in the glossary
    expect(words).not.toContain('zhaguasheka'); // already has a gloss
    expect(words).not.toContain('jehovaga'); // proper name
  });

  it('respects the row cap', () => {
    token('otra', 'otra', 1);
    expect(service.computeDamana(1)).toHaveLength(1);
  });
});
