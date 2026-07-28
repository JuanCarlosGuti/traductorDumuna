import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { CorpusRepository } from '../consulta/corpus.repository';
import { RetrievalService } from '../consulta/retrieval.service';
import { ejecutarMigraciones } from '../database/migraciones';
import { TraduccionesRepository } from './traducciones.repository';
import { ConfigTraductor, MODELO_CLAUDE } from './config-traductor.provider';
import { DireccionTraduccion } from './dto/traduccion.dto';
import { extraerJson, TraduccionService } from './traduccion.service';

const JSON_TRADUCCION =
  '{"traduccion": "el agua", "palabras_dudosas": [], "explicacion_breve": "por el vocabulario"}';

describe('extraerJson (parseo tolerante)', () => {
  const esperado = { traduccion: 'agua', palabras_dudosas: [], explicacion_breve: 'x' };
  const jsonPlano = JSON.stringify(esperado);

  it('parsea JSON puro', () => {
    expect(extraerJson(jsonPlano)).toEqual(esperado);
  });

  it('tolera bloques ```json cercados', () => {
    expect(extraerJson('```json\n' + jsonPlano + '\n```')).toEqual(esperado);
  });

  it('tolera bloques ``` sin etiqueta y texto alrededor', () => {
    expect(extraerJson('Claro:\n```\n' + jsonPlano + '\n```\nEspero que sirva.')).toEqual(esperado);
  });

  it('tolera prosa antes y después del objeto', () => {
    expect(extraerJson('Aquí tienes: ' + jsonPlano + ' ¡Saludos!')).toEqual(esperado);
  });

  it('conserva ʉ y ñ dentro del JSON', () => {
    const r = extraerJson('{"traduccion": "nʉnka ñingui", "palabras_dudosas": ["kʉnʉnka"]}');
    expect(r.traduccion).toBe('nʉnka ñingui');
    expect(r.palabras_dudosas).toEqual(['kʉnʉnka']);
  });

  it('lanza si no hay JSON', () => {
    expect(() => extraerJson('no tengo nada que ofrecer')).toThrow();
  });
});

const CONFIG_ANTHROPIC: ConfigTraductor = { proveedor: 'anthropic', modelo: MODELO_CLAUDE };
const CONFIG_COMPATIBLE: ConfigTraductor = {
  proveedor: 'compatible',
  modelo: 'qwen2.5:7b',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'clave-prueba',
};
const CONFIG_VACIA: ConfigTraductor = { proveedor: null, modelo: '' };

