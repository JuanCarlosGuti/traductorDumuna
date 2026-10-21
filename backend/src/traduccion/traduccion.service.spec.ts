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
import { PendientesRepository } from '../pendientes/pendientes.repository';
import { ConfigTraductor, MODELO_CLAUDE } from './config-traductor.provider';
import { DireccionTraduccion } from './dto/traduccion.dto';
import { normalizarRespuestaModelo, palabrasEntreCorchetes } from './prompt';
import { TraduccionesRepository } from './traducciones.repository';
import { extraerJson, REINTENTOS_429, reloj, TraduccionService } from './traduccion.service';
import { ValidadasRepository } from './validadas.repository';

const JSON_TRADUCCION = JSON.stringify({
  traduccion: 'el agua',
  glosa: [{ palabra_dm: 'nʉnka', segmento_es: 'el agua' }],
  palabras_sin_equivalente: [],
  reglas_aplicadas: [],
  confianza: 0.8,
  explicacion_breve: 'por el diccionario',
});

describe('extraerJson (parseo tolerante)', () => {
  const esperado = { traduccion: 'agua', palabras_sin_equivalente: [], explicacion_breve: 'x' };
  const jsonPlano = JSON.stringify(esperado);

  it('parsea JSON puro', () => {
    expect(extraerJson(jsonPlano)).toEqual(esperado);
  });

  it('tolera bloques ```json cercados y texto alrededor', () => {
    expect(extraerJson('```json\n' + jsonPlano + '\n```')).toEqual(esperado);
    expect(extraerJson('Aquí tienes: ' + jsonPlano + ' ¡Saludos!')).toEqual(esperado);
  });

  it('conserva ʉ y ñ dentro del JSON', () => {
    const r = extraerJson('{"traduccion": "nʉnka ñingui", "palabras_sin_equivalente": ["kʉnʉnka"]}');
    expect(r.traduccion).toBe('nʉnka ñingui');
    expect(r.palabras_sin_equivalente).toEqual(['kʉnʉnka']);
  });

  it('lanza si no hay JSON', () => {
    expect(() => extraerJson('no tengo nada que ofrecer')).toThrow();
  });
});

describe('normalizarRespuestaModelo', () => {
  it('acepta las claves de la glosa en ambas direcciones y acota la confianza', () => {
    const r = normalizarRespuestaModelo({
      traduccion: 'Ranzhe abu dugwa [vecina]',
      glosa: [
        { palabra_es: 'mi', segmento_dm: 'Ranzhe' },
        { origen: 'mamá', destino: 'abu' },
      ],
      palabras_sin_equivalente: ['[vecina]'],
      reglas_aplicadas: ['-nzhe (posesivo)'],
      confianza: '1.7',
      explicacion_breve: 'x',
    });
    expect(r.glosa).toEqual([
      { origen: 'mi', destino: 'Ranzhe' },
      { origen: 'mamá', destino: 'abu' },
    ]);
    expect(r.palabrasSinEquivalente).toEqual(['vecina']);
    expect(r.confianza).toBe(1);
  });

  it('añade a sin_equivalente las palabras entre corchetes aunque el modelo no las liste', () => {
    expect(palabrasEntreCorchetes('abu [vecina] nuka [ñame]')).toEqual(['vecina', 'ñame']);
    const r = normalizarRespuestaModelo({ traduccion: 'abu [vecina]', palabras_sin_equivalente: [] });
    expect(r.palabrasSinEquivalente).toEqual(['vecina']);
    expect(r.confianza).toBe(0);
    expect(r.glosa).toEqual([]);
  });
});

