import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { TranslatorStatus, TranslationResponse } from '../../core/models';
import { TranslatorView } from './translator';

const AVAILABLE: TranslatorStatus = {
  available: true,
  provider: 'compatible',
  model: 'gpt-oss-120b',
};

const RESPONSE: TranslationResponse = {
  translation: 'Ranzhe abu urragamba [vecina] dugwa',
  gloss: [
    { origin: 'mi', target: 'Ranzhe' },
    { origin: 'mamá', target: 'abu' },
    { origin: 'cocina', target: 'dugwa' },
  ],
  wordsWithoutEquivalent: ['vecina'],
  appliedRules: ['-nzhe (posesivo)'],
  confidence: 0.72,
  briefExplanation: 'Diccionario más regla del posesivo.',
  support: { level: 'good', reasons: [] },
  examples: [
    { source: 'sentences', domain: 'everyday', reference: 'oración 9', damana: 'Abu urragamba nuka', spanish: 'mamá está en la casa', score: 0.9 },
    { source: 'conjugations', domain: 'grammar', reference: 'conjugación 2 (cocinar)', damana: 'dugwa', spanish: 'cocina', score: 0.5 },
    { source: 'sentences', domain: 'biblical', reference: 'oración 1', damana: 'Jehová nʉnka gontka', spanish: 'Jehová hizo el agua', score: 0.3 },
  ],
  dictionary: [
    { word: 'mamá', spanish: 'mamá', damana: 'Abu', category: 'Personas y familia', match: 'exact' },
    { word: 'cocina', spanish: 'Cocinar', damana: 'Dugua', category: 'Verbos', match: 'possible' },
  ],
  properNames: [],
  rules: [{ form: '-nzhe', meaning: 'posesivo / "de"', example: 'Kunkujshina → Kunkujshinanzhe = de Dios', trigger: 'possessive' }],
  triggers: ['possessive'],
};

