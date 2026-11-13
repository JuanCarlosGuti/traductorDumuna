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

const TRANSLATION_JSON = JSON.stringify({
  translation: 'el agua',
  gloss: [{ word_dm: 'nʉnka', segment_es: 'el agua' }],
  words_without_equivalent: [],
  applied_rules: [],
  confidence: 0.8,
  brief_explanation: 'por el diccionario',
});

describe('extractJson (tolerant parsing)', () => {
  const expected = { translation: 'agua', words_without_equivalent: [], brief_explanation: 'x' };
  const plainJson = JSON.stringify(expected);

  it('parses pure JSON', () => {
    expect(extractJson(plainJson)).toEqual(expected);
  });

  it('tolerates fenced ```json blocks and surrounding text', () => {
    expect(extractJson('```json\n' + plainJson + '\n```')).toEqual(expected);
    expect(extractJson('Aquí tienes: ' + plainJson + ' ¡Saludos!')).toEqual(expected);
  });

  it('keeps ʉ and ñ inside the JSON', () => {
    const r = extractJson('{"translation": "nʉnka ñingui", "words_without_equivalent": ["kʉnʉnka"]}');
    expect(r.translation).toBe('nʉnka ñingui');
    expect(r.words_without_equivalent).toEqual(['kʉnʉnka']);
  });

  it('throws if there is no JSON', () => {
    expect(() => extractJson('no tengo nada que ofrecer')).toThrow();
  });
});

