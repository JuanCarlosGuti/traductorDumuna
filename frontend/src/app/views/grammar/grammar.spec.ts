import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { Lemma, ConjugationTable } from '../../core/models';
import { GrammarView } from './grammar';

const LEMMAS: Lemma[] = [
  { lemma: 'tener', forms: 72 },
  { lemma: 'leer', forms: 6 },
];

const READ_TABLE: ConjugationTable = {
  lemma: 'leer',
  conjugations: [
    { id: 1, damana: 'nʉjkasheshisha', spanish: 'me lee', lemma: 'leer', source: 'doc', notes: null },
    { id: 2, damana: 'naijkasheshisha', spanish: 'nos lee', lemma: 'leer', source: 'doc', notes: 'plural' },
  ],
};

describe('Gramatica', () => {
  let fixture: ComponentFixture<GrammarView>;
  let http: HttpTestingController;

  const start = async (lemmas: Lemma[] = LEMMAS) => {
    fixture = await mount(GrammarView);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/grammar/lemmas').flush(lemmas);
    await settle(fixture);
  };

  afterEach(() => http.verify());

  it('lists the lemmas with their number of forms', async () => {
    await start();
    expect(text(fixture)).toContain('tener');
    expect(text(fixture)).toContain('72');
  });

  it('choosing a lemma loads its conjugation table', async () => {
    await start();
    const [, read] = queryAll(fixture, '.lemas button');
    read.click();
    await settle(fixture);

    http.expectOne('/api/grammar/lemmas/leer').flush(READ_TABLE);
    await settle(fixture);

    expect(text(fixture)).toContain('nʉjkasheshisha'); // ʉ intact
    expect(text(fixture)).toContain('nos lee');
    expect(queryAll(fixture, 'tbody tr').length).toBe(2);
  });

  it('Damana forms are marked with lang="mbp" for the screen reader', async () => {
    await start();
    queryAll(fixture, '.lemas button')[1].click();
    await settle(fixture);
    http.expectOne('/api/grammar/lemmas/leer').flush(READ_TABLE);
    await settle(fixture);

    const forms = queryAll(fixture, 'td[lang="mbp"]').map((e) => e.textContent?.trim());
    expect(forms).toEqual(['nʉjkasheshisha', 'naijkasheshisha']);
  });

  it('a lemma the backend cannot find is reported without breaking the list', async () => {
    await start();
    queryAll(fixture, '.lemas button')[1].click();
    await settle(fixture);
    http.expectOne('/api/grammar/lemmas/leer').flush({}, { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(text(fixture)).toContain('No se pudo cargar la conjugación');
    expect(queryAll(fixture, '.lemas button').length).toBe(2); // the list is still there
  });

  it('without conjugations it suggests running the importer', async () => {
    await start([]);
    expect(text(fixture)).toContain('¿Se ejecutó el importador?');
  });

  it('if the initial load fails it says so', async () => {
    fixture = await mount(GrammarView);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/grammar/lemmas').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture)).toContain('No se pudieron cargar los lemas');
  });
});
