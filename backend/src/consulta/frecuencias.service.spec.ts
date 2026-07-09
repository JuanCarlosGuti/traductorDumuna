import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { CorpusRepository } from './corpus.repository';
import { FrecuenciasService } from './frecuencias.service';

describe('FrecuenciasService', () => {
  let db: Database.Database;
  let servicio: FrecuenciasService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    // Entrada de vocabulario con categoría para kʉnʉnka
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('tiene', 'kʉnʉnka', 'Verbos', NULL, 'diccionario wiwa')`,
    ).run();
    const ins = db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, 'frases', 1, ?)`,
    );
    // jehova: SOLO con mayúscula inicial → probable nombre propio
    ins.run('jehova', 'Jehová', 0);
    ins.run('jehova', 'Jehová', 1);
    ins.run('jehova', 'Jehová', 2);
    // nʉnka: minúscula (caso con ʉ) → se conserva
    ins.run('nʉnka', 'nʉnka', 3);
    ins.run('nʉnka', 'nʉnka', 4);
    // shkua: aparece capitalizada a inicio de oración Y en minúscula → se conserva
    ins.run('shkua', 'Shkua', 5);
    ins.run('shkua', 'shkua', 6);
    // ñandu: SOLO con Ñ mayúscula (caso con ñ) → probable nombre propio
    ins.run('ñandu', 'Ñandú', 7);
    // kʉnʉnka: en vocabulario con categoría Verbos
    ins.run('kʉnʉnka', 'kʉnʉnka', 8);
    servicio = new FrecuenciasService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('excluye probables nombres propios (solo con mayúscula inicial)', () => {
    const palabras = servicio.listar(500).map((f) => f.palabra);
    expect(palabras).not.toContain('jehova');
    expect(palabras).not.toContain('ñandu'); // la Ñ mayúscula también cuenta
    expect(palabras).toContain('nʉnka');
    expect(palabras).toContain('shkua');
  });

  it('ordena por frecuencia descendente', () => {
    const filas = servicio.listar(500);
    expect(filas[0]).toEqual({ palabra: 'nʉnka', frecuencia: 2, categoria: null });
    expect(filas[1]).toEqual({ palabra: 'shkua', frecuencia: 2, categoria: null });
  });

  it('trae la categoría del vocabulario cuando el damana coincide (caso con ʉ)', () => {
    const fila = servicio.listar(500).find((f) => f.palabra === 'kʉnʉnka');
    expect(fila).toEqual({ palabra: 'kʉnʉnka', frecuencia: 1, categoria: 'Verbos' });
  });

  it('respeta el límite', () => {
    expect(servicio.listar(1)).toHaveLength(1);
  });
});
