import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { VocabularyEntry, Frequency } from '../../core/models';
import { DictionaryView } from './dictionary';

const frequency = (word: string, n: number): Frequency => ({
  palabra: word,
  frecuencia: n,
  traduccion: null,
  categoria: null,
});

const VOCABULARY: VocabularyEntry[] = [
  { id: 1, espanol: 'agua', damana: 'nʉnka', categoria: 'Otros', notas: null, fuente: 'dic' },
  { id: 2, espanol: 'año', damana: 'ñingui', categoria: 'Otros', notas: null, fuente: 'dic' },
  { id: 3, espanol: 'ano', damana: 'gunkua', categoria: 'Otros', notas: null, fuente: 'dic' },
];

describe('Diccionario', () => {
  let fixture: ComponentFixture<DictionaryView>;
  let http: HttpTestingController;

  const applyFilter = async (value: string) => {
    const field = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle(fixture);
  };

  const start = async (words: Frequency[]) => {
    fixture = await mount(DictionaryView);
    http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url === '/api/frecuencias').flush(words);
    http.expectOne('/api/vocabulario').flush(VOCABULARY);
    await settle(fixture);
  };

  afterEach(() => http.verify());

  it('lists the Damana words with their frequency', async () => {
    await start([frequency('nʉnka', 283), frequency('ñingui', 120)]);
    expect(text(fixture)).toContain('nʉnka');
    expect(text(fixture)).toContain('283');
  });

  it('the filter ignores accents but does NOT confuse ʉ with u', async () => {
    await start([frequency('nʉnka', 283), frequency('nunkuame', 241)]);
    await applyFilter('nʉnka');
    expect(text(fixture)).toContain('nʉnka');
    expect(text(fixture)).not.toContain('nunkuame');
  });

  it('filtering by «nunka» does not find «nʉnka»: they are different words', async () => {
    await start([frequency('nʉnka', 283)]);
    await applyFilter('nunka');
    expect(text(fixture)).not.toContain('nʉnka');
  });

  it('in Spanish mode the filter tells «año» from «ano»', async () => {
    await start([frequency('nʉnka', 283)]);
    // Careful: the Damana mode button says «damana → español», so searching
    // by the text «español» would catch the wrong one. Go by position.
    const [, toSpanish] = queryAll(fixture, '.modos button');
    toSpanish.click();
    await settle(fixture);

    await applyFilter('año');
    expect(text(fixture)).toContain('ñingui');
    expect(text(fixture)).not.toContain('gunkua');
  });

  it('pages 50 at a time and the next button advances', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      frequency(`palabra${String(i).padStart(3, '0')}`, 120 - i),
    );
    await start(many);
    expect(queryAll(fixture, 'tbody tr').length).toBe(50);

    const [, next] = queryAll(fixture, '.paginador button');
    next.click();
    await settle(fixture);
    expect(text(fixture)).toContain('palabra050');
    expect(text(fixture)).not.toContain('palabra000');
  });

  it('filtering goes back to the first page', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      frequency(`palabra${String(i).padStart(3, '0')}`, 120 - i),
    );
    await start(many);
    const [, next] = queryAll(fixture, '.paginador button');
    next.click();
    await settle(fixture);

    await applyFilter('palabra00');
    expect(text(fixture)).toContain('palabra000');
  });
});
