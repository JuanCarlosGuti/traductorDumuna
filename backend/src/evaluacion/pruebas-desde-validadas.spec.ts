import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ejecutarMigraciones } from '../database/migraciones';
import { ARCHIVO_PRUEBAS, leerPruebas } from '../importador/pruebas-csv';
import { DireccionTraduccion } from '../traduccion/dto/traduccion.dto';
import { NuevaValidada, Validada, ValidadasRepository } from '../traduccion/validadas.repository';
import { exportarValidadasAPruebas, pruebasDesdeValidadas } from './pruebas-desde-validadas';

const validada = (id: number, espanol: string, damana: string): Validada => ({
  id,
  creadoEn: '2026-10-21T00:00:00.000Z',
  espanol,
  damana,
  direccion: DireccionTraduccion.espanol_a_damana,
  origen: 'confirmada',
  traduccionModelo: null,
});

describe('pruebasDesdeValidadas', () => {
  it('cada par es una prueba del ámbito «validadas», sin espacios sobrantes y sin lados vacíos', () => {
    expect(
      pruebasDesdeValidadas([
        validada(1, ' mi mamá cocina ', 'Ranzhe abu dugwa '),
        { ...validada(2, 'otra vez', 'ñingui'), direccion: DireccionTraduccion.damana_a_espanol },
        validada(3, 'vacía', '   '),
      ]),
    ).toEqual([
      { espanol: 'mi mamá cocina', damanaEsperado: 'Ranzhe abu dugwa', ambito: 'validadas' },
      { espanol: 'otra vez', damanaEsperado: 'ñingui', ambito: 'validadas' },
    ]);
  });
});

describe('exportarValidadasAPruebas', () => {
  let db: Database.Database;
  let dir: string;
  const nueva = (espanol: string, damana: string): NuevaValidada => ({
    espanol,
    damana,
    direccion: DireccionTraduccion.espanol_a_damana,
    origen: 'corregida',
    traduccionModelo: 'lo que dijo el modelo',
  });

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pruebas-validadas-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('añade los pares al CSV sin repetir (idempotente) y conserva ʉ y ñ', () => {
    const repo = new ValidadasRepository(db);
    repo.guardar(nueva('no tengo agua', 'Nʉjkʉnanun nʉnka'));
    repo.guardar(nueva('otra vez', 'ñingui'));
    repo.guardar(nueva('otra vez', 'ñingui')); // el mismo par validado dos veces

    expect(exportarValidadasAPruebas(db, dir)).toEqual({ validadas: 3, agregadas: 2, total: 2 });
    expect(exportarValidadasAPruebas(db, dir)).toEqual({ validadas: 3, agregadas: 0, total: 2 });
    expect(leerPruebas(dir)).toEqual([
      { espanol: 'no tengo agua', damanaEsperado: 'Nʉjkʉnanun nʉnka', ambito: 'validadas' },
      { espanol: 'otra vez', damanaEsperado: 'ñingui', ambito: 'validadas' },
    ]);
  });

  it('no borra las pruebas que ya había en el CSV ni duplica un par que ya era prueba', () => {
    fs.writeFileSync(
      path.join(dir, ARCHIVO_PRUEBAS),
      '\ufeffespanol,damana_esperado,ambito\r\nagua,nʉnka,casa\r\n',
      'utf8',
    );
    const repo = new ValidadasRepository(db);
    repo.guardar(nueva('Agua', 'nʉnka')); // misma pareja que la prueba existente (mayúscula aparte)
    repo.guardar(nueva('año nuevo', 'kʉgui ñi'));

    expect(exportarValidadasAPruebas(db, dir)).toEqual({ validadas: 2, agregadas: 1, total: 2 });
    expect(leerPruebas(dir)).toEqual([
      { espanol: 'agua', damanaEsperado: 'nʉnka', ambito: 'casa' },
      { espanol: 'año nuevo', damanaEsperado: 'kʉgui ñi', ambito: 'validadas' },
    ]);
  });
});
