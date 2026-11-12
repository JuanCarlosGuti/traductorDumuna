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
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o1', 'Ñingui nʉnka gontka nʉnka', 'Dios hizo el agua del cielo', 'aprobado', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', 'nʉnka nanu', 'agua fresca de aquí', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('ñingui', 'él volvió', 'volver', 'doc', NULL)`,
    ).run();
    const insToken = db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insToken.run('ñingui', 'Ñingui', 'oraciones', 1, 0);
    insToken.run('nʉnka', 'nʉnka', 'oraciones', 1, 1);
    insToken.run('gontka', 'gontka', 'oraciones', 1, 2);
    insToken.run('nʉnka', 'nʉnka', 'oraciones', 1, 3);
    insToken.run('nʉnka', 'nʉnka', 'frases', 1, 0);
    insToken.run('nanu', 'nanu', 'frases', 1, 1);
    insToken.run('nʉnka', 'nʉnka', 'vocabulario', 1, 0);
    insToken.run('ñingui', 'ñingui', 'conjugaciones', 1, 0);
    const repo = new CorpusRepository(db);
    service = new WordService(
      repo,
      new SearchService(repo, new RetrievalService(repo)),
    );
  });

  afterEach(() => db.close());

  it('computes total and per-source frequency (case with ʉ)', () => {
    const wordCard = service.wordCard('nʉnka');
    expect(wordCard.palabra).toBe('nʉnka');
    expect(wordCard.frecuenciaTotal).toBe(4);
    // GROUP BY tabla_origen with alphabetical ORDER BY
    expect(wordCard.frecuenciaPorFuente).toEqual([
      { fuente: 'frases', frecuencia: 1 },
      { fuente: 'oraciones', frecuencia: 2 },
      { fuente: 'vocabulario', frecuencia: 1 },
    ]);
  });

  it('normalizes the input token (Nʉnka → nʉnka)', () => {
    expect(service.wordCard('Nʉnka').palabra).toBe('nʉnka');
  });

  it('brings the direct translation from the vocabulary (case with ʉ)', () => {
    const wordCard = service.wordCard('nʉnka');
    expect(wordCard.entradasVocabulario).toEqual([
      { espanol: 'agua', categoria: 'Otros', notas: null, fuente: 'dic' },
    ]);
    expect(wordCard.formasVerbales).toEqual([]);
  });

  it('recognizes conjugated verb forms with their gloss and lemma (case with ñ)', () => {
    const wordCard = service.wordCard('ñingui');
    expect(wordCard.formasVerbales).toEqual([
      { damana: 'ñingui', espanol: 'él volvió', lema: 'volver' },
    ]);
    expect(wordCard.entradasVocabulario).toEqual([]);
  });

  it('word without vocabulary or conjugation: empty lists but candidates present', () => {
    const wordCard = service.wordCard('gontka');
    expect(wordCard.entradasVocabulario).toEqual([]);
    expect(wordCard.formasVerbales).toEqual([]);
    expect(wordCard.traduccionesCandidatas.length).toBeGreaterThan(0);
  });

  it('returns concordances with <mark>', () => {
    const wordCard = service.wordCard('nʉnka');
    expect(wordCard.concordancias.length).toBeGreaterThan(0);
    expect(wordCard.concordancias[0].fragmento).toContain('<mark>nʉnka</mark>');
  });

  it('proposes candidate translations excluding stopwords', () => {
    const wordCard = service.wordCard('nʉnka');
    const words = wordCard.traduccionesCandidatas.map((c) => c.palabra);
    // 'agua' co-occurs in sentence, phrase and vocabulary; 'el'/'de'/'del' are stopwords
    expect(wordCard.traduccionesCandidatas[0]).toEqual({ palabra: 'agua', coocurrencias: 3 });
    expect(words).not.toContain('el');
    expect(words).not.toContain('de');
    expect(words).not.toContain('del');
  });

  it('works with ñ and uses the Spanish of the sentence (case with ñ)', () => {
    const wordCard = service.wordCard('ñingui');
    expect(wordCard.frecuenciaTotal).toBe(2); // sentence + conjugation
    const words = wordCard.traduccionesCandidatas.map((c) => c.palabra);
    expect(words).toContain('agua'); // from the parallel 'Dios hizo el agua del cielo'
  });

  it('throws 404 for words that are not in the corpus', () => {
    expect(() => service.wordCard('inexistente')).toThrow(NotFoundException);
  });
});