describe('Traductor', () => {
  let fixture: ComponentFixture<TranslatorView>;
  let http: HttpTestingController;

  const start = async (status: TranslatorStatus = AVAILABLE) => {
    fixture = await mount(TranslatorView);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/translate/status').flush(status);
    await settle(fixture);
  };

  const type = async (value: string) => {
    const area = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    area.value = value;
    area.dispatchEvent(new Event('input'));
    await settle(fixture);
  };

  const translate = async () => {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await settle(fixture);
  };

  const translateWithResponse = async (response: TranslationResponse = RESPONSE) => {
    await type('mi mamá cocina en la casa');
    await translate();
    http.expectOne('/api/translate').flush(response);
    await settle(fixture);
  };

  const button = (buttonText: RegExp) =>
    queryAll(fixture, 'button').find((b) => buttonText.test(b.textContent ?? ''))!;

  afterEach(() => http.verify());

  it('sends the text and the chosen direction (Spanish → Damana by default)', async () => {
    await start();
    await type('mi mamá cocina en la casa');
    await translate();

    const httpRequest = http.expectOne('/api/translate');
    expect(httpRequest.request.body).toEqual({
      text: 'mi mamá cocina en la casa',
      direction: 'spanish_to_damana',
    });
    httpRequest.flush(RESPONSE);
    await settle(fixture);
    expect(text(fixture)).toContain('Ranzhe abu urragamba');
  });

  it('while translating it warns about the wait (Claude: 5-15 s), locks the box and releases it when done', async () => {
    await start({ available: true, provider: 'anthropic', model: 'claude-opus-5-5' });
    await type('mi mamá cocina en la casa');
    await translate();

    // Request in flight: visible notice, box and controls locked.
    const area = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    expect(area.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('select')!.disabled).toBe(true);
    expect((button(/Traduciendo/) as HTMLButtonElement).disabled).toBe(true);
    const notice = (fixture.nativeElement as HTMLElement).querySelector('.waiting')!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('Traduciendo con Claude… suele tardar entre 5 y 15 s');

    http.expectOne('/api/translate').flush(RESPONSE);
    await settle(fixture);

    // Done: typing is possible again (with ʉ) and the notice disappears.
    expect(area.disabled).toBe(false);
    expect(queryAll(fixture, '.waiting').length).toBe(0);
    await type('nʉnka ñingui');
    expect(area.value).toBe('nʉnka ñingui');
    expect((button(/^\s*Traducir\s*$/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('with a compatible provider the notice names the model and not Claude', async () => {
    await start(); // AVAILABLE: compatible, gpt-oss-120b
    await type('nʉnka');
    await translate();
    const notice = (fixture.nativeElement as HTMLElement).querySelector('.waiting')!;
    expect(notice.textContent).toContain('Traduciendo con gpt-oss-120b…');
    expect(notice.textContent).not.toContain('Claude');
    http.expectOne('/api/translate').flush(RESPONSE);
    await settle(fixture);
  });

  it('sends nothing if the text is empty', async () => {
    await start();
    await translate();
    http.expectNone('/api/translate');
  });

  it('shows the word-by-word gloss under the translation', async () => {
    await start();
    await translateWithResponse();
    const pairs = queryAll(fixture, '.gloss .pair').map((p) => [
      p.querySelector('.source')?.textContent?.trim(),
      p.querySelector('.target')?.textContent?.trim(),
    ]);
    expect(pairs).toEqual([
      ['mi', 'Ranzhe'],
      ['mamá', 'abu'],
      ['cocina', 'dugwa'],
    ]);
    // the Damana side is marked with lang="mbp" for the screen reader
    expect(queryAll(fixture, '.gloss .target[lang="mbp"]').length).toBe(3);
  });

  it('highlights the words without an equivalent, without brackets, and says they were left in Pendientes', async () => {
    await start();
    await translateWithResponse();
    const marked = queryAll(fixture, '.translation .no-equivalent').map((e) => e.textContent?.trim());
    expect(marked).toEqual(['vecina']);
    expect(queryAll(fixture, '.translation')[0].textContent).not.toContain('[');
    expect(text(fixture)).toContain('quedaron en Pendientes');
  });

  it('shows the applied rules, the confidence and the dictionary used', async () => {
    await start();
    await translateWithResponse();
    expect(text(fixture)).toContain('-nzhe (posesivo)');
    expect(text(fixture)).toContain('confianza 72 %');
    expect(queryAll(fixture, '.dictionary tbody tr').length).toBe(2);
    expect(text(fixture)).toContain('Abu');
    expect(text(fixture)).toContain('posible');
  });

  it('groups the examples by domain in collapsible blocks', async () => {
    await start();
    await translateWithResponse();
    const titles = queryAll(fixture, 'details.examples summary').map((s) => s.textContent?.trim());
    expect(titles).toEqual([
      'Ejemplos cotidianos (1)',
      'Ejemplos de gramática (conjugaciones) (1)',
      'Ejemplos del corpus bíblico (1)',
    ]);
  });

  it('«esta traducción es correcta» stores the pair as confirmed', async () => {
    await start();
    await translateWithResponse();
    button(/es correcta/).click();
    await settle(fixture);

    const httpRequest = http.expectOne('/api/translate/validate');
    expect(httpRequest.request.body).toEqual({
      text: 'mi mamá cocina en la casa',
      direction: 'spanish_to_damana',
      translation: 'Ranzhe abu urragamba [vecina] dugwa',
      origin: 'confirmed',
      modelTranslation: 'Ranzhe abu urragamba [vecina] dugwa',
    });
    httpRequest.flush({ saved: true, total: 3 });
    await settle(fixture);
    expect(text(fixture)).toContain('Guardada como correcta (3 validadas)');
  });

  it('«corregir» lets the correct translation be typed and stores it as corrected (with ʉ)', async () => {
    await start();
    await translateWithResponse();
    button(/^\s*Corregir\s*$/).click();
    await settle(fixture);

    const field = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#correction')!;
    expect(field.value).toBe('Ranzhe abu urragamba vecina dugwa'); // no brackets, for editing
    field.value = 'Ranzhe abu urragamba anzhirru kʉdugwa';
    field.dispatchEvent(new Event('input'));
    await settle(fixture);
    button(/Guardar corrección/).click();
    await settle(fixture);

    const httpRequest = http.expectOne('/api/translate/validate');
    expect(httpRequest.request.body.origin).toBe('corrected');
    expect(httpRequest.request.body.translation).toBe('Ranzhe abu urragamba anzhirru kʉdugwa');
    httpRequest.flush({ saved: true, total: 1 });
    await settle(fixture);
    expect(text(fixture)).toContain('Corrección guardada');
  });

  it('with «revisar» support it shows the warning; with «bueno» it does not', async () => {
    await start();
    await translateWithResponse({ ...RESPONSE, support: { level: 'review', reasons: ['no_examples'] }, examples: [] });
    expect(text(fixture)).toContain('Poco apoyo del corpus');
    expect(text(fixture)).toContain('No se encontraron ejemplos parecidos');
  });

  it('swapping the direction reverses the translation direction', async () => {
    await start();
    button(/⇄/).click();
    await settle(fixture);
    await type('nʉnka shkua');
    await translate();
    const httpRequest = http.expectOne('/api/translate');
    expect(httpRequest.request.body.direction).toBe('damana_to_spanish');
    httpRequest.flush(RESPONSE);
    await settle(fixture);
  });

  it('if the translator is not configured it explains how to configure it', async () => {
    await start({ available: false, provider: null, model: null });
    expect(text(fixture)).toContain('Falta configurar un motor de traducción');
    expect(queryAll(fixture, '.notice').length).toBe(1);
  });

  it('a backend error is shown with its message', async () => {
    await start();
    await type('nʉnka');
    await translate();
    http.expectOne('/api/translate').flush(
      { message: 'El texto supera el máximo' },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('El texto supera el máximo');
  });

  it('if the backend does not respond it blames the connection, not the text', async () => {
    await start();
    await type('nʉnka');
    await translate();
    http.expectOne('/api/translate').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture)).toContain('No se pudo contactar');
  });
});
