import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { CorpusRepository } from '../query/corpus.repository';
import { RetrievalService } from '../query/retrieval.service';
import { runMigrations } from '../database/migrations';
import { PendingRepository } from '../pending/pending.repository';
import { TranslatorConfig, CLAUDE_MODEL } from './translator-config.provider';
import { TranslationDirection } from './dto/translation.dto';
import { normalizeModelResponse, bracketedWords } from './prompt';
import { TranslationsRepository } from './translations.repository';
import { extractJson, RETRIES_429, clock, TranslationService } from './translation.service';
import { ValidatedRepository } from './validated.repository';

const JSON_TRADUCCION = JSON.stringify({
  traduccion: 'el agua',
  glosa: [{ palabra_dm: 'nʉnka', segmento_es: 'el agua' }],
  palabras_sin_equivalente: [],
  reglas_aplicadas: [],
  confianza: 0.8,
  explicacion_breve: 'por el diccionario',
});

describe('extractJson (tolerant parsing)', () => {
  const expected = { traduccion: 'agua', palabras_sin_equivalente: [], explicacion_breve: 'x' };
  const plainJson = JSON.stringify(expected);

  it('parses pure JSON', () => {
    expect(extractJson(plainJson)).toEqual(expected);
  });

  it('tolerates fenced ```json blocks and surrounding text', () => {
    expect(extractJson('```json\n' + plainJson + '\n```')).toEqual(expected);
    expect(extractJson('Aquí tienes: ' + plainJson + ' ¡Saludos!')).toEqual(expected);
  });

  it('keeps ʉ and ñ inside the JSON', () => {
    const r = extractJson('{"traduccion": "nʉnka ñingui", "palabras_sin_equivalente": ["kʉnʉnka"]}');
    expect(r.traduccion).toBe('nʉnka ñingui');
    expect(r.palabras_sin_equivalente).toEqual(['kʉnʉnka']);
  });

  it('throws if there is no JSON', () => {
    expect(() => extractJson('no tengo nada que ofrecer')).toThrow();
  });
});

