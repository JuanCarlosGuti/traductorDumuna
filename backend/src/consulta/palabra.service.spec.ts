import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { BusquedaService } from './busqueda.service';
import { CorpusRepository } from './corpus.repository';
import { PalabraService } from './palabra.service';
import { RetrievalService } from './retrieval.service';

describe('PalabraService', () => {
  let db: Database.Database;
  let servicio: PalabraService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    // Contenido: nʉnka aparece en las tres fuentes; ñingui solo en oraciones.
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o1', 'Ñingui nʉnka gontka nʉnka', 'Dios hizo el agua del cielo', 'aprobado', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', 'nʉnka nanu', 'agua fresca de aquí', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    const insToken = db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insToken.run('ñingui', 'Ñingui', 'oraciones', 1, 0);
    insToken.run('nʉnka', 'nʉnka', 'oraciones', 1, 1);
    insToken.run('gontka', 'gontka', 'oraciones', 1, 2);
    insToken.run('nʉnka', 'nʉnka', 'oraciones', 1, 3);
    insToken.run('nʉnka', 'nʉnka', 'frases', 1, 0);
    insToken.run('nanu', 'nanu', 'frases', 1, 1);
    insToken.run('nʉnka', 'nʉnka', 'vocabulario', 1, 0);
    const repo = new CorpusRepository(db);
    servicio = new PalabraService(
      repo,
      new BusquedaService(repo, new RetrievalService(repo)),
    );
  });

  afterEach(() => db.close());

  it('calcula frecuencia total y por fuente (caso con ʉ)', () => {
    const ficha = servicio.ficha('nʉnka');
    expect(ficha.palabra).toBe('nʉnka');
    expect(ficha.frecuenciaTotal).toBe(4);
    // GROUP BY tabla_origen con ORDER BY alfabético
    expect(ficha.frecuenciaPorFuente).toEqual([
      { fuente: 'frases', frecuencia: 1 },
      { fuente: 'oraciones', frecuencia: 2 },
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
    // 'agua' co-ocurre en oración, frase y vocabulario; 'el'/'de'/'del' son stopwords
    expect(ficha.traduccionesCandidatas[0]).toEqual({ palabra: 'agua', coocurrencias: 3 });
    expect(palabras).not.toContain('el');
    expect(palabras).not.toContain('de');
    expect(palabras).not.toContain('del');
  });

  it('funciona con ñ y usa el español de la oración (caso con ñ)', () => {
    const ficha = servicio.ficha('ñingui');
    expect(ficha.frecuenciaTotal).toBe(1);
    const palabras = ficha.traduccionesCandidatas.map((c) => c.palabra);
    expect(palabras).toContain('agua'); // del paralelo 'Dios hizo el agua del cielo'
  });

  it('lanza 404 para palabras que no están en el corpus', () => {
    expect(() => servicio.ficha('inexistente')).toThrow(NotFoundException);
  });
});
