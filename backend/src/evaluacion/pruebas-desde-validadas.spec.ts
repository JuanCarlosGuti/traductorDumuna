import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runMigrations } from '../database/migraciones';
import { TESTS_FILE, readTests } from '../importador/pruebas-csv';
import { TranslationDirection } from '../traduccion/dto/traduccion.dto';
import { NewValidated, ValidatedPair, ValidatedRepository } from '../traduccion/validadas.repository';
import { exportValidatedToTests, testsFromValidated } from './pruebas-desde-validadas';

const validatedPair = (id: number, spanish: string, damana: string): ValidatedPair => ({
  id,
  creadoEn: '2026-10-21T00:00:00.000Z',
  espanol: spanish,
  damana,
  direccion: TranslationDirection.espanol_a_damana,
  origen: 'confirmada',
  traduccionModelo: null,
});

describe('testsFromValidated', () => {
  it('each pair is a test in the «validadas» scope, without extra spaces and without empty sides', () => {
    expect(
      testsFromValidated([
        validatedPair(1, ' mi mamá cocina ', 'Ranzhe abu dugwa '),
        { ...validatedPair(2, 'otra vez', 'ñingui'), direccion: TranslationDirection.damana_a_espanol },
        validatedPair(3, 'vacía', '   '),
      ]),
    ).toEqual([
      { espanol: 'mi mamá cocina', damanaEsperado: 'Ranzhe abu dugwa', ambito: 'validadas' },
      { espanol: 'otra vez', damanaEsperado: 'ñingui', ambito: 'validadas' },
    ]);
  });
});

describe('exportValidatedToTests', () => {
  let db: Database.Database;
  let dir: string;
  const newItem = (spanish: string, damana: string): NewValidated => ({
    espanol: spanish,
    damana,
    direccion: TranslationDirection.espanol_a_damana,
    origen: 'corregida',
    traduccionModelo: 'lo que dijo el modelo',
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

    expect(exportValidatedToTests(db, dir)).toEqual({ validadas: 3, agregadas: 2, total: 2 });
    expect(exportValidatedToTests(db, dir)).toEqual({ validadas: 3, agregadas: 0, total: 2 });
    expect(readTests(dir)).toEqual([
      { espanol: 'no tengo agua', damanaEsperado: 'Nʉjkʉnanun nʉnka', ambito: 'validadas' },
      { espanol: 'otra vez', damanaEsperado: 'ñingui', ambito: 'validadas' },
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

    expect(exportValidatedToTests(db, dir)).toEqual({ validadas: 2, agregadas: 1, total: 2 });
    expect(readTests(dir)).toEqual([
      { espanol: 'agua', damanaEsperado: 'nʉnka', ambito: 'casa' },
      { espanol: 'año nuevo', damanaEsperado: 'kʉgui ñi', ambito: 'validadas' },
    ]);
  });
});
