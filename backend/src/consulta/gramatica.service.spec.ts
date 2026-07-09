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

  it('lista los lemas en orden alfabético con su número de formas', () => {
    expect(servicio.lemas()).toEqual([
      { lema: 'tener', formas: 2 },
      { lema: 'volver', formas: 1 },
    ]);
  });

  it('devuelve la tabla de conjugación de un lema (formas con ʉ intactas)', () => {
    const tabla = servicio.tablaDe('tener');
    expect(tabla.lema).toBe('tener');
    expect(tabla.conjugaciones).toHaveLength(2);
    expect(tabla.conjugaciones[0]).toMatchObject({
      damana: 'nujkunʉnanka',
      espanol: 'yo tuve',
      notas: 'con ʉ',
    });
  });

  it('conserva la ñ en las formas (caso con ñ)', () => {
    expect(servicio.tablaDe('volver').conjugaciones[0].damana).toBe('ñingunka');
  });

  it('lanza 404 para un lema sin conjugaciones', () => {
    expect(() => servicio.tablaDe('inexistente')).toThrow(NotFoundException);
  });
});