describe('normalizeModelResponse', () => {
  it('accepts the gloss keys in both directions and clamps the confidence', () => {
    const r = normalizeModelResponse({
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
    expect(r.gloss).toEqual([
      { origin: 'mi', target: 'Ranzhe' },
      { origin: 'mamá', target: 'abu' },
    ]);
    expect(r.wordsWithoutEquivalent).toEqual(['vecina']);
    expect(r.confidence).toBe(1);
  });

  it('adds the words in square brackets to sin_equivalente even if the model does not list them', () => {
    expect(bracketedWords('abu [vecina] nuka [ñame]')).toEqual(['vecina', 'ñame']);
    const r = normalizeModelResponse({ traduccion: 'abu [vecina]', palabras_sin_equivalente: [] });
    expect(r.wordsWithoutEquivalent).toEqual(['vecina']);
    expect(r.confidence).toBe(0);
    expect(r.gloss).toEqual([]);
  });
});

const CONFIG_ANTHROPIC: TranslatorConfig = { provider: 'anthropic', model: CLAUDE_MODEL };
const CONFIG_COMPATIBLE: TranslatorConfig = {
  provider: 'compatible',
  model: 'openai/gpt-oss-120b',
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: 'clave-prueba',
};
const EMPTY_CONFIG: TranslatorConfig = { provider: null, model: '' };

describe('TranslationService', () => {
  let db: Database.Database;
  const fetchOriginal = global.fetch;

  function createService(
    client: unknown,
    config: TranslatorConfig,
    logEntry?: TranslationsRepository,
  ): TranslationService {
    const repo = new CorpusRepository(db);
    return new TranslationService(
      client as Anthropic | null,
      config,
      new RetrievalService(repo),
      logEntry ?? new TranslationsRepository(db),
      new PendingRepository(db),
      new ValidatedRepository(db),
    );
  }

  const loggedRows = () => db.prepare('SELECT * FROM traducciones ORDER BY rowid').all() as any[];
  const pendingItems = () => db.prepare('SELECT palabra, idioma, contexto, veces_pedida FROM pendientes ORDER BY palabra').all() as any[];

  function fakeClient(
    responseText: string,
    stopReason = 'end_turn',
    usage?: Record<string, number | null>,
  ) {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({
          stop_reason: stopReason,
          content: [{ type: 'text', text: responseText }],
          ...(usage ? { usage } : {}),
        }),
      },
    };
  }

  /** The system prompt travels as blocks (prompt cache): their text is joined. */
  const systemOf = (params: any): string =>
    (params.system as { text: string }[]).map((b) => b.text).join('\n');

  const dmToEs = (text: string) => ({ text: text, direction: TranslationDirection.damana_a_espanol });
  const esADm = (text: string) => ({ text: text, direction: TranslationDirection.espanol_a_damana });

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
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

  it('with no provider configured it answers 503 with instructions', async () => {
    const service = createService(null, EMPTY_CONFIG);
    await expect(service.translate(dmToEs('nʉnka'))).rejects.toThrow(ServiceUnavailableException);
    expect(service.available()).toBe(false);
  });

  describe('anthropic provider', () => {
    it('builds the prompt in sections with dictionary and examples, and requests structured output', async () => {
      const client = fakeClient(JSON_TRADUCCION);
      const service = createService(client, CONFIG_ANTHROPIC);
      const r = await service.translate(dmToEs('nʉnka gontka'));

      expect(r.translation).toBe('el agua');
      expect(r.gloss).toEqual([{ origin: 'nʉnka', target: 'el agua' }]);
      expect(r.confidence).toBe(0.8);
      expect(r.examples.length).toBeGreaterThan(0);
      expect(r.dictionary).toEqual([
        expect.objectContaining({ word: 'nʉnka', spanish: 'agua', damana: 'nʉnka', match: 'exacta' }),
      ]);

      const params = client.messages.create.mock.calls[0][0];
      expect(params.model).toBe(CLAUDE_MODEL);
      expect(params.output_config.format.type).toBe('json_schema');
      expect(params.output_config.format.schema.required).toContain('palabras_sin_equivalente');
      // claude-opus-5-5 rejects temperature with a 400: it is never sent. The
      // effort only goes if it was configured.
      expect(params.temperature).toBeUndefined();
      expect(params.output_config.effort).toBeUndefined();
      expect(systemOf(params)).toContain('traductor');
      expect(systemOf(params)).toContain('palabra_dm');
      expect(systemOf(params)).toContain('artículos');
      const user: string = params.messages[0].content;
      for (const section of [
        '=== REGLAS GRAMATICALES ===',
        '=== DICCIONARIO DE ESTA FRASE ===',
        '=== EJEMPLOS COTIDIANOS ===',
        '=== EJEMPLOS DE GRAMÁTICA ===',
        '=== EJEMPLOS DEL CORPUS BÍBLICO ===',
        '=== FRASE A TRADUCIR ===',
      ]) {
        expect(user).toContain(section);
      }
      expect(user).toContain('nʉnka → agua');
      expect(user).toContain('hizo el agua');
      expect(user).not.toContain('zhiguana');
    });

    it('Spanish → Damana: «mi mamá cocina en la casa» uses the dictionary, detects possessive and includes -nzhe', async () => {
      const client = fakeClient(
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
      const service = createService(client, CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('mi mamá cocina en la casa'));

      expect(r.dictionary.find((a) => a.word === 'mamá')).toMatchObject({ damana: 'Abu', match: 'exacta' });
      expect(r.dictionary.find((a) => a.word === 'cocina')).toMatchObject({ damana: 'Dugua', match: 'posible' });
      expect(r.dictionary.find((a) => a.word === 'casa')).toMatchObject({ damana: 'Urraga' });
      expect(r.triggers).toEqual(['posesivo']);
      expect(r.rules).toEqual([
        { form: '-nzhe', meaning: 'posesivo / "de"', example: 'Kunkujshina (Dios) → Kunkujshinanzhe = de Dios', trigger: 'posesivo' },
      ]);
      expect(r.appliedRules).toEqual(['-nzhe (posesivo)']);
      expect(r.gloss[1]).toEqual({ origin: 'mamá', target: 'abu' });

      const params = client.messages.create.mock.calls[0][0];
      expect(systemOf(params)).toContain('palabra_es');
      const user: string = params.messages[0].content;
      expect(user).toContain('Rasgos detectados en la frase: posesivo');
      expect(user).toContain('- -nzhe — posesivo');
      expect(user).toContain('- mamá → Abu (mamá) [exacta');
      expect(user).toContain('Dirección: del español al damana.');
    });

    it('negation without a rule in the corpus: the prompt says so and offers the negative dictionary form only if there is a «no»', async () => {
      const client = fakeClient(JSON_TRADUCCION);
      const r = await createService(client, CONFIG_ANTHROPIC).translate(esADm('no quiero agua'));
      expect(r.triggers).toEqual(['negacion']);
      expect(r.rules).toEqual([]); // the test database only has -nzhe (possessive)
      expect(r.dictionary).toContainEqual(
        expect.objectContaining({ word: 'No quiero', damana: 'Nandunun', match: 'frase' }),
      );
      const params = client.messages.create.mock.calls[0][0];
      expect(systemOf(params)).toContain('La negación');
      const user: string = params.messages[0].content;
      expect(user).toContain('Rasgos detectados en la frase: negacion.');
      expect(user).toContain('- negacion: rasgo detectado, pero el corpus no tiene regla registrada');
      expect(user).toContain('No quiero → Nandunun');
      expect(user).not.toContain('(ninguna regla aplicable)');

      // Affirmative: no feature, no warning, no negated form in the dictionary.
      const client2 = fakeClient(JSON_TRADUCCION);
      const r2 = await createService(client2, CONFIG_ANTHROPIC).translate(esADm('quiero agua'));
      expect(r2.triggers).toEqual([]);
      expect(r2.dictionary.map((a) => a.damana)).not.toContain('Nandunun');
      expect(client2.messages.create.mock.calls[0][0].messages[0].content).not.toContain('Nandunun');
    });

    it('marks the system prompt for the prompt cache (cache_control ephemeral)', async () => {
      const client = fakeClient(JSON_TRADUCCION);
      await createService(client, CONFIG_ANTHROPIC).translate(dmToEs('nʉnka'));
      const params = client.messages.create.mock.calls[0][0];
      expect(params.system).toEqual([
        {
          type: 'text',
          text: expect.stringContaining('traductor experto'),
          cache_control: { type: 'ephemeral' },
        },
      ]);
      // The user message changes with every sentence: it goes without a cache marker.
      expect(typeof params.messages[0].content).toBe('string');
    });

    it('with ANTHROPIC_ESFUERZO configured it sends output_config.effort', async () => {
      const client = fakeClient(JSON_TRADUCCION);
      await createService(client, { ...CONFIG_ANTHROPIC, effort: 'low' }).translate(dmToEs('nʉnka'));
      expect(client.messages.create.mock.calls[0][0].output_config.effort).toBe('low');
    });

    it('proper names travel with the corpus spelling', async () => {
      const client = fakeClient(JSON_TRADUCCION);
      const service = createService(client, CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('Jehova hizo el agua'));
      expect(r.properNames).toEqual([{ inText: 'Jehova', spanish: 'Jehová', damana: 'Jehová' }]);
      expect(client.messages.create.mock.calls[0][0].messages[0].content).toContain('Nombres propios:');
    });

    it('records each word without an equivalent as pending (with the context sentence) and accumulates requests', async () => {
      const response = JSON.stringify({
        traduccion: 'Ranzhe [vecina] dugwa',
        glosa: [],
        palabras_sin_equivalente: ['vecina'],
        reglas_aplicadas: [],
        confianza: 0.4,
        explicacion_breve: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('mi vecina cocina'));
      expect(r.wordsWithoutEquivalent).toEqual(['vecina']);
      await service.translate(esADm('la vecina llegó'));
      expect(pendingItems()).toEqual([
        { palabra: 'vecina', idioma: 'espanol', contexto: 'mi vecina cocina', veces_pedida: 2 },
      ]);
    });

    it('in the Damana → Spanish direction pending items are stored as Damana words', async () => {
      const response = JSON.stringify({
        traduccion: 'hizo [kʉzhigui]',
        glosa: [],
        palabras_sin_equivalente: ['kʉzhigui'],
        reglas_aplicadas: [],
        confianza: 0.3,
        explicacion_breve: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      await service.translate(dmToEs('kʉzhigui gontka'));
      expect(pendingItems()).toEqual([
        { palabra: 'kʉzhigui', idioma: 'damana', contexto: 'kʉzhigui gontka', veces_pedida: 1 },
      ]);
    });

    it('articles and function words are shown but not recorded as pending', async () => {
      const response = JSON.stringify({
        traduccion: '[La] lema [está] [cara]',
        glosa: [],
        palabras_sin_equivalente: ['La', 'está', 'cara'],
        reglas_aplicadas: [],
        confianza: 0.3,
        explicacion_breve: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('La carne está cara'));
      expect(r.wordsWithoutEquivalent).toEqual(['La', 'está', 'cara']);
      expect(pendingItems().map((p) => p.palabra)).toEqual(['cara']);
    });

    it('with registrar: false it leaves no trace (neither translations nor pending items): evaluation mode', async () => {
      const response = JSON.stringify({
        traduccion: '[vecina]',
        glosa: [],
        palabras_sin_equivalente: ['vecina'],
        reglas_aplicadas: [],
        confianza: 0.2,
        explicacion_breve: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      await service.translate(esADm('mi vecina'), { record: false });
      expect(loggedRows()).toEqual([]);
      expect(pendingItems()).toEqual([]);
    });

    it('returns the support level; without examples it flags «revisar»', async () => {
      const service = createService(fakeClient(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const good = await service.translate(dmToEs('nʉnka gontka'));
      expect(good.support.level).not.toBe('revisar');
      const bad = await service.translate(dmToEs('zzzz qqqq'));
      expect(bad.support.level).toBe('revisar');
      expect(bad.support.reasons).toContain('sin_ejemplos');
    });

    it('logs the translation with support signals, confidence, rules and gloss (case with ʉ)', async () => {
      const service = createService(fakeClient(JSON_TRADUCCION), CONFIG_ANTHROPIC);
      const r = await service.translate(dmToEs('nʉnka gontka'));

      const rows = loggedRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        texto: 'nʉnka gontka',
        traduccion: 'el agua',
        direccion: 'damana_a_espanol',
        modelo: CLAUDE_MODEL,
        confianza: 0.8,
      });
      expect(rows[0].ejemplos_recuperados).toBe(r.examples.length);
      expect(rows[0].puntaje_top).toBeCloseTo(Math.max(...r.examples.map((e) => e.score)), 10);
      expect(rows[0].puntaje_medio).toBeCloseTo(
        r.examples.reduce((s, e) => s + e.score, 0) / r.examples.length,
        10,
      );
      expect(JSON.parse(rows[0].vocabulario_usado)).toEqual([{ espanol: 'agua', damana: 'nʉnka' }]);
      expect(JSON.parse(rows[0].glosa)).toEqual([{ origen: 'nʉnka', destino: 'el agua' }]);
      expect(JSON.parse(rows[0].reglas_aplicadas)).toEqual([]);
    });

    it('stores input, output and cache tokens and the duration; without usage they stay null', async () => {
      const withUsage = fakeClient(JSON_TRADUCCION, 'end_turn', {
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 700,
        cache_creation_input_tokens: 0,
      });
      await createService(withUsage, CONFIG_ANTHROPIC).translate(dmToEs('nʉnka ñingui'));
      const [row] = loggedRows();
      expect(row).toMatchObject({
        tokens_entrada: 1200,
        tokens_salida: 300,
        tokens_cache_leidos: 700,
        tokens_cache_creados: 0,
      });
      expect(row.duracion_ms).toBeGreaterThanOrEqual(0);

      await createService(fakeClient(JSON_TRADUCCION), CONFIG_ANTHROPIC).translate(dmToEs('nʉnka'));
      const [, withoutUsage] = loggedRows();
      expect(withoutUsage).toMatchObject({
        tokens_entrada: null,
        tokens_salida: null,
        tokens_cache_leidos: null,
        tokens_cache_creados: null,
      });
      expect(withoutUsage.duracion_ms).toBeGreaterThanOrEqual(0);
    });

    it('SAFETY: if logging fails, the translation is still delivered', async () => {
      const brokenLog = {
        record: jest.fn(() => {
          throw new Error('disco lleno');
        }),
      } as unknown as TranslationsRepository;
      const service = createService(fakeClient(JSON_TRADUCCION), CONFIG_ANTHROPIC, brokenLog);
      const r = await service.translate(dmToEs('nʉnka gontka'));
      expect(r.translation).toBe('el agua');
      expect(brokenLog.record).toHaveBeenCalled();
      expect(loggedRows()).toHaveLength(0);
    });

    it('tolerates the response wrapped in ```json', async () => {
      const service = createService(
        fakeClient('Aquí está:\n```json\n' + JSON_TRADUCCION.replace('el agua', 'hizo ñingui') + '\n```'),
        CONFIG_ANTHROPIC,
      );
      const r = await service.translate(dmToEs('gontka ñingui'));
      expect(r.translation).toBe('hizo ñingui');
    });

    it('response without JSON → 502; safety refusal → 502', async () => {
      await expect(
        createService(fakeClient('lo siento, no puedo'), CONFIG_ANTHROPIC).translate(dmToEs('nʉnka')),
      ).rejects.toThrow(BadGatewayException);
      await expect(
        createService(fakeClient('', 'refusal'), CONFIG_ANTHROPIC).translate(dmToEs('nʉnka')),
      ).rejects.toThrow(/rechazó/);
    });

    it('SDK timeout → 504; invalid key → 502 with a message about the key', async () => {
      const withTimeout = {
        messages: {
          create: jest.fn().mockRejectedValue(new Anthropic.APIConnectionTimeoutError({ message: 'timeout' })),
        },
      };
      await expect(createService(withTimeout, CONFIG_ANTHROPIC).translate(dmToEs('nʉnka'))).rejects.toThrow(
        GatewayTimeoutException,
      );
      const withoutKey = {
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
      await expect(createService(withoutKey, CONFIG_ANTHROPIC).translate(dmToEs('nʉnka'))).rejects.toThrow(
        /ANTHROPIC_API_KEY no es válida/,
      );
    });
  });

  describe('validar («es correcta» / «corregir» buttons)', () => {
    it('stores the pair with the Spanish and the Damana in place according to the direction', () => {
      const service = createService(null, EMPTY_CONFIG);
      const r1 = service.validate({
        text: 'mi mamá cocina',
        direction: TranslationDirection.espanol_a_damana,
        translation: 'Ranzhe abu dugwa',
        origin: 'confirmada',
        modelTranslation: 'Ranzhe abu dugwa',
      });
      const r2 = service.validate({
        text: 'nʉnka gontka',
        direction: TranslationDirection.damana_a_espanol,
        translation: 'hizo el agua',
        origin: 'corregida',
        modelTranslation: 'el agua',
      });
      expect(r1).toEqual({ saved: true, total: 1 });
      expect(r2).toEqual({ saved: true, total: 2 });
      expect(db.prepare('SELECT espanol, damana, origen, traduccion_modelo FROM validadas ORDER BY rowid').all()).toEqual([
        { espanol: 'mi mamá cocina', damana: 'Ranzhe abu dugwa', origen: 'confirmada', traduccion_modelo: 'Ranzhe abu dugwa' },
        { espanol: 'hizo el agua', damana: 'nʉnka gontka', origen: 'corregida', traduccion_modelo: 'el agua' },
      ]);
    });
  });

  describe('OpenAI-compatible provider (Groq, Ollama, Gemini...)', () => {
    const okResponse = (content: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: content } }],
        usage: { prompt_tokens: 2500, completion_tokens: 120 },
      }),
    });

    it('calls {base}/chat/completions with Bearer, system/user and response_format json_object', async () => {
      const fakeFetch = jest.fn().mockResolvedValue(okResponse('```json\n' + JSON_TRADUCCION + '\n```'));
      global.fetch = fakeFetch as unknown as typeof fetch;

      const r = await createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka gontka'));
      expect(r.translation).toBe('el agua');
      const [url, options] = fakeFetch.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(options.headers.authorization).toBe('Bearer clave-prueba');
      const bodyData = JSON.parse(options.body);
      expect(bodyData.model).toBe('openai/gpt-oss-120b');
      expect(bodyData.response_format).toEqual({ type: 'json_object' });
      expect(bodyData.temperature).toBe(0.2); // low by default: same sentence, same translation
      expect(bodyData.messages[0].role).toBe('system');
      expect(bodyData.messages[1].role).toBe('user');
      expect(bodyData.messages[1].content).toContain('=== FRASE A TRADUCIR ===');
      expect(bodyData.messages[1].content).toContain('nʉnka gontka');
      // OpenAI-style usage: prompt/completion; it does not report cache → null
      expect(loggedRows()[0]).toMatchObject({
        tokens_entrada: 2500,
        tokens_salida: 120,
        tokens_cache_leidos: null,
        tokens_cache_creados: null,
      });
    });

    it('the configured temperature is sent as is, even 0', async () => {
      const fakeFetch = jest.fn().mockResolvedValue(okResponse(JSON_TRADUCCION));
      global.fetch = fakeFetch as unknown as typeof fetch;
      await createService(null, { ...CONFIG_COMPATIBLE, temperature: 0 }).translate(dmToEs('ñingui'));
      expect(JSON.parse(fakeFetch.mock.calls[0][1].body).temperature).toBe(0);
    });

    it('if the provider rejects response_format (400) it retries without it', async () => {
      const fakeFetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
        .mockResolvedValueOnce(okResponse(JSON_TRADUCCION));
      global.fetch = fakeFetch as unknown as typeof fetch;

      const r = await createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'));
      expect(r.translation).toBe('el agua');
      expect(fakeFetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fakeFetch.mock.calls[1][1].body).response_format).toBeUndefined();
    });

    it('on 429 it waits for what Retry-After asks and retries; if it persists it gives up with 429', async () => {
      const sleep = jest.spyOn(clock, 'dormir').mockResolvedValue();
      try {
        const fakeFetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '7' }), json: async () => ({}) })
          .mockResolvedValueOnce(okResponse(JSON_TRADUCCION));
        global.fetch = fakeFetch as unknown as typeof fetch;
        const r = await createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'));
        expect(r.translation).toBe('el agua');
        expect(sleep).toHaveBeenCalledWith(7000);
        expect(fakeFetch).toHaveBeenCalledTimes(2);

        const always429 = jest
          .fn()
          .mockResolvedValue({ ok: false, status: 429, headers: new Headers(), json: async () => ({}) });
        global.fetch = always429 as unknown as typeof fetch;
        await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(/límite de uso/);
        expect(always429).toHaveBeenCalledTimes(RETRIES_429 + 1);
      } finally {
        sleep.mockRestore();
      }
    });

    it('without apiKey it sends no authorization header (Ollama case)', async () => {
      const fakeFetch = jest.fn().mockResolvedValue(okResponse(JSON_TRADUCCION));
      global.fetch = fakeFetch as unknown as typeof fetch;
      await createService(null, { ...CONFIG_COMPATIBLE, apiKey: undefined }).translate(dmToEs('nʉnka'));
      expect(fakeFetch.mock.calls[0][1].headers.authorization).toBeUndefined();
    });

    it('401 → 502 about TRADUCTOR_API_KEY; 404 → 502 mentioning the model', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(/TRADUCTOR_API_KEY/);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(/gpt-oss-120b/);
    });

    it('connection refused → 504; response without choices → 502', async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(GatewayTimeoutException);
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ raro: true }) }) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(BadGatewayException);
    });
  });
});
