import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { BusquedaService } from './busqueda.service';
import { FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';

describe('BusquedaService', () => {
  let db: Database.Database;
  let servicio: BusquedaService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO capitulos (capitulo, titulo_damana, titulo_espanol, damana, espanol)
       VALUES (1, 'Ñingui shkua', 'Título uno', 'Jehovága nʉnka kʉñingui gontka', 'Jehová hizo el agua')`,
    ).run();
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', '¿Zhinzhoma nʉnka nanu?', '¿Conoces el agua?', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, notas) VALUES ('agua', 'nʉnka', NULL)`,
    ).run();
    servicio = new BusquedaService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('encuentra en damana en las tres fuentes, con <mark> y ʉ intacta', () => {
    const r = servicio.buscar({ q: 'nʉnka', idioma: Idioma.damana, limite: 100 });
    expect(r.total).toBe(3);
    expect(r.resultados.map((c) => c.fuente)).toEqual([
      FuenteCorpus.capitulos,
      FuenteCorpus.frases,
      FuenteCorpus.vocabulario,
    ]);
    for (const c of r.resultados) {
      expect(c.fragmento).toContain('<mark>nʉnka</mark>');
    }
  });

  it('no confunde ʉ con u ni ñ con n', () => {
    expect(servicio.buscar({ q: 'nunka', idioma: Idioma.damana, limite: 10 }).total).toBe(0);
    expect(servicio.buscar({ q: 'ningui', idioma: Idioma.damana, limite: 10 }).total).toBe(0);
    expect(servicio.buscar({ q: 'ñingui', idioma: Idioma.damana, limite: 10 }).total).toBe(1);
  });

  it('busca en español sin tildes y devuelve el damana como paralelo', () => {
    const r = servicio.buscar({ q: 'jehova', idioma: Idioma.espanol, limite: 10 });
    expect(r.total).toBe(1);
    expect(r.resultados[0].fragmento).toContain('<mark>Jehová</mark>');
    expect(r.resultados[0].textoParalelo).toContain('Jehovága');
  });

  it('filtra por fuente', () => {
    const r = servicio.buscar({
      q: 'nʉnka',
      idioma: Idioma.damana,
      fuente: FuenteCorpus.frases,
      limite: 10,
    });
    expect(r.total).toBe(1);
    expect(r.resultados[0].referencia).toBe('frase 1 (Prueba)');
  });

  it('el título del capítulo es buscable y la referencia es "capítulo N"', () => {
    const r = servicio.buscar({ q: 'ñingui', idioma: Idioma.damana, limite: 10 });
    expect(r.resultados[0].referencia).toBe('capítulo 1');
  });

  it('respeta el límite pero informa el total real', () => {
    const r = servicio.buscar({ q: 'nʉnka', idioma: Idioma.damana, limite: 2 });
    expect(r.total).toBe(3);
    expect(r.resultados).toHaveLength(2);
  });
});
