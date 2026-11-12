import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { BusquedaService } from '../consulta/busqueda.service';
import { CorpusRepository } from '../consulta/corpus.repository';
import { FrecuenciasService } from '../consulta/frecuencias.service';
import { PalabraService } from '../consulta/palabra.service';
import { RetrievalService } from '../consulta/retrieval.service';
import { ejecutarMigraciones } from '../database/migraciones';
import { Calificacion } from './sm2';
import { SrsService } from './srs.service';

describe('SrsService', () => {
  let db: Database.Database;
  let servicio: SrsService;
  const dia0 = new Date('2026-07-08T10:00:00.000Z');
  const dias = (n: number) => new Date(dia0.getTime() + n * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
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
    servicio = new SrsService(
      db,
      repo,
      new FrecuenciasService(repo),
      new PalabraService(repo, new BusquedaService(repo, new RetrievalService(repo))),
    );
  });

  afterEach(() => db.close());

  it('no progress: serves the vocabulary first as new cards', () => {
    const estado = servicio.siguiente(dia0);
    expect(estado.tarjeta).toMatchObject({
      palabra: 'nʉnka',
      tipo: 'vocabulario',
      traduccion: 'agua',
      repeticiones: 0,
    });
    expect(estado.pendientes).toBe(0);
    // 2 from vocabulary + 2 frequent (gontka, nanu)
    expect(estado.nuevas).toBe(4);
  });

  it('frequent words carry candidate translations as the back', () => {
    servicio.responder('nʉnka', Calificacion.bien, dia0);
    servicio.responder('ñingui', Calificacion.bien, dia0);
    const estado = servicio.siguiente(dia0);
    expect(estado.tarjeta!.palabra).toBe('gontka');
    expect(estado.tarjeta!.tipo).toBe('frecuencia');
    expect(estado.tarjeta!.traduccion).toContain('hizo'); // 'esto'/'aqui' are candidates too
  });

  it('answering "bien" schedules the review and the card is due the next day', () => {
    const r = servicio.responder('nʉnka', Calificacion.bien, dia0);
    expect(r.intervaloDias).toBe(1);

    // Just answered: no longer pending today
    expect(servicio.siguiente(dia0).pendientes).toBe(0);
    // The next day it is due and comes back first
    const manana = servicio.siguiente(dias(1.1));
    expect(manana.pendientes).toBe(1);
    expect(manana.tarjeta!.palabra).toBe('nʉnka');
    expect(manana.tarjeta!.repeticiones).toBe(1);
  });

  it('"otra vez" makes the card due immediately (case with ñ)', () => {
    servicio.responder('ñingui', Calificacion.otra_vez, dia0);
    const estado = servicio.siguiente(dia0);
    expect(estado.pendientes).toBe(1);
    expect(estado.tarjeta!.palabra).toBe('ñingui');
  });

  it('prioritizes the oldest overdue card', () => {
    servicio.responder('nʉnka', Calificacion.bien, dia0); // due day 1
    servicio.responder('ñingui', Calificacion.bien, dias(0.5)); // due day 1.5
    const estado = servicio.siguiente(dias(2));
    expect(estado.pendientes).toBe(2);
    expect(estado.tarjeta!.palabra).toBe('nʉnka');
  });

  it('rejects words outside the deck', () => {
    expect(() =>
      servicio.responder('inexistente', Calificacion.bien, dia0),
    ).toThrow(NotFoundException);
  });

  it('progress survives a re-import (DELETE of corpus tables)', () => {
    servicio.responder('nʉnka', Calificacion.bien, dia0);
    db.exec('DELETE FROM tokens_damana'); // what the importer does
    const fila = db
      .prepare('SELECT repeticiones FROM progreso_srs WHERE palabra = ?')
      .get('nʉnka') as { repeticiones: number };
    expect(fila.repeticiones).toBe(1);
  });
});