describe('normalizeModelResponse', () => {
  it('accepts the gloss keys in both directions and clamps the confidence', () => {
    const r = normalizeModelResponse({
      translation: 'Ranzhe abu dugwa [vecina]',
      gloss: [
        { word_es: 'mi', segment_dm: 'Ranzhe' },
        { origin: 'mamá', target: 'abu' },
      ],
      words_without_equivalent: ['[vecina]'],
      applied_rules: ['-nzhe (posesivo)'],
      confidence: '1.7',
      brief_explanation: 'x',
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
    const r = normalizeModelResponse({ translation: 'abu [vecina]', words_without_equivalent: [] });
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
  apiKey: 'test-key',
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

  const loggedRows = () => db.prepare('SELECT * FROM translations ORDER BY rowid').all() as any[];
  const pendingItems = () => db.prepare('SELECT word, language, context, times_requested FROM pending_items ORDER BY word').all() as any[];

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

  const dmToEs = (text: string) => ({ text: text, direction: TranslationDirection.damana_to_spanish });
  const esADm = (text: string) => ({ text: text, direction: TranslationDirection.spanish_to_damana });

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO phrases (source, damana, spanish, notes, domain)
       VALUES ('Prueba', 'nʉnka gontka', 'hizo el agua', NULL, 'everyday')`,
    ).run();
    db.prepare(
      `INSERT INTO sentences (external_id, damana, spanish, status, source, domain)
       VALUES ('b1', 'Jehová nʉnka gontka kʉñingui', 'Jehová hizo el agua del cielo', 'approved', 'lfb', 'biblical')`,
    ).run();
    const insVocab = db.prepare(
      'INSERT INTO vocabulary (spanish, damana, category, notes, source) VALUES (?, ?, ?, NULL, ?)',
    );
    insVocab.run('agua', 'nʉnka', 'Otros', 'dic');
    insVocab.run('feliz', 'zen zhiguana', 'Sentimientos / estados', 'dic');
    insVocab.run('mamá', 'Abu', 'Personas y familia', 'dic');
    insVocab.run('Cocinar', 'Dugua', 'Verbos', 'dic');
    insVocab.run('Casa', 'Urraga', 'Casa / objetos / herramientas', 'dic');
    insVocab.run('No quiero', 'Nandunun', 'Sentimientos / estados', 'dic');
    db.prepare(
      `INSERT INTO rules (kind, form, meaning, base_example, rule_example, example_translation, notes, trigger_feature)
       VALUES ('sufijo', '-nzhe', 'posesivo / "de"', 'Kunkujshina (Dios)', 'Kunkujshinanzhe', 'de Dios', NULL, 'possessive')`,
    ).run();
    db.prepare(
      `INSERT INTO proper_names (damana, spanish, same_spelling, other_spellings, notes)
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
      const client = fakeClient(TRANSLATION_JSON);
      const service = createService(client, CONFIG_ANTHROPIC);
      const r = await service.translate(dmToEs('nʉnka gontka'));

      expect(r.translation).toBe('el agua');
      expect(r.gloss).toEqual([{ origin: 'nʉnka', target: 'el agua' }]);
      expect(r.confidence).toBe(0.8);
      expect(r.examples.length).toBeGreaterThan(0);
      expect(r.dictionary).toEqual([
        expect.objectContaining({ word: 'nʉnka', spanish: 'agua', damana: 'nʉnka', match: 'exact' }),
      ]);

      const params = client.messages.create.mock.calls[0][0];
      expect(params.model).toBe(CLAUDE_MODEL);
      expect(params.output_config.format.type).toBe('json_schema');
      expect(params.output_config.format.schema.required).toContain('words_without_equivalent');
      // claude-opus-5-5 rejects temperature with a 400: it is never sent. The
      // effort only goes if it was configured.
      expect(params.temperature).toBeUndefined();
      expect(params.output_config.effort).toBeUndefined();
      expect(systemOf(params)).toContain('translator');
      expect(systemOf(params)).toContain('word_dm');
      expect(systemOf(params)).toContain('articles');
      const user: string = params.messages[0].content;
      for (const section of [
        '=== GRAMMAR RULES ===',
        '=== DICTIONARY FOR THIS SENTENCE ===',
        '=== EVERYDAY EXAMPLES ===',
        '=== GRAMMAR EXAMPLES ===',
        '=== BIBLICAL CORPUS EXAMPLES ===',
        '=== SENTENCE TO TRANSLATE ===',
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
          translation: 'Ranzhe abu urragamba dugwa',
          gloss: [
            { word_es: 'mi', segment_dm: 'Ranzhe' },
            { word_es: 'mamá', segment_dm: 'abu' },
            { word_es: 'en la casa', segment_dm: 'urragamba' },
            { word_es: 'cocina', segment_dm: 'dugwa' },
          ],
          words_without_equivalent: [],
          applied_rules: ['-nzhe (posesivo)'],
          confidence: 0.7,
          brief_explanation: 'diccionario + regla',
        }),
      );
      const service = createService(client, CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('mi mamá cocina en la casa'));

      expect(r.dictionary.find((a) => a.word === 'mamá')).toMatchObject({ damana: 'Abu', match: 'exact' });
      expect(r.dictionary.find((a) => a.word === 'cocina')).toMatchObject({ damana: 'Dugua', match: 'possible' });
      expect(r.dictionary.find((a) => a.word === 'casa')).toMatchObject({ damana: 'Urraga' });
      expect(r.triggers).toEqual(['possessive']);
      expect(r.rules).toEqual([
        { form: '-nzhe', meaning: 'posesivo / "de"', example: 'Kunkujshina (Dios) → Kunkujshinanzhe = de Dios', trigger: 'possessive' },
      ]);
      expect(r.appliedRules).toEqual(['-nzhe (posesivo)']);
      expect(r.gloss[1]).toEqual({ origin: 'mamá', target: 'abu' });

      const params = client.messages.create.mock.calls[0][0];
      expect(systemOf(params)).toContain('word_es');
      const user: string = params.messages[0].content;
      expect(user).toContain('Features detected in the sentence: possessive');
      expect(user).toContain('- -nzhe — posesivo');
      expect(user).toContain('- mamá → Abu (mamá) [exact');
      expect(user).toContain('Direction: from Spanish to Damana.');
    });

    it('negation without a rule in the corpus: the prompt says so and offers the negative dictionary form only if there is a «no»', async () => {
      const client = fakeClient(TRANSLATION_JSON);
      const r = await createService(client, CONFIG_ANTHROPIC).translate(esADm('no quiero agua'));
      expect(r.triggers).toEqual(['negation']);
      expect(r.rules).toEqual([]); // the test database only has -nzhe (possessive)
      expect(r.dictionary).toContainEqual(
        expect.objectContaining({ word: 'No quiero', damana: 'Nandunun', match: 'phrase' }),
      );
      const params = client.messages.create.mock.calls[0][0];
      expect(systemOf(params)).toContain('Negation');
      const user: string = params.messages[0].content;
      expect(user).toContain('Features detected in the sentence: negation.');
      expect(user).toContain('- negation: feature detected, but the corpus has no rule recorded for it');
      expect(user).toContain('No quiero → Nandunun');
      expect(user).not.toContain('(no applicable rule)');

      // Affirmative: no feature, no warning, no negated form in the dictionary.
      const client2 = fakeClient(TRANSLATION_JSON);
      const r2 = await createService(client2, CONFIG_ANTHROPIC).translate(esADm('quiero agua'));
      expect(r2.triggers).toEqual([]);
      expect(r2.dictionary.map((a) => a.damana)).not.toContain('Nandunun');
      expect(client2.messages.create.mock.calls[0][0].messages[0].content).not.toContain('Nandunun');
    });

    it('marks the system prompt for the prompt cache (cache_control ephemeral)', async () => {
      const client = fakeClient(TRANSLATION_JSON);
      await createService(client, CONFIG_ANTHROPIC).translate(dmToEs('nʉnka'));
      const params = client.messages.create.mock.calls[0][0];
      expect(params.system).toEqual([
        {
          type: 'text',
          text: expect.stringContaining('expert translator'),
          cache_control: { type: 'ephemeral' },
        },
      ]);
      // The user message changes with every sentence: it goes without a cache marker.
      expect(typeof params.messages[0].content).toBe('string');
    });

    it('with ANTHROPIC_EFFORT configured it sends output_config.effort', async () => {
      const client = fakeClient(TRANSLATION_JSON);
      await createService(client, { ...CONFIG_ANTHROPIC, effort: 'low' }).translate(dmToEs('nʉnka'));
      expect(client.messages.create.mock.calls[0][0].output_config.effort).toBe('low');
    });

    it('proper names travel with the corpus spelling', async () => {
      const client = fakeClient(TRANSLATION_JSON);
      const service = createService(client, CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('Jehova hizo el agua'));
      expect(r.properNames).toEqual([{ inText: 'Jehova', spanish: 'Jehová', damana: 'Jehová' }]);
      expect(client.messages.create.mock.calls[0][0].messages[0].content).toContain('Proper names:');
    });

    it('records each word without an equivalent as pending (with the context sentence) and accumulates requests', async () => {
      const response = JSON.stringify({
        translation: 'Ranzhe [vecina] dugwa',
        gloss: [],
        words_without_equivalent: ['vecina'],
        applied_rules: [],
        confidence: 0.4,
        brief_explanation: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('mi vecina cocina'));
      expect(r.wordsWithoutEquivalent).toEqual(['vecina']);
      await service.translate(esADm('la vecina llegó'));
      expect(pendingItems()).toEqual([
        { word: 'vecina', language: 'spanish', context: 'mi vecina cocina', times_requested: 2 },
      ]);
    });

    it('in the Damana → Spanish direction pending items are stored as Damana words', async () => {
      const response = JSON.stringify({
        translation: 'hizo [kʉzhigui]',
        gloss: [],
        words_without_equivalent: ['kʉzhigui'],
        applied_rules: [],
        confidence: 0.3,
        brief_explanation: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      await service.translate(dmToEs('kʉzhigui gontka'));
      expect(pendingItems()).toEqual([
        { word: 'kʉzhigui', language: 'damana', context: 'kʉzhigui gontka', times_requested: 1 },
      ]);
    });

    it('articles and function words are shown but not recorded as pending', async () => {
      const response = JSON.stringify({
        translation: '[La] lema [está] [cara]',
        gloss: [],
        words_without_equivalent: ['La', 'está', 'cara'],
        applied_rules: [],
        confidence: 0.3,
        brief_explanation: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      const r = await service.translate(esADm('La carne está cara'));
      expect(r.wordsWithoutEquivalent).toEqual(['La', 'está', 'cara']);
      expect(pendingItems().map((p) => p.word)).toEqual(['cara']);
    });

    it('with registrar: false it leaves no trace (neither translations nor pending items): evaluation mode', async () => {
      const response = JSON.stringify({
        translation: '[vecina]',
        gloss: [],
        words_without_equivalent: ['vecina'],
        applied_rules: [],
        confidence: 0.2,
        brief_explanation: '',
      });
      const service = createService(fakeClient(response), CONFIG_ANTHROPIC);
      await service.translate(esADm('mi vecina'), { record: false });
      expect(loggedRows()).toEqual([]);
      expect(pendingItems()).toEqual([]);
    });

    it('returns the support level; without examples it flags «revisar»', async () => {
      const service = createService(fakeClient(TRANSLATION_JSON), CONFIG_ANTHROPIC);
      const good = await service.translate(dmToEs('nʉnka gontka'));
      expect(good.support.level).not.toBe('review');
      const bad = await service.translate(dmToEs('zzzz qqqq'));
      expect(bad.support.level).toBe('review');
      expect(bad.support.reasons).toContain('no_examples');
    });

    it('logs the translation with support signals, confidence, rules and gloss (case with ʉ)', async () => {
      const service = createService(fakeClient(TRANSLATION_JSON), CONFIG_ANTHROPIC);
      const r = await service.translate(dmToEs('nʉnka gontka'));

      const rows = loggedRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        text: 'nʉnka gontka',
        translation: 'el agua',
        direction: 'damana_to_spanish',
        model: CLAUDE_MODEL,
        confidence: 0.8,
      });
      expect(rows[0].retrieved_examples).toBe(r.examples.length);
      expect(rows[0].top_score).toBeCloseTo(Math.max(...r.examples.map((e) => e.score)), 10);
      expect(rows[0].mean_score).toBeCloseTo(
        r.examples.reduce((s, e) => s + e.score, 0) / r.examples.length,
        10,
      );
      expect(JSON.parse(rows[0].vocabulary_used)).toEqual([{ spanish: 'agua', damana: 'nʉnka' }]);
      expect(JSON.parse(rows[0].gloss)).toEqual([{ origin: 'nʉnka', target: 'el agua' }]);
      expect(JSON.parse(rows[0].applied_rules)).toEqual([]);
    });

    it('stores input, output and cache tokens and the duration; without usage they stay null', async () => {
      const withUsage = fakeClient(TRANSLATION_JSON, 'end_turn', {
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 700,
        cache_creation_input_tokens: 0,
      });
      await createService(withUsage, CONFIG_ANTHROPIC).translate(dmToEs('nʉnka ñingui'));
      const [row] = loggedRows();
      expect(row).toMatchObject({
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_tokens: 700,
        cache_creation_tokens: 0,
      });
      expect(row.duration_ms).toBeGreaterThanOrEqual(0);

      await createService(fakeClient(TRANSLATION_JSON), CONFIG_ANTHROPIC).translate(dmToEs('nʉnka'));
      const [, withoutUsage] = loggedRows();
      expect(withoutUsage).toMatchObject({
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: null,
        cache_creation_tokens: null,
      });
      expect(withoutUsage.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('SAFETY: if logging fails, the translation is still delivered', async () => {
      const brokenLog = {
        record: jest.fn(() => {
          throw new Error('disco lleno');
        }),
      } as unknown as TranslationsRepository;
      const service = createService(fakeClient(TRANSLATION_JSON), CONFIG_ANTHROPIC, brokenLog);
      const r = await service.translate(dmToEs('nʉnka gontka'));
      expect(r.translation).toBe('el agua');
      expect(brokenLog.record).toHaveBeenCalled();
      expect(loggedRows()).toHaveLength(0);
    });

    it('tolerates the response wrapped in ```json', async () => {
      const service = createService(
        fakeClient('Aquí está:\n```json\n' + TRANSLATION_JSON.replace('el agua', 'hizo ñingui') + '\n```'),
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
        direction: TranslationDirection.spanish_to_damana,
        translation: 'Ranzhe abu dugwa',
        origin: 'confirmed',
        modelTranslation: 'Ranzhe abu dugwa',
      });
      const r2 = service.validate({
        text: 'nʉnka gontka',
        direction: TranslationDirection.damana_to_spanish,
        translation: 'hizo el agua',
        origin: 'corrected',
        modelTranslation: 'el agua',
      });
      expect(r1).toEqual({ saved: true, total: 1 });
      expect(r2).toEqual({ saved: true, total: 2 });
      expect(db.prepare('SELECT spanish, damana, origin, model_translation FROM validated_pairs ORDER BY rowid').all()).toEqual([
        { spanish: 'mi mamá cocina', damana: 'Ranzhe abu dugwa', origin: 'confirmed', model_translation: 'Ranzhe abu dugwa' },
        { spanish: 'hizo el agua', damana: 'nʉnka gontka', origin: 'corrected', model_translation: 'el agua' },
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
      const fakeFetch = jest.fn().mockResolvedValue(okResponse('```json\n' + TRANSLATION_JSON + '\n```'));
      global.fetch = fakeFetch as unknown as typeof fetch;

      const r = await createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka gontka'));
      expect(r.translation).toBe('el agua');
      const [url, options] = fakeFetch.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(options.headers.authorization).toBe('Bearer test-key');
      const bodyData = JSON.parse(options.body);
      expect(bodyData.model).toBe('openai/gpt-oss-120b');
      expect(bodyData.response_format).toEqual({ type: 'json_object' });
      expect(bodyData.temperature).toBe(0.2); // low by default: same sentence, same translation
      expect(bodyData.messages[0].role).toBe('system');
      expect(bodyData.messages[1].role).toBe('user');
      expect(bodyData.messages[1].content).toContain('=== SENTENCE TO TRANSLATE ===');
      expect(bodyData.messages[1].content).toContain('nʉnka gontka');
      // OpenAI-style usage: prompt/completion; it does not report cache → null
      expect(loggedRows()[0]).toMatchObject({
        input_tokens: 2500,
        output_tokens: 120,
        cache_read_tokens: null,
        cache_creation_tokens: null,
      });
    });

    it('the configured temperature is sent as is, even 0', async () => {
      const fakeFetch = jest.fn().mockResolvedValue(okResponse(TRANSLATION_JSON));
      global.fetch = fakeFetch as unknown as typeof fetch;
      await createService(null, { ...CONFIG_COMPATIBLE, temperature: 0 }).translate(dmToEs('ñingui'));
      expect(JSON.parse(fakeFetch.mock.calls[0][1].body).temperature).toBe(0);
    });

    it('if the provider rejects response_format (400) it retries without it', async () => {
      const fakeFetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
        .mockResolvedValueOnce(okResponse(TRANSLATION_JSON));
      global.fetch = fakeFetch as unknown as typeof fetch;

      const r = await createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'));
      expect(r.translation).toBe('el agua');
      expect(fakeFetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fakeFetch.mock.calls[1][1].body).response_format).toBeUndefined();
    });

    it('on 429 it waits for what Retry-After asks and retries; if it persists it gives up with 429', async () => {
      const sleep = jest.spyOn(clock, 'sleep').mockResolvedValue();
      try {
        const fakeFetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '7' }), json: async () => ({}) })
          .mockResolvedValueOnce(okResponse(TRANSLATION_JSON));
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
      const fakeFetch = jest.fn().mockResolvedValue(okResponse(TRANSLATION_JSON));
      global.fetch = fakeFetch as unknown as typeof fetch;
      await createService(null, { ...CONFIG_COMPATIBLE, apiKey: undefined }).translate(dmToEs('nʉnka'));
      expect(fakeFetch.mock.calls[0][1].headers.authorization).toBeUndefined();
    });

    it('401 → 502 about TRANSLATOR_API_KEY; 404 → 502 mentioning the model', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(/TRANSLATOR_API_KEY/);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(/gpt-oss-120b/);
    });

    it('connection refused → 504; response without choices → 502', async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(GatewayTimeoutException);
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rare: true }) }) as unknown as typeof fetch;
      await expect(createService(null, CONFIG_COMPATIBLE).translate(dmToEs('nʉnka'))).rejects.toThrow(BadGatewayException);
    });
  });
});
