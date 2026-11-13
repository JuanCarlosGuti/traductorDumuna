import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import { CorpusRepository } from './corpus.repository';
import { GrammarService } from './grammar.service';

describe('GrammarService', () => {
  let db: Database.Database;
  let service: GrammarService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const ins = db.prepare(
      `INSERT INTO conjugations (damana, spanish, lemma, source, notes)
       VALUES (?, ?, ?, ?, ?)`,
    );
    ins.run('nujkunʉnanka', 'yo tuve', 'tener', 'VERBO TENER.docx', 'con ʉ');
    ins.run('mujkunʉnanka', 'tú tuviste', 'tener', 'VERBO TENER.docx', null);
    ins.run('ñingunka', 'él volvió', 'volver', 'VERBO VOLVER.docx', 'con ñ');
    service = new GrammarService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('lists lemmas in alphabetical order with their number of forms', () => {
    expect(service.lemmas()).toEqual([
      { lemma: 'tener', forms: 2 },
      { lemma: 'volver', forms: 1 },
    ]);
  });

  it('returns the conjugation table of a lemma (forms with ʉ intact)', () => {
    const table = service.tableOf('tener');
    expect(table.lemma).toBe('tener');
    expect(table.conjugations).toHaveLength(2);
    expect(table.conjugations[0]).toMatchObject({
      damana: 'nujkunʉnanka',
      spanish: 'yo tuve',
      notes: 'con ʉ',
    });
  });

  it('keeps the ñ in the forms (case with ñ)', () => {
    expect(service.tableOf('volver').conjugations[0].damana).toBe('ñingunka');
  });

  it('throws 404 for a lemma without conjugations', () => {
    expect(() => service.tableOf('inexistente')).toThrow(NotFoundException);
  });
});