const CONFIG_ANTHROPIC: ConfigTraductor = { proveedor: 'anthropic', modelo: MODELO_CLAUDE };
const CONFIG_COMPATIBLE: ConfigTraductor = {
  proveedor: 'compatible',
  modelo: 'openai/gpt-oss-120b',
  baseUrl: 'https://api.groq.com/openai/v1',
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
      registro ?? new TraduccionesRepository(db),
      new PendientesRepository(db),
      new ValidadasRepository(db),
    );
  }

  const filasRegistradas = () => db.prepare('SELECT * FROM traducciones ORDER BY rowid').all() as any[];
  const pendientes = () => db.prepare('SELECT palabra, idioma, contexto, veces_pedida FROM pendientes ORDER BY palabra').all() as any[];

  function clienteFalso(textoRespuesta: string, stopReason = 'end_turn') {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({
          stop_reason: stopReason,
          content: [{ type: 'text', text: textoRespuesta }],
        }),
      },
    };
  }

  const dmAEs = (texto: string) => ({ texto, direccion: DireccionTraduccion.damana_a_espanol });
  const esADm = (texto: string) => ({ texto, direccion: DireccionTraduccion.espanol_a_damana });

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas, dominio)
       VALUES ('Prueba', 'nʉnka gontka', 'hizo el agua', NULL, 'cotidiano')`,
    ).run();
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
       VALUES ('b1', 'Jehová nʉnka gontka kʉñingui', 'Jehová hizo el agua del cielo', 'aprobado', 'lfb', 'biblico')`,
    ).run();
    const insVocab = db.prepare(
      'INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES (?, ?, ?, NULL, ?)',
    );
    insVocab.run('agua', 'nʉnka', 'Otros', 'dic');
    insVocab.run('feliz', 'zen zhiguana', 'Sentimientos / estados', 'dic');
    insVocab.run('mamá', 'Abu', 'Personas y familia', 'dic');
    insVocab.run('Cocinar', 'Dugua', 'Verbos', 'dic');
    insVocab.run('Casa', 'Urraga', 'Casa / objetos / herramientas', 'dic');
    insVocab.run('No quiero', 'Nandunun', 'Sentimientos / estados', 'dic');
    db.prepare(
      `INSERT INTO reglas (tipo, forma, significado, ejemplo_base, ejemplo_regla, traduccion_ejemplo, notas, disparador)
       VALUES ('sufijo', '-nzhe', 'posesivo / "de"', 'Kunkujshina (Dios)', 'Kunkujshinanzhe', 'de Dios', NULL, 'posesivo')`,
    ).run();
    db.prepare(
      `INSERT INTO nombres_propios (damana, espanol, se_escribe_igual, otras_grafias, notas)
       VALUES ('Jehová', 'Jehová', 1, 'Jehova', NULL)`,
    ).run();
  });

  afterEach(() => {
    db.close();
    global.fetch = fetchOriginal;
  });

  it('sin ningún proveedor configurado responde 503 con instrucciones', async () => {
    const servicio = crearServicio(null, CONFIG_VACIA);
    await expect(servicio.traducir(dmAEs('nʉnka'))).rejects.toThrow(ServiceUnavailableException);
    expect(servicio.disponible()).toBe(false);
  });

  describe('proveedor anthropic', () => {
    it('arma el prompt por secciones con diccionario y ejemplos, y pide salida estructurada', async () => {
      const cliente = clienteFalso(JSON_TRADUCCION);
      const servicio = crearServicio(cliente, CONFIG_ANTHROPIC);
      const r = await servicio.traducir(dmAEs('nʉnka gontka'));

      expect(r.traduccion).toBe('el agua');
      expect(r.glosa).toEqual([{ origen: 'nʉnka', destino: 'el agua' }]);
      expect(r.confianza).toBe(0.8);
      expect(r.ejemplos.length).toBeGreaterThan(0);
      expect(r.diccionario).toEqual([
        expect.objectContaining({ palabra: 'nʉnka', espanol: 'agua', damana: 'nʉnka', coincidencia: 'exacta' }),
      ]);

      const params = cliente.messages.create.mock.calls[0][0];
      expect(params.model).toBe(MODELO_CLAUDE);
      expect(params.output_config.format.type).toBe('json_schema');
      expect(params.output_config.format.schema.required).toContain('palabras_sin_equivalente');
      expect(params.system).toContain('traductor');
      expect(params.system).toContain('palabra_dm');
      expect(params.system).toContain('artículos');
      const usuario: string = params.messages[0].content;
      for (const seccion of [
        '=== REGLAS GRAMATICALES ===',
        '=== DICCIONARIO DE ESTA FRASE ===',
        '=== EJEMPLOS COTIDIANOS ===',
        '=== EJEMPLOS DE GRAMÁTICA ===',
        '=== EJEMPLOS DEL CORPUS BÍBLICO ===',
        '=== FRASE A TRADUCIR ===',
      ]) {
        expect(usuario).toContain(seccion);
      }
      expect(usuario).toContain('nʉnka → agua');
      expect(usuario).toContain('hizo el agua');
      expect(usuario).not.toContain('zhiguana');
    });

    it('español → damana: «mi mamá cocina en la casa» usa el diccionario, detecta posesivo e incluye -nzhe', async () => {
      const cliente = clienteFalso(
        JSON.stringify({
          traduccion: 'Ranzhe abu urragamba dugwa',
          glosa: [
            { palabra_es: 'mi', segmento_dm: 'Ranzhe' },
            { palabra_es: 'mamá', segmento_dm: 'abu' },
            { palabra_es: 'en la casa', segmento_dm: 'urragamba' },
            { palabra_es: 'cocina', segmento_dm: 'dugwa' },
          ],
          palabras_sin_equivalente: [],
          reglas_aplicadas: ['-nzhe (posesivo)'],
          confianza: 0.7,
          explicacion_breve: 'diccionario + regla',
        }),
      );
      const servicio = crearServicio(cliente, CONFIG_ANTHROPIC);
      const r = await servicio.traducir(esADm('mi mamá cocina en la casa'));

      expect(r.diccionario.find((a) => a.palabra === 'mamá')).toMatchObject({ damana: 'Abu', coincidencia: 'exacta' });
      expect(r.diccionario.find((a) => a.palabra === 'cocina')).toMatchObject({ damana: 'Dugua', coincidencia: 'posible' });
      expect(r.diccionario.find((a) => a.palabra === 'casa')).toMatchObject({ damana: 'Urraga' });
      expect(r.disparadores).toEqual(['posesivo']);
      expect(r.reglas).toEqual([
        { forma: '-nzhe', significado: 'posesivo / "de"', ejemplo: 'Kunkujshina (Dios) → Kunkujshinanzhe = de Dios', disparador: 'posesivo' },
      ]);
      expect(r.reglasAplicadas).toEqual(['-nzhe (posesivo)']);
      expect(r.glosa[1]).toEqual({ origen: 'mamá', destino: 'abu' });

      const params = cliente.messages.create.mock.calls[0][0];
      expect(params.system).toContain('palabra_es');
      const usuario: string = params.messages[0].content;
      expect(usuario).toContain('Rasgos detectados en la frase: posesivo');
      expect(usuario).toContain('- -nzhe — posesivo');
      expect(usuario).toContain('- mamá → Abu (mamá) [exacta');
      expect(usuario).toContain('Dirección: del español al damana.');
    });

    it('negación sin regla en el corpus: el prompt lo dice y ofrece la forma negativa del diccionario solo si hay «no»', async () => {
      const cliente = clienteFalso(JSON_TRADUCCION);
      const r = await crearServicio(cliente, CONFIG_ANTHROPIC).traducir(esADm('no quiero agua'));
      expect(r.disparadores).toEqual(['negacion']);
      expect(r.reglas).toEqual([]); // la base de prueba solo tiene -nzhe (posesivo)
      expect(r.diccionario).toContainEqual(
        expect.objectContaining({ palabra: 'No quiero', damana: 'Nandunun', coincidencia: 'frase' }),
      );
      const params = cliente.messages.create.mock.calls[0][0];
      expect(params.system).toContain('La negación');
      const usuario: string = params.messages[0].content;
      expect(usuario).toContain('Rasgos detectados en la frase: negacion.');
      expect(usuario).toContain('- negacion: rasgo detectado, pero el corpus no tiene regla registrada');
      expect(usuario).toContain('No quiero → Nandunun');
      expect(usuario).not.toContain('(ninguna regla aplicable)');

      // Afirmativa: ni rasgo, ni aviso, ni la forma negada en el diccionario.
      const cliente2 = clienteFalso(JSON_TRADUCCION);
      const r2 = await crearServicio(cliente2, CONFIG_ANTHROPIC).traducir(esADm('quiero agua'));
      expect(r2.disparadores).toEqual([]);
      expect(r2.diccionario.map((a) => a.damana)).not.toContain('Nandunun');
      expect(cliente2.messages.create.mock.calls[0][0].messages[0].content).not.toContain('Nandunun');
    });

    it('los nombres propios viajan con la grafía del corpus', async () => {
      const cliente = clienteFalso(JSON_TRADUCCION);
      const servicio = crearServicio(cliente, CONFIG_ANTHROPIC);
      const r = await servicio.traducir(esADm('Jehova hizo el agua'));
      expect(r.nombresPropios).toEqual([{ enTexto: 'Jehova', espanol: 'Jehová', damana: 'Jehová' }]);
      expect(cliente.messages.create.mock.calls[0][0].messages[0].content).toContain('Nombres propios:');
    });

    it('registra en pendientes cada palabra sin equivalente (con la frase de contexto) y acumula peticiones', async () => {
      const respuesta = JSON.stringify({
        traduccion: 'Ranzhe [vecina] dugwa',
        glosa: [],
        palabras_sin_equivalente: ['vecina'],
        reglas_aplicadas: [],
        confianza: 0.4,
        explicacion_breve: '',
      });
      const servicio = crearServicio(clienteFalso(respuesta), CONFIG_ANTHROPIC);
      const r = await servicio.traducir(esADm('mi vecina cocina'));
      expect(r.palabrasSinEquivalente).toEqual(['vecina']);
      await servicio.traducir(esADm('la vecina llegó'));
      expect(pendientes()).toEqual([
        { palabra: 'vecina', idioma: 'espanol', contexto: 'mi vecina cocina', veces_pedida: 2 },
      ]);
    });

    it('en dirección damana → español las pendientes se guardan como palabras damana', async () => {
      const respuesta = JSON.stringify({
        traduccion: 'hizo [kʉzhigui]',
        glosa: [],
        palabras_sin_equivalente: ['kʉzhigui'],
        reglas_aplicadas: [],
        confianza: 0.3,
        explicacion_breve: '',
      });
      const servicio = crearServicio(clienteFalso(respuesta), CONFIG_ANTHROPIC);
      await servicio.traducir(dmAEs('kʉzhigui gontka'));
      expect(pendientes()).toEqual([
        { palabra: 'kʉzhigui', idioma: 'damana', contexto: 'kʉzhigui gontka', veces_pedida: 1 },
      ]);
    });

    it('los artículos y palabras gramaticales se muestran pero no se registran como pendientes', async () => {
      const respuesta = JSON.stringify({
        traduccion: '[La] lema [está] [cara]',
        glosa: [],
        palabras_sin_equivalente: ['La', 'está', 'cara'],
        reglas_aplicadas: [],
        confianza: 0.3,
        explicacion_breve: '',
      });
      const servicio = crearServicio(clienteFalso(respuesta), CONFIG_ANTHROPIC);
      const r = await servicio.traducir(esADm('La carne está cara'));
      expect(r.palabrasSinEquivalente).toEqual(['La', 'está', 'cara']);
      expect(pendientes().map((p) => p.palabra)).toEqual(['cara']);
    });

    it('con registrar: false no deja huella (ni traducciones ni pendientes): modo evaluación', async () => {
      const respuesta = JSON.stringify({
        traduccion: '[vecina]',
        glosa: [],
        palabras_sin_equivalente: ['vecina'],
        reglas_aplicadas: [],
        confianza: 0.2,
        explicacion_breve: '',
      });
      const servicio = crearServicio(clienteFalso(respuesta), CONFIG_ANTHROPIC);
      await servicio.traducir(esADm('mi vecina'), { registrar: false });
      expect(filasRegistradas()).toEqual([]);
      expect(pendientes()).toEqual([]);
    });

    it('devuelve el nivel de apoyo; sin ejemplos marca «revisar»', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const bien = await servicio.traducir(dmAEs('nʉnka gontka'));
      expect(bien.apoyo.nivel).not.toBe('revisar');
      const mal = await servicio.traducir(dmAEs('zzzz qqqq'));
      expect(mal.apoyo.nivel).toBe('revisar');
      expect(mal.apoyo.motivos).toContain('sin_ejemplos');
    });

    it('registra la traducción con señales de apoyo, confianza, reglas y glosa (caso con ʉ)', async () => {
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await servicio.traducir(dmAEs('nʉnka gontka'));

      const filas = filasRegistradas();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        texto: 'nʉnka gontka',
        traduccion: 'el agua',
        direccion: 'damana_a_espanol',
        modelo: MODELO_CLAUDE,
        confianza: 0.8,
      });
      expect(filas[0].ejemplos_recuperados).toBe(r.ejemplos.length);
      expect(filas[0].puntaje_top).toBeCloseTo(Math.max(...r.ejemplos.map((e) => e.puntaje)), 10);
      expect(filas[0].puntaje_medio).toBeCloseTo(
        r.ejemplos.reduce((s, e) => s + e.puntaje, 0) / r.ejemplos.length,
        10,
      );
      expect(JSON.parse(filas[0].vocabulario_usado)).toEqual([{ espanol: 'agua', damana: 'nʉnka' }]);
      expect(JSON.parse(filas[0].glosa)).toEqual([{ origen: 'nʉnka', destino: 'el agua' }]);
      expect(JSON.parse(filas[0].reglas_aplicadas)).toEqual([]);
    });

    it('SEGURIDAD: si el registro falla, la traducción se entrega igual', async () => {
      const registroRoto = {
        registrar: jest.fn(() => {
          throw new Error('disco lleno');
        }),
      } as unknown as TraduccionesRepository;
      const servicio = crearServicio(clienteFalso(JSON_TRADUCCION), CONFIG_ANTHROPIC, registroRoto);
      const r = await servicio.traducir(dmAEs('nʉnka gontka'));
      expect(r.traduccion).toBe('el agua');
      expect(registroRoto.registrar).toHaveBeenCalled();
      expect(filasRegistradas()).toHaveLength(0);
    });

    it('tolera la respuesta envuelta en ```json', async () => {
      const servicio = crearServicio(
        clienteFalso('Aquí está:\n```json\n' + JSON_TRADUCCION.replace('el agua', 'hizo ñingui') + '\n```'),
        CONFIG_ANTHROPIC,
      );
      const r = await servicio.traducir(dmAEs('gontka ñingui'));
      expect(r.traduccion).toBe('hizo ñingui');
    });

    it('respuesta sin JSON → 502; rechazo por seguridad → 502', async () => {
      await expect(
        crearServicio(clienteFalso('lo siento, no puedo'), CONFIG_ANTHROPIC).traducir(dmAEs('nʉnka')),
      ).rejects.toThrow(BadGatewayException);
      await expect(
        crearServicio(clienteFalso('', 'refusal'), CONFIG_ANTHROPIC).traducir(dmAEs('nʉnka')),
      ).rejects.toThrow(/rechazó/);
    });

    it('timeout del SDK → 504; clave inválida → 502 con mensaje sobre la clave', async () => {
      const conTimeout = {
        messages: {
          create: jest.fn().mockRejectedValue(new Anthropic.APIConnectionTimeoutError({ message: 'timeout' })),
        },
      };
      await expect(crearServicio(conTimeout, CONFIG_ANTHROPIC).traducir(dmAEs('nʉnka'))).rejects.toThrow(
        GatewayTimeoutException,
      );
      const sinClave = {
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
      await expect(crearServicio(sinClave, CONFIG_ANTHROPIC).traducir(dmAEs('nʉnka'))).rejects.toThrow(
        /ANTHROPIC_API_KEY no es válida/,
      );
    });
  });

  describe('validar (botones «es correcta» / «corregir»)', () => {
    it('guarda el par con el español y el damana en su sitio según la dirección', () => {
      const servicio = crearServicio(null, CONFIG_VACIA);
      const r1 = servicio.validar({
        texto: 'mi mamá cocina',
        direccion: DireccionTraduccion.espanol_a_damana,
        traduccion: 'Ranzhe abu dugwa',
        origen: 'confirmada',
        traduccionModelo: 'Ranzhe abu dugwa',
      });
      const r2 = servicio.validar({
        texto: 'nʉnka gontka',
        direccion: DireccionTraduccion.damana_a_espanol,
        traduccion: 'hizo el agua',
        origen: 'corregida',
        traduccionModelo: 'el agua',
      });
      expect(r1).toEqual({ guardada: true, total: 1 });
      expect(r2).toEqual({ guardada: true, total: 2 });
      expect(db.prepare('SELECT espanol, damana, origen, traduccion_modelo FROM validadas ORDER BY rowid').all()).toEqual([
        { espanol: 'mi mamá cocina', damana: 'Ranzhe abu dugwa', origen: 'confirmada', traduccion_modelo: 'Ranzhe abu dugwa' },
        { espanol: 'hizo el agua', damana: 'nʉnka gontka', origen: 'corregida', traduccion_modelo: 'el agua' },
      ]);
    });
  });

  describe('proveedor compatible con OpenAI (Groq, Ollama, Gemini...)', () => {
    const respuestaOk = (contenido: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: contenido } }] }),
    });

    it('llama a {base}/chat/completions con Bearer, system/user y response_format json_object', async () => {
      const fetchFalso = jest.fn().mockResolvedValue(respuestaOk('```json\n' + JSON_TRADUCCION + '\n```'));
      global.fetch = fetchFalso as unknown as typeof fetch;

      const r = await crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka gontka'));
      expect(r.traduccion).toBe('el agua');
      const [url, opciones] = fetchFalso.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(opciones.headers.authorization).toBe('Bearer clave-prueba');
      const cuerpo = JSON.parse(opciones.body);
      expect(cuerpo.model).toBe('openai/gpt-oss-120b');
      expect(cuerpo.response_format).toEqual({ type: 'json_object' });
      expect(cuerpo.messages[0].role).toBe('system');
      expect(cuerpo.messages[1].role).toBe('user');
      expect(cuerpo.messages[1].content).toContain('=== FRASE A TRADUCIR ===');
      expect(cuerpo.messages[1].content).toContain('nʉnka gontka');
    });

    it('si el proveedor rechaza response_format (400) reintenta sin él', async () => {
      const fetchFalso = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
        .mockResolvedValueOnce(respuestaOk(JSON_TRADUCCION));
      global.fetch = fetchFalso as unknown as typeof fetch;

      const r = await crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'));
      expect(r.traduccion).toBe('el agua');
      expect(fetchFalso).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchFalso.mock.calls[1][1].body).response_format).toBeUndefined();
    });

    it('con 429 espera lo que pida Retry-After y reintenta; si persiste se rinde con 429', async () => {
      const dormir = jest.spyOn(reloj, 'dormir').mockResolvedValue();
      try {
        const fetchFalso = jest
          .fn()
          .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '7' }), json: async () => ({}) })
          .mockResolvedValueOnce(respuestaOk(JSON_TRADUCCION));
        global.fetch = fetchFalso as unknown as typeof fetch;
        const r = await crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'));
        expect(r.traduccion).toBe('el agua');
        expect(dormir).toHaveBeenCalledWith(7000);
        expect(fetchFalso).toHaveBeenCalledTimes(2);

        const siempre429 = jest
          .fn()
          .mockResolvedValue({ ok: false, status: 429, headers: new Headers(), json: async () => ({}) });
        global.fetch = siempre429 as unknown as typeof fetch;
        await expect(crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'))).rejects.toThrow(/límite de uso/);
        expect(siempre429).toHaveBeenCalledTimes(REINTENTOS_429 + 1);
      } finally {
        dormir.mockRestore();
      }
    });

    it('sin apiKey no envía header de autorización (caso Ollama)', async () => {
      const fetchFalso = jest.fn().mockResolvedValue(respuestaOk(JSON_TRADUCCION));
      global.fetch = fetchFalso as unknown as typeof fetch;
      await crearServicio(null, { ...CONFIG_COMPATIBLE, apiKey: undefined }).traducir(dmAEs('nʉnka'));
      expect(fetchFalso.mock.calls[0][1].headers.authorization).toBeUndefined();
    });

    it('401 → 502 sobre TRADUCTOR_API_KEY; 404 → 502 mencionando el modelo', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
      await expect(crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'))).rejects.toThrow(/TRADUCTOR_API_KEY/);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
      await expect(crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'))).rejects.toThrow(/gpt-oss-120b/);
    });

    it('conexión rechazada → 504; respuesta sin choices → 502', async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      await expect(crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'))).rejects.toThrow(GatewayTimeoutException);
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ raro: true }) }) as unknown as typeof fetch;
      await expect(crearServicio(null, CONFIG_COMPATIBLE).traducir(dmAEs('nʉnka'))).rejects.toThrow(BadGatewayException);
    });
  });
});
