import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { BusquedaService } from './busqueda.service';
import { CorpusRepository } from './corpus.repository';
import { PalabraService } from './palabra.service';

describe('PalabraService', () => {
  let db: Database.Database;
  let servicio: PalabraService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    // Contenido: nʉnka aparece en las tres fuentes; ñingui solo en capítulos.
    db.prepare(
      `INSERT INTO capitulos (capitulo, titulo_damana, titulo_espanol, damana, espanol)
       VALUES (1, 'Ñingui shkua', 'El agua', 'nʉnka gontka nʉnka', 'Dios hizo el agua del cielo')`,
    ).run();
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', 'nʉnka nanu', 'agua fresca de aquí', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, notas) VALUES ('agua', 'nʉnka', NULL)`,
    ).run();
    const insToken = db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insToken.run('ñingui', 'Ñingui', 'capitulos', 1, 0);
    insToken.run('shkua', 'shkua', 'capitulos', 1, 1);
    insToken.run('nʉnka', 'nʉnka', 'capitulos', 1, 2);
    insToken.run('gontka', 'gontka', 'capitulos', 1, 3);
    insToken.run('nʉnka', 'nʉnka', 'capitulos', 1, 4);
    insToken.run('nʉnka', 'nʉnka', 'frases', 1, 0);
    insToken.run('nanu', 'nanu', 'frases', 1, 1);
    insToken.run('nʉnka', 'nʉnka', 'vocabulario', 1, 0);
    const repo = new CorpusRepository(db);
    servicio = new PalabraService(repo, new BusquedaService(repo));
  });

  afterEach(() => db.close());

  it('calcula frecuencia total y por fuente (caso con ʉ)', () => {
    const ficha = servicio.ficha('nʉnka');
    expect(ficha.palabra).toBe('nʉnka');
    expect(ficha.frecuenciaTotal).toBe(4);
    expect(ficha.frecuenciaPorFuente).toEqual([
      { fuente: 'capitulos', frecuencia: 2 },
      { fuente: 'frases', frecuencia: 1 },
      { fuente: 'vocabulario', frecuencia: 1 },
    ]);
  });

  it('normaliza el token de entrada (Nʉnka → nʉnka)', () => {
    expect(servicio.ficha('Nʉnka').palabra).toBe('nʉnka');
  });

  it('devuelve concordancias con <mark>', () => {
    const ficha = servicio.ficha('nʉnka');
    expect(ficha.concordancias.length).toBeGreaterThan(0);
    expect(ficha.concordancias[0].fragmento).toContain('<mark>nʉnka</mark>');
  });

  it('propone traducciones candidatas excluyendo stopwords', () => {
    const ficha = servicio.ficha('nʉnka');
    const palabras = ficha.traduccionesCandidatas.map((c) => c.palabra);
    // 'agua' co-ocurre 4 veces (título + cuerpo del capítulo, frase y
    // vocabulario); 'el', 'de', 'del' son stopwords
    expect(ficha.traduccionesCandidatas[0]).toEqual({ palabra: 'agua', coocurrencias: 4 });
    expect(palabras).not.toContain('el');
    expect(palabras).not.toContain('de');
    expect(palabras).not.toContain('del');
  });

  it('funciona con ñ y usa también el título español del capítulo (caso con ñ)', () => {
    const ficha = servicio.ficha('ñingui');
    expect(ficha.frecuenciaTotal).toBe(1);
    const palabras = ficha.traduccionesCandidatas.map((c) => c.palabra);
    expect(palabras).toContain('agua'); // de 'El agua' (título) y del cuerpo
  });

  it('lanza 404 para palabras que no están en el corpus', () => {
    expect(() => servicio.ficha('inexistente')).toThrow(NotFoundException);
  });
});