describe('TraduccionService', () => {
  let db: Database.Database;
  const fetchOriginal = global.fetch;

  function crearServicio(
    cliente: unknown,
    config: ConfigTraductor,
    registro?: TraduccionesRepository,
  ): TraduccionService {
    const repo = new CorpusRepository(db);
    return new TraduccionService(
      cliente as Anthropic | null,
      config,
      new RetrievalService(repo),
      repo,
      registro ?? new TraduccionesRepository(db),
    );
  }

  const filasRegistradas = () =>
    db.prepare('SELECT * FROM traducciones ORDER BY rowid').all() as any[];

  function clienteFalso(textoRespuesta: string) {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: textoRespuesta }],
        }),
      },
    };
  }

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', 'nʉnka gontka', 'hizo el agua', NULL)`,
    ).run();
    db.prepare(
      "INSERT INTO vocabulario (espanol, damana, notas) VALUES ('agua', 'nʉnka', NULL)",
    ).run();
    db.prepare(
      "INSERT INTO vocabulario (espanol, damana, notas) VALUES ('feliz', 'zen zhiguana', NULL)",
    ).run();
  });

  afterEach(() => {
    db.close();
    global.fetch = fetchOriginal;
  });

  it('sin ningún proveedor configurado responde 503 con instrucciones', async () => {
    const servicio = crearServicio(null, CONFIG_VACIA);
    await expect(
      servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(servicio.disponible()).toBe(false);
  });

  describe('proveedor anthropic', () => {
    it('arma el prompt con ejemplos recuperados y vocabulario presente en el texto (con ʉ)', async () => {
      const cliente = clienteFalso(JSON_TRADUCCION);
      const servicio = crearServicio(cliente, CONFIG_ANTHROPIC);
      const r = await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });

      expect(r.traduccion).toBe('el agua');
      expect(r.ejemplos.length).toBeGreaterThan(0);
      expect(r.vocabularioUsado).toEqual([{ espanol: 'agua', damana: 'nʉnka' }]);

      const params = cliente.messages.create.mock.calls[0][0];
      expect(params.model).toBe('claude-sonnet-4-6');
      expect(params.system).toContain('traductor');
      expect(params.messages[0].content).toContain('nʉnka gontka');
      expect(params.messages[0].content).toContain('hizo el agua');
      expect(params.messages[0].content).toContain('nʉnka = agua');
      expect(params.messages[0].content).not.toContain('zhiguana');
    });

    it('en dirección español→damana matchea el vocabulario por el lado español sin stopwords', async () => {
      const servicio = crearServicio(
        clienteFalso('{"traduccion": "nʉnka", "palabras_dudosas": []}'),
        CONFIG_ANTHROPIC,
      );
      const r = await servicio.traducir({
        texto: 'el agua de la montaña',
        direccion: DireccionTraduccion.espanol_a_damana,
      });
      expect(r.vocabularioUsado).toEqual([{ espanol: 'agua', damana: 'nʉnka' }]);
    });

    it('descarta entradas del glosario que son frases largas con una sola coincidencia', async () => {
      // Frase de 6 palabras que solo comparte 'nʉnka' → cobertura 1/6 = 0.17
      db.prepare(
        `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
         VALUES ('Hoy otra vez estamos juntos qué bonito', 'Iwa ingui nʉnzhu nukurra zukuega nʉnka', NULL, NULL, 'dic')`,
      ).run();
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(r.vocabularioUsado).toEqual([{ espanol: 'agua', damana: 'nʉnka' }]);
    });

    it('ordena el vocabulario por cobertura léxica: lo específico antes que lo general', async () => {
      // 'kʉnʉnka nʉnka' comparte 2 de 2 palabras (cobertura 1) con el texto;
      // 'nʉnka' comparte 1 de 1 (cobertura 1) pero es más corta → va primero.
      db.prepare(
        `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
         VALUES ('tiene agua', 'kʉnʉnka nʉnka', NULL, NULL, 'dic')`,
      ).run();
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await servicio.traducir({
        texto: 'kʉnʉnka nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(r.vocabularioUsado).toEqual([
        { espanol: 'agua', damana: 'nʉnka' },
        { espanol: 'tiene agua', damana: 'kʉnʉnka nʉnka' },
      ]);
    });

    it('devuelve el nivel de apoyo junto a la traducción', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(['bueno', 'parcial', 'revisar']).toContain(r.apoyo.nivel);
      // el fixture tiene ejemplos que coinciden bien: no debe pedir revisión
      expect(r.apoyo.nivel).not.toBe('revisar');
      expect(r.apoyo.motivos).toEqual([]);
    });

    it('marca «revisar» cuando no hay ningún ejemplo que respalde', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await servicio.traducir({
        texto: 'zzzz qqqq',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(r.apoyo.nivel).toBe('revisar');
      expect(r.apoyo.motivos).toContain('sin_ejemplos');
    });

    it('registra la traducción con sus señales de apoyo (caso con ʉ)', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });

      const filas = filasRegistradas();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        texto: 'nʉnka gontka',
        traduccion: 'el agua',
        direccion: 'damana_a_espanol',
        modelo: MODELO_CLAUDE,
      });
      expect(filas[0].ejemplos_recuperados).toBeGreaterThan(0);
      expect(filas[0].puntaje_top).toBeGreaterThan(0);
      expect(filas[0].fuente_top).toBe('frases'); // el mejor match del fixture
      expect(JSON.parse(filas[0].vocabulario_usado)).toEqual([
        { espanol: 'agua', damana: 'nʉnka' },
      ]);
      expect(typeof filas[0].creado_en).toBe('string');
    });

    it('la media de los K es la media aritmética de los puntajes', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      const esperada =
        r.ejemplos.reduce((s, e) => s + e.puntaje, 0) / r.ejemplos.length;
      expect(filasRegistradas()[0].puntaje_medio).toBeCloseTo(esperada, 10);
    });

    it('sin ejemplos recuperados registra ceros y fuente nula', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      await servicio.traducir({
        texto: 'zzzz qqqq',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(filasRegistradas()[0]).toMatchObject({
        puntaje_top: 0,
        puntaje_medio: 0,
        fuente_top: null,
        ejemplos_recuperados: 0,
      });
    });

    it('SEGURIDAD: si el registro falla, la traducción se entrega igual', async () => {
      const registroRoto = {
        registrar: jest.fn(() => {
          throw new Error('disco lleno');
        }),
      } as unknown as TraduccionesRepository;
      const servicio = crearServicio(
        clienteFalso(JSON_TRADUCCION),
        CONFIG_ANTHROPIC,
        registroRoto,
      );

      const r = await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });

      expect(r.traduccion).toBe('el agua'); // la traducción llega intacta
      expect(r.ejemplos.length).toBeGreaterThan(0);
      expect(registroRoto.registrar).toHaveBeenCalled(); // sí se intentó
      expect(filasRegistradas()).toHaveLength(0); // y no se guardó nada
    });

    it('tokeniza el vocabulario una sola vez aunque se traduzca varias veces', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const repo = (servicio as unknown as { repo: CorpusRepository }).repo;
      const espia = jest.spyOn(repo, 'listarVocabulario');
      const dto = {
        texto: 'nʉnka',
        direccion: DireccionTraduccion.damana_a_espanol,
      };
      await servicio.traducir(dto);
      await servicio.traducir(dto);
      await servicio.traducir(dto);
      expect(espia).toHaveBeenCalledTimes(1);
    });

    it('tolera la respuesta envuelta en ```json y devuelve palabras dudosas', async () => {
      const servicio = crearServicio(
        clienteFalso(
          'Aquí está:\n```json\n{"traduccion": "hizo ñingui", "palabras_dudosas": ["ñingui"], "explicacion_breve": "dudosa"}\n```',
        ),
        CONFIG_ANTHROPIC,
      );
      const r = await servicio.traducir({
        texto: 'gontka ñingui',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(r.traduccion).toBe('hizo ñingui');
      expect(r.palabrasDudosas).toEqual(['ñingui']);
    });

    it('respuesta sin JSON → 502 con mensaje claro', async () => {
      const servicio = crearServicio(clienteFalso('lo siento, no puedo'), CONFIG_ANTHROPIC);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('timeout del SDK → 504', async () => {
      const cliente = {
        messages: {
          create: jest
            .fn()
            .mockRejectedValue(new Anthropic.APIConnectionTimeoutError({ message: 'timeout' })),
        },
      };
      const servicio = crearServicio(cliente, CONFIG_ANTHROPIC);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(GatewayTimeoutException);
    });

    it('error de autenticación del SDK → 502 con mensaje sobre la clave', async () => {
      const cliente = {
        messages: {
          create: jest.fn().mockRejectedValue(
            new Anthropic.AuthenticationError(
              401,
              { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
              'invalid x-api-key',
              new Headers(),
            ),
          ),
        },
      };
      const servicio = crearServicio(cliente, CONFIG_ANTHROPIC);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(/ANTHROPIC_API_KEY no es válida/);
    });
  });

  describe('proveedor compatible con OpenAI (Ollama, Gemini, Groq...)', () => {
    it('llama a {base}/chat/completions con Bearer, system y user, y parsea choices', async () => {
      const fetchFalso = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '```json\n' + JSON_TRADUCCION + '\n```' } }],
        }),
      });
      global.fetch = fetchFalso as unknown as typeof fetch;

      const servicio = crearServicio(null, CONFIG_COMPATIBLE);
      const r = await servicio.traducir({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });

      expect(r.traduccion).toBe('el agua');
      const [url, opciones] = fetchFalso.mock.calls[0];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');
      expect(opciones.headers.authorization).toBe('Bearer clave-prueba');
      const cuerpo = JSON.parse(opciones.body);
      expect(cuerpo.model).toBe('qwen2.5:7b');
      expect(cuerpo.messages[0].role).toBe('system');
      expect(cuerpo.messages[1].role).toBe('user');
      expect(cuerpo.messages[1].content).toContain('nʉnka gontka');
    });

    it('sin apiKey no envía header de autorización (caso Ollama)', async () => {
      const fetchFalso = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON_TRADUCCION } }] }),
      });
      global.fetch = fetchFalso as unknown as typeof fetch;

      const servicio = crearServicio(null, { ...CONFIG_COMPATIBLE, apiKey: undefined });
      await servicio.traducir({
        texto: 'nʉnka',
        direccion: DireccionTraduccion.damana_a_espanol,
      });
      expect(fetchFalso.mock.calls[0][1].headers.authorization).toBeUndefined();
    });

    it('401 del proveedor → 502 con mensaje sobre TRADUCTOR_API_KEY', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
      const servicio = crearServicio(null, CONFIG_COMPATIBLE);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(/TRADUCTOR_API_KEY/);
    });

    it('404 del proveedor → 502 mencionando el modelo (ollama pull)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
      const servicio = crearServicio(null, CONFIG_COMPATIBLE);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(/qwen2\.5:7b/);
    });

    it('conexión rechazada → 504 preguntando si el proveedor está corriendo', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      const servicio = crearServicio(null, CONFIG_COMPATIBLE);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(GatewayTimeoutException);
    });

    it('respuesta sin choices → 502', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => ({ raro: true }) }) as unknown as typeof fetch;
      const servicio = crearServicio(null, CONFIG_COMPATIBLE);
      await expect(
        servicio.traducir({ texto: 'nʉnka', direccion: DireccionTraduccion.damana_a_espanol }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
