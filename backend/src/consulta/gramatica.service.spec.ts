import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { CorpusRepository } from './corpus.repository';
import { GramaticaService } from './gramatica.service';

describe('GramaticaService', () => {
  let db: Database.Database;
  let servicio: GramaticaService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    const ins = db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES (?, ?, ?, ?, ?)`,
    );
    ins.run('nujkunʉnanka', 'yo tuve', 'tener', 'VERBO TENER.docx', 'con ʉ');
    ins.run('mujkunʉnanka', 'tú tuviste', 'tener', 'VERBO TENER.docx', null);
    ins.run('ñingunka', 'él volvió', 'volver', 'VERBO VOLVER.docx', 'con ñ');
    servicio = new GramaticaService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('lists lemmas in alphabetical order with their number of forms', () => {
    expect(servicio.lemas()).toEqual([
      { lema: 'tener', formas: 2 },
      { lema: 'volver', formas: 1 },
    ]);
  });

  it('returns the conjugation table of a lemma (forms with ʉ intact)', () => {
    const tabla = servicio.tablaDe('tener');
    expect(tabla.lema).toBe('tener');
    expect(tabla.conjugaciones).toHaveLength(2);
    expect(tabla.conjugaciones[0]).toMatchObject({
      damana: 'nujkunʉnanka',
      espanol: 'yo tuve',
      notas: 'con ʉ',
    });
  });

  it('keeps the ñ in the forms (case with ñ)', () => {
    expect(servicio.tablaDe('volver').conjugaciones[0].damana).toBe('ñingunka');
  });

  it('throws 404 for a lemma without conjugations', () => {
    expect(() => servicio.tablaDe('inexistente')).toThrow(NotFoundException);
  });
});
