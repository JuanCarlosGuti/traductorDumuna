import Database from 'better-sqlite3';
import { Idioma } from '../consulta/consulta.enums';
import { CorpusRepository } from '../consulta/corpus.repository';
import { ejecutarMigraciones } from '../database/migraciones';
import { PESO_REVISAR, RetrievalService } from './retrieval.service';

describe('RetrievalService (corpus v3)', () => {
  let db: Database.Database;
  let servicio: RetrievalService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    const insOracion = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES (?, ?, ?, ?, 'lfb')`,
    );
    // Mismo texto damana con estados distintos → test del peso
    insOracion.run('a1', 'nʉnka shkua gontka', 'el agua es una', 'aprobado');
    insOracion.run('r1', 'nʉnka shkua gontka', 'el agua es una', 'revisar');
    insOracion.run('a2', 'guma sheka dzʉwa', 'otra cosa distinta', 'aprobado');
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', 'ñingui tua ukurra', 'otra vez al monte', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('nujkunʉnanka', 'yo tuve', 'tener', 'doc', NULL)`,
    ).run();
    servicio = new RetrievalService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('recupera oraciones por damana con ʉ intacta y puntajes descendentes', () => {
    const resultados = servicio.similares('nʉnka shkua', Idioma.damana, 8);
    expect(resultados.length).toBeGreaterThanOrEqual(2);
    for (const r of resultados) {
      expect(r.damana).toContain('nʉnka');
    }
    const puntajes = resultados.map((r) => r.puntaje);
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes);
  });

  it('una oración estado=revisar puntúa la mitad que la aprobada idéntica y queda después', () => {
    const resultados = servicio.similares('nʉnka shkua gontka', Idioma.damana, 8);
    const aprobada = resultados.find((r) => r.referencia === 'oración 1')!;
    const revisar = resultados.find((r) => r.referencia === 'oración 2 (revisar)')!;
    expect(aprobada).toBeDefined();
    expect(revisar).toBeDefined();
    expect(revisar.puntaje).toBeCloseTo(aprobada.puntaje * PESO_REVISAR, 10);
    expect(resultados.indexOf(aprobada)).toBeLessThan(resultados.indexOf(revisar));
  });

  it('el vocabulario NO participa en el retrieval (va aparte en el prompt)', () => {
    const resultados = servicio.similares('nʉnka', Idioma.damana, 8);
    expect(resultados.some((r) => r.fuente === 'vocabulario')).toBe(false);
    expect(resultados.length).toBeGreaterThan(0); // pero sí encuentra oraciones
  });

  it('las conjugaciones sí participan (caso con ʉ en la forma verbal)', () => {
    const resultados = servicio.similares('nujkunʉnanka', Idioma.damana, 8);
    expect(resultados).toHaveLength(1);
    expect(resultados[0].fuente).toBe('conjugaciones');
    expect(resultados[0].referencia).toBe('conjugación 1 (tener)');
    expect(resultados[0].espanol).toBe('yo tuve');
  });

  it('nunca confunde ʉ con u: buscar "nunka" no recupera nada', () => {
    expect(servicio.similares('nunka', Idioma.damana)).toEqual([]);
  });

  it('recupera por español y trae el damana paralelo (caso con ñ en damana)', () => {
    const resultados = servicio.similares('otra vez al monte', Idioma.espanol, 8);
    expect(resultados[0].damana).toBe('ñingui tua ukurra');
  });

  it('respeta el límite k', () => {
    expect(servicio.similares('nʉnka shkua gontka', Idioma.damana, 1)).toHaveLength(1);
  });
});
