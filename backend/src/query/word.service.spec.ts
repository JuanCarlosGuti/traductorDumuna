import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import { SearchService } from './search.service';
import { CorpusRepository } from './corpus.repository';
import { WordService } from './word.service';
import { RetrievalService } from './retrieval.service';

describe('WordService', () => {
  let db: Database.Database;
  let service: WordService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    // Content: nʉnka appears in all three sources; ñingui only in sentences.
    db.prepare(
      `INSERT INTO sentences (external_id, damana, spanish, status, source)
       VALUES ('o1', 'Ñingui nʉnka gontka nʉnka', 'Dios hizo el agua del cielo', 'approved', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO phrases (source, damana, spanish, notes)
       VALUES ('Prueba', 'nʉnka nanu', 'agua fresca de aquí', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulary (spanish, damana, category, notes, source)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugations (damana, spanish, lemma, source, notes)
       VALUES ('ñingui', 'él volvió', 'volver', 'doc', NULL)`,
    ).run();
    const insToken = db.prepare(
      `INSERT INTO damana_tokens (normalized_word, original_word, source_table, source_id, position)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insToken.run('ñingui', 'Ñingui', 'sentences', 1, 0);
    insToken.run('nʉnka', 'nʉnka', 'sentences', 1, 1);
    insToken.run('gontka', 'gontka', 'sentences', 1, 2);
    insToken.run('nʉnka', 'nʉnka', 'sentences', 1, 3);
    insToken.run('nʉnka', 'nʉnka', 'phrases', 1, 0);
    insToken.run('nanu', 'nanu', 'phrases', 1, 1);
    insToken.run('nʉnka', 'nʉnka', 'vocabulary', 1, 0);
    insToken.run('ñingui', 'ñingui', 'conjugations', 1, 0);
    const repo = new CorpusRepository(db);
    service = new WordService(
      repo,
      new SearchService(repo, new RetrievalService(repo)),
    );
  });

  afterEach(() => db.close());

  it('computes total and per-source frequency (case with ʉ)', () => {
    const wordCard = service.wordCard('nʉnka');
    expect(wordCard.word).toBe('nʉnka');
    expect(wordCard.totalFrequency).toBe(4);
    // GROUP BY source_table with alphabetical ORDER BY
    expect(wordCard.frequencyBySource).toEqual([
      { source: 'phrases', frequency: 1 },
      { source: 'sentences', frequency: 2 },
      { source: 'vocabulary', frequency: 1 },
    ]);
  });

  it('normalizes the input token (Nʉnka → nʉnka)', () => {
    expect(service.wordCard('Nʉnka').word).toBe('nʉnka');
  });

  it('brings the direct translation from the vocabulary (case with ʉ)', () => {
    const wordCard = service.wordCard('nʉnka');
    expect(wordCard.vocabularyEntries).toEqual([
      { spanish: 'agua', category: 'Otros', notes: null, source: 'dic' },
    ]);
    expect(wordCard.verbForms).toEqual([]);
  });

  it('recognizes conjugated verb forms with their gloss and lemma (case with ñ)', () => {
    const wordCard = service.wordCard('ñingui');
    expect(wordCard.verbForms).toEqual([
      { damana: 'ñingui', spanish: 'él volvió', lemma: 'volver' },
    ]);
    expect(wordCard.vocabularyEntries).toEqual([]);
  });

  it('word without vocabulary or conjugation: empty lists but candidates present', () => {
    const wordCard = service.wordCard('gontka');
    expect(wordCard.vocabularyEntries).toEqual([]);
    expect(wordCard.verbForms).toEqual([]);
    expect(wordCard.candidateTranslations.length).toBeGreaterThan(0);
  });

  it('returns concordances with <mark>', () => {
    const wordCard = service.wordCard('nʉnka');
    expect(wordCard.concordances.length).toBeGreaterThan(0);
    expect(wordCard.concordances[0].fragment).toContain('<mark>nʉnka</mark>');
  });

  it('proposes candidate translations excluding stopwords', () => {
    const wordCard = service.wordCard('nʉnka');
    const words = wordCard.candidateTranslations.map((c) => c.word);
    // 'agua' co-occurs in sentence, phrase and vocabulary; 'el'/'de'/'del' are stopwords
    expect(wordCard.candidateTranslations[0]).toEqual({ word: 'agua', cooccurrences: 3 });
    expect(words).not.toContain('el');
    expect(words).not.toContain('de');
    expect(words).not.toContain('del');
  });

  it('works with ñ and uses the Spanish of the sentence (case with ñ)', () => {
    const wordCard = service.wordCard('ñingui');
    expect(wordCard.totalFrequency).toBe(2); // sentence + conjugation
    const words = wordCard.candidateTranslations.map((c) => c.word);
    expect(words).toContain('agua'); // from the parallel 'Dios hizo el agua del cielo'
  });

  it('throws 404 for words that are not in the corpus', () => {
    expect(() => service.wordCard('inexistente')).toThrow(NotFoundException);
  });
});
