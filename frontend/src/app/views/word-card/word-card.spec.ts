import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { WordCard } from '../../core/models';
import { WordCardView } from './word-card';

const WORD_CARD: WordCard = {
  word: 'nʉnka',
  vocabularyEntries: [
    { spanish: 'agua', category: 'Otros', notes: null, source: 'dic' },
  ],
  verbForms: [],
  totalFrequency: 283,
  frequencyBySource: [{ source: 'oraciones', frequency: 280 }],
  concordances: [
    {
      source: 'oraciones',
      id: 1,
      reference: 'oración 1',
      fragment: 'naka <mark>nʉnka</mark> gontka',
      parallelText: 'el agua es una',
      score: null,
    },
  ],
  candidateTranslations: [{ word: 'agua', cooccurrences: 12 }],
};

describe('Ficha', () => {
  let fixture: ComponentFixture<WordCardView>;
  let http: HttpTestingController;
  let router: Router;
  let paramMap: BehaviorSubject<ParamMap>;

  const startWith = async (word: string) => {
    paramMap = new BehaviorSubject(convertToParamMap({ palabra: word }));
    fixture = await mount(WordCardView, [{ provide: ActivatedRoute, useValue: { paramMap } }]);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await settle(fixture);
  };

  afterEach(() => http.verify());

  it('requests the word in the URL and renders its card', async () => {
    await startWith('nʉnka');
    // encodeURIComponent: the ʉ travels percent-encoded in the path
    http.expectOne('/api/word/n%CA%89nka').flush(WORD_CARD);
    await settle(fixture);

    expect(text(fixture)).toContain('nʉnka');
    expect(text(fixture)).toContain('agua');
    expect(text(fixture)).toContain('283');
  });

  it('marks the Damana word with lang="mbp"', async () => {
    await startWith('nʉnka');
    http.expectOne('/api/word/n%CA%89nka').flush(WORD_CARD);
    await settle(fixture);
    expect(queryAll(fixture, 'h1[lang="mbp"]')[0].textContent).toContain('nʉnka');
  });

  it('a candidate leads to searching it in Spanish', async () => {
    await startWith('nʉnka');
    http.expectOne('/api/word/n%CA%89nka').flush(WORD_CARD);
    await settle(fixture);

    queryAll(fixture, '.candidatas button')[0].click();
    await settle(fixture);
    expect(router.navigate).toHaveBeenCalledWith(['/buscar'], {
      queryParams: { q: 'agua', idioma: 'espanol' },
    });
  });

  it('navigating to another word reloads the card', async () => {
    await startWith('nʉnka');
    http.expectOne('/api/word/n%CA%89nka').flush(WORD_CARD);
    await settle(fixture);

    paramMap.next(convertToParamMap({ palabra: 'ñingui' }));
    await settle(fixture);
    http.expectOne('/api/word/%C3%B1ingui').flush({
      ...WORD_CARD,
      word: 'ñingui',
      vocabularyEntries: [],
    });
    await settle(fixture);
    expect(text(fixture)).toContain('ñingui'); // the ñ is not degraded to n
  });

  it('a nonexistent word is announced without breaking the view', async () => {
    await startWith('zzzz');
    http.expectOne('/api/word/zzzz').flush({}, { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    expect(text(fixture)).toContain('zzzz');
  });
});
