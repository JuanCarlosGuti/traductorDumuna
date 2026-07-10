import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { BusquedaService } from './busqueda.service';
import { FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { RetrievalService } from './retrieval.service';

describe('BusquedaService', () => {
  let db: Database.Database;
  let servicio: BusquedaService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o1', 'Jehovága nʉnka kʉñingui gontka', 'Jehová hizo el agua', 'aprobado', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o2', 'ñingui tua ukurra', 'otra vez al monte', 'revisar', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', '¿Zhinzhoma nʉnka nanu?', '¿Conoces el agua?', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('nʉnkanka', 'él fue', 'ser', 'doc', NULL)`,
    ).run();
    const repo = new CorpusRepository(db);
    servicio = new BusquedaService(repo, new RetrievalService(repo));
  });

  afterEach(() => db.close());

  it('encuentra en damana en las cuatro fuentes, con <mark> y ʉ intacta', () => {
    const r = servicio.buscar({ q: 'nʉnka', idioma: Idioma.damana, limite: 100 });
    expect(r.modo).toBe('concordancia');
    expect(r.total).toBe(3); // oración 1, frase, vocabulario (nʉnkanka NO matchea nʉnka)
    expect(r.resultados.map((c) => c.fuente)).toEqual([
      FuenteCorpus.oraciones,
      FuenteCorpus.frases,
      FuenteCorpus.vocabulario,
    ]);
    for (const c of r.resultados) {
      expect(c.fragmento).toContain('<mark>nʉnka</mark>');
    }
  });

  it('las conjugaciones son buscables con referencia «conjugación N (lema)»', () => {
    const r = servicio.buscar({ q: 'nʉnkanka', idioma: Idioma.damana, limite: 10 });
    expect(r.total).toBe(1);
    expect(r.resultados[0].fuente).toBe(FuenteCorpus.conjugaciones);
    expect(r.resultados[0].referencia).toBe('conjugación 1 (ser)');
    expect(r.resultados[0].textoParalelo).toBe('él fue');
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

  it('la referencia de una oración marca el estado revisar', () => {
    const r = servicio.buscar({ q: 'ñingui', idioma: Idioma.damana, limite: 10 });
    expect(r.resultados[0].referencia).toBe('oración 2 (revisar)');
  });

  it('respeta el límite pero informa el total real', () => {
    const r = servicio.buscar({ q: 'nʉnka', idioma: Idioma.damana, limite: 2 });
    expect(r.total).toBe(3);
    expect(r.resultados).toHaveLength(2);
  });

  describe('modo similitud (consultas de varias palabras)', () => {
    it('una frase damana devuelve oraciones similares con puntaje y palabras resaltadas', () => {
      const r = servicio.buscar({
        q: 'nʉnka kʉñingui',
        idioma: Idioma.damana,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      expect(r.total).toBeGreaterThan(0);
      const primero = r.resultados[0];
      expect(primero.referencia).toBe('oración 1');
      expect(primero.puntaje).toBeGreaterThan(0);
      // ambas palabras de la consulta quedan resaltadas
      expect(primero.fragmento).toContain('<mark>nʉnka</mark>');
      expect(primero.fragmento).toContain('<mark>kʉñingui</mark>');
      expect(primero.textoParalelo).toBe('Jehová hizo el agua');
    });

    it('una frase en español encuentra por similitud (insensible a tildes)', () => {
      const r = servicio.buscar({
        q: 'jehova hizo agua',
        idioma: Idioma.espanol,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      expect(r.resultados[0].referencia).toBe('oración 1');
      expect(r.resultados[0].fragmento).toContain('<mark>Jehová</mark>');
      expect(r.resultados[0].fragmento).toContain('<mark>agua</mark>');
      expect(r.resultados[0].textoParalelo).toContain('Jehovága');
    });

    it('filtra por fuente también en modo similitud', () => {
      const r = servicio.buscar({
        q: 'nʉnka nanu',
        idioma: Idioma.damana,
        fuente: FuenteCorpus.frases,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      for (const c of r.resultados) {
        expect(c.fuente).toBe(FuenteCorpus.frases);
      }
    });

    it('una frase sin palabras del corpus devuelve vacío sin romper', () => {
      const r = servicio.buscar({
        q: 'zzz www qqq',
        idioma: Idioma.damana,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      expect(r.total).toBe(0);
      expect(r.resultados).toEqual([]);
    });
  });
});
