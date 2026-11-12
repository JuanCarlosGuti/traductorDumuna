import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { SearchService } from '../consulta/busqueda.service';
import { CorpusRepository } from '../consulta/corpus.repository';
import { FrequenciesService } from '../consulta/frecuencias.service';
import { WordService } from '../consulta/palabra.service';
import { RetrievalService } from '../consulta/retrieval.service';
import { runMigrations } from '../database/migraciones';
import { Grade } from './sm2';
import { SrsService } from './srs.service';

describe('SrsService', () => {
  let db: Database.Database;
  let service: SrsService;
  const day0 = new Date('2026-07-08T10:00:00.000Z');
  const days = (n: number) => new Date(day0.getTime() + n * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    // Vocabulary: entries with ʉ and with ñ
    db.prepare(
      "INSERT INTO vocabulario (espanol, damana, notas) VALUES ('agua', 'nʉnka', NULL)",
    ).run();
    db.prepare(
      "INSERT INTO vocabulario (espanol, damana, notas) VALUES ('otra vez', 'ñingui', NULL)",
    ).run();
    // Phrase so that 'gontka' exists as a frequent word with a parallel
    db.prepare(
      "INSERT INTO frases (fuente, damana, espanol, notas) VALUES ('Prueba', 'gontka nanu', 'hizo esto aqui', NULL)",
    ).run();
    const insToken = db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, 'frases', 1, ?)`,
    );
    insToken.run('gontka', 'gontka', 0);
    insToken.run('gontka', 'gontka', 1);
    insToken.run('nanu', 'nanu', 2);

    const repo = new CorpusRepository(db);
    service = new SrsService(
      db,
      repo,
      new FrequenciesService(repo),
      new WordService(repo, new SearchService(repo, new RetrievalService(repo))),
    );
  });

  afterEach(() => db.close());

  it('no progress: serves the vocabulary first as new cards', () => {
    const status = service.nextCard(day0);
    expect(status.tarjeta).toMatchObject({
      palabra: 'nʉnka',
      tipo: 'vocabulario',
      traduccion: 'agua',
      repeticiones: 0,
    });
    expect(status.pendientes).toBe(0);
    // 2 from vocabulary + 2 frequent (gontka, nanu)
    expect(status.nuevas).toBe(4);
  });

  it('frequent words carry candidate translations as the back', () => {
    service.answer('nʉnka', Grade.bien, day0);
    service.answer('ñingui', Grade.bien, day0);
    const status = service.nextCard(day0);
    expect(status.tarjeta!.palabra).toBe('gontka');
    expect(status.tarjeta!.tipo).toBe('frecuencia');
    expect(status.tarjeta!.traduccion).toContain('hizo'); // 'esto'/'aqui' are candidates too
  });

  it('answering "bien" schedules the review and the card is due the next day', () => {
    const r = service.answer('nʉnka', Grade.bien, day0);
    expect(r.intervaloDias).toBe(1);

    // Just answered: no longer pending today
    expect(service.nextCard(day0).pendientes).toBe(0);
    // The next day it is due and comes back first
    const tomorrow = service.nextCard(days(1.1));
    expect(tomorrow.pendientes).toBe(1);
    expect(tomorrow.tarjeta!.palabra).toBe('nʉnka');
    expect(tomorrow.tarjeta!.repeticiones).toBe(1);
  });

  it('"otra vez" makes the card due immediately (case with ñ)', () => {
    service.answer('ñingui', Grade.otra_vez, day0);
    const status = service.nextCard(day0);
    expect(status.pendientes).toBe(1);
    expect(status.tarjeta!.palabra).toBe('ñingui');
  });

  it('prioritizes the oldest overdue card', () => {
    service.answer('nʉnka', Grade.bien, day0); // due day 1
    service.answer('ñingui', Grade.bien, days(0.5)); // due day 1.5
    const status = service.nextCard(days(2));
    expect(status.pendientes).toBe(2);
    expect(status.tarjeta!.palabra).toBe('nʉnka');
  });

  it('rejects words outside the deck', () => {
    expect(() =>
      service.answer('inexistente', Grade.bien, day0),
    ).toThrow(NotFoundException);
  });

  it('progress survives a re-import (DELETE of corpus tables)', () => {
    service.answer('nʉnka', Grade.bien, day0);
    db.exec('DELETE FROM tokens_damana'); // what the importer does
    const row = db
      .prepare('SELECT repeticiones FROM progreso_srs WHERE palabra = ?')
      .get('nʉnka') as { repeticiones: number };
    expect(row.repeticiones).toBe(1);
  });
});
