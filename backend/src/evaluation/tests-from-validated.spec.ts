import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runMigrations } from '../database/migrations';
import { TESTS_FILE, readTests } from '../importer/tests-csv';
import { TranslationDirection } from '../translation/dto/translation.dto';
import { NewValidated, ValidatedPair, ValidatedRepository } from '../translation/validated.repository';
import { exportValidatedToTests, testsFromValidated } from './tests-from-validated';

const validatedPair = (id: number, spanish: string, damana: string): ValidatedPair => ({
  id,
  createdAt: '2026-10-21T00:00:00.000Z',
  spanish: spanish,
  damana,
  direction: TranslationDirection.espanol_a_damana,
  origin: 'confirmada',
  modelTranslation: null,
});

describe('testsFromValidated', () => {
  it('each pair is a test in the «validadas» scope, without extra spaces and without empty sides', () => {
    expect(
      testsFromValidated([
        validatedPair(1, ' mi mamá cocina ', 'Ranzhe abu dugwa '),
        { ...validatedPair(2, 'otra vez', 'ñingui'), direction: TranslationDirection.damana_a_espanol },
        validatedPair(3, 'vacía', '   '),
      ]),
    ).toEqual([
      { spanish: 'mi mamá cocina', expectedDamana: 'Ranzhe abu dugwa', scope: 'validadas' },
      { spanish: 'otra vez', expectedDamana: 'ñingui', scope: 'validadas' },
    ]);
  });
});

describe('exportValidatedToTests', () => {
  let db: Database.Database;
  let dir: string;
  const newItem = (spanish: string, damana: string): NewValidated => ({
    spanish: spanish,
    damana,
    direction: TranslationDirection.espanol_a_damana,
    origin: 'corregida',
    modelTranslation: 'lo que dijo el modelo',
  });

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pruebas-validadas-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds the pairs to the CSV without repeating (idempotent) and keeps ʉ and ñ', () => {
    const repo = new ValidatedRepository(db);
    repo.save(newItem('no tengo agua', 'Nʉjkʉnanun nʉnka'));
    repo.save(newItem('otra vez', 'ñingui'));
    repo.save(newItem('otra vez', 'ñingui')); // the same pair validated twice

    expect(exportValidatedToTests(db, dir)).toEqual({ validated: 3, added: 2, total: 2 });
    expect(exportValidatedToTests(db, dir)).toEqual({ validated: 3, added: 0, total: 2 });
    expect(readTests(dir)).toEqual([
      { spanish: 'no tengo agua', expectedDamana: 'Nʉjkʉnanun nʉnka', scope: 'validadas' },
      { spanish: 'otra vez', expectedDamana: 'ñingui', scope: 'validadas' },
    ]);
  });

  it('does not delete tests already in the CSV or duplicate a pair that was already a test', () => {
    fs.writeFileSync(
      path.join(dir, TESTS_FILE),
      '\ufeffespanol,damana_esperado,ambito\r\nagua,nʉnka,casa\r\n',
      'utf8',
    );
    const repo = new ValidatedRepository(db);
    repo.save(newItem('Agua', 'nʉnka')); // same pair as the existing test (capital aside)
    repo.save(newItem('año nuevo', 'kʉgui ñi'));

    expect(exportValidatedToTests(db, dir)).toEqual({ validated: 2, added: 1, total: 2 });
    expect(readTests(dir)).toEqual([
      { spanish: 'agua', expectedDamana: 'nʉnka', scope: 'casa' },
      { spanish: 'año nuevo', expectedDamana: 'kʉgui ñi', scope: 'validadas' },
    ]);
  });
});
