import Database from 'better-sqlite3';
import { CorpusRepository } from '../query/corpus.repository';
import { runMigrations } from '../database/migrations';
import { TranslationsRepository } from '../translation/translations.repository';
import { MissingWordsService } from './missing-words.service';

const TODAY = '2026-07-28';

describe('MissingWordsService', () => {
  let db: Database.Database;
  let service: MissingWordsService;

  const insertSentence = (damana: string, spanish: string, status = 'approved') =>
    db
      .prepare(
        `INSERT INTO sentences (external_id, damana, spanish, status, source)
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
        `INSERT INTO translations
           (created_at, text, translation, direction, top_score, mean_score,
            top_source, retrieved_examples, doubtful_words, vocabulary_used, model)
         VALUES ('2026-07-28T10:00:00.000Z', ?, ?, ?, 0.5, ?, ?, ?, '[]', '[]', 'm')`,
      )
      .run(text, translation, direction, meanScore, topSource, examples);

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO vocabulary (spanish, damana, category, notes, source)
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
    expect(rows.map((f) => f.spanish)).toEqual(['pueblo', 'casa', 'montaña']);
    expect(rows[0]).toMatchObject({
      spanish: 'pueblo',
      damana: '',
      reason: 'in_corpus_without_glossary',
      priority: 2,
      timesSeen: 3,
      date: TODAY,
    });
  });

  it('excludes what is already in the glossary, stopwords and keyboard noise', () => {
    insertSentence('x', 'el agua de la zzzz montaña');
    const words = service.compute(TODAY).map((f) => f.spanish);
    expect(words).toContain('montaña');
    expect(words).not.toContain('agua'); // already in the glossary
    expect(words).not.toContain('el'); // stopword
    expect(words).not.toContain('zzzz'); // no vowels
  });

  it('excludes probable proper names (initial capital only)', () => {
    insertSentence('a', 'Jesús llegó');
    insertSentence('b', 'Jesús habló');
    const words = service.compute(TODAY).map((f) => f.spanish);
    expect(words).not.toContain('jesús');
    expect(words).toContain('llegó');
  });

  it('excludes words that are written the same in Damana (case with ʉ)', () => {
    // 'nʉnka' is in the Damana glossary and also appears as a Damana token
    db.prepare(
      `INSERT INTO damana_tokens (normalized_word, original_word, source_table, source_id, position)
       VALUES ('ciudad', 'ciudad', 'sentences', 1, 0)`,
    ).run();
    insertSentence('ciudad guma', 'ciudad grande');
    const words = service.compute(TODAY).map((f) => f.spanish);
    expect(words).not.toContain('ciudad'); // written the same in Damana
    expect(words).toContain('grande');
  });

  it('ignores sentences marked «revisar» (doubtful alignment)', () => {
    insertSentence('a', 'fiable', 'approved');
    insertSentence('b', 'dudosa', 'review');
    const words = service.compute(TODAY).map((f) => f.spanish);
    expect(words).toContain('fiable');
    expect(words).not.toContain('dudosa');
  });

  it('prioritizes words from poorly supported translations over corpus ones', () => {
    insertSentence('x', 'pueblo pueblo pueblo pueblo pueblo'); // very frequent
    // Translation with no example at all → review level
    insertTranslation('quiero sanar', 'x', 'spanish_to_damana', 0, null, 0);
    const rows = service.compute(TODAY);
    expect(rows[0].priority).toBe(1);
    expect(['quiero', 'sanar']).toContain(rows[0].spanish);
    expect(rows[0].reason).toBe('translation_with_little_support');
    // 'pueblo' is still there, but later
    expect(rows.find((f) => f.spanish === 'pueblo')?.priority).toBe(2);
  });

  it('does NOT prioritize translations that did have good support', () => {
    insertTranslation('sanar', 'x', 'spanish_to_damana', 0.55, 'sentences', 8);
    expect(service.compute(TODAY)).toEqual([]);
  });

  it('counts the times a word was requested in different translations', () => {
    insertTranslation('sanar rápido', 'x', 'spanish_to_damana', 0, null, 0);
    insertTranslation('sanar pronto', 'y', 'spanish_to_damana', 0, null, 0);
    const sanitize = service.compute(TODAY).find((f) => f.spanish === 'sanar');
    expect(sanitize?.timesSeen).toBe(2);
  });

  it('respects the row cap', () => {
    insertSentence('x', 'una dos tres cuatro cinco seis siete ocho nueve');
    expect(service.compute(TODAY, 3)).toHaveLength(3);
  });

  it('accompanies each word with an example sentence in both languages', () => {
    insertSentence('nʉnka gontka shkua', 'el agua hizo montaña');
    const row = service.compute(TODAY).find((f) => f.spanish === 'montaña');
    expect(row?.spanishExample).toBe('el agua hizo montaña');
    expect(row?.damanaExample).toBe('nʉnka gontka shkua');
  });
});

describe('MissingWordsService.calcularDamana', () => {
  let db: Database.Database;
  let service: MissingWordsService;

  const token = (word: string, original: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      db.prepare(
        `INSERT INTO damana_tokens (normalized_word, original_word, source_table, source_id, position)
         VALUES (?, ?, 'sentences', 1, ?)`,
      ).run(word, original, i);
    }
  };

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO sentences (external_id, damana, spanish, status, source)
       VALUES ('o1', 'gontka nʉnka Jehovága zhaguasheka', 'hizo el agua', 'approved', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulary (spanish, damana, category, notes, source)
       VALUES ('agua', 'nʉnka', NULL, NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugations (damana, spanish, lemma, source, notes)
       VALUES ('zhaguasheka', 'él acechó', 'acechar', 'doc', NULL)`,
    ).run();
    token('gontka', 'gontka', 3);
    token('nʉnka', 'nʉnka', 5); // already in the glossary
    token('jehovaga', 'Jehovága', 4); // always capitalized
    token('zhaguasheka', 'zhaguasheka', 2); // already has a gloss in conjugations
    const repo = new CorpusRepository(db);
    service = new MissingWordsService(repo, new TranslationsRepository(db));
  });

  afterEach(() => db.close());

  it('proposes Damana words without a translation, by frequency', () => {
    const rows = service.computeDamana();
    expect(rows.map((f) => f.damana)).toEqual(['gontka']);
    expect(rows[0]).toMatchObject({
      damana: 'gontka',
      spanish: '', // the column the speaker fills in
      timesSeen: 3,
      damanaExample: 'gontka nʉnka Jehovága zhaguasheka',
      spanishExample: 'hizo el agua',
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
