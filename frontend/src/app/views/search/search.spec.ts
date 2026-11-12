import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { SearchResponse } from '../../core/models';
import { SearchView } from './search';

const RESULTS: SearchResponse = {
  consulta: 'nʉnka',
  idioma: 'damana',
  modo: 'concordancia',
  total: 1,
  resultados: [
    {
      fuente: 'oraciones',
      id: 1,
      referencia: 'oración 1',
      fragmento: 'naka <mark>nʉnka</mark> gontka',
      textoParalelo: 'el agua es una',
      puntaje: null,
    },
  ],
};

describe('Buscar', () => {
  let fixture: ComponentFixture<SearchView>;
  let http: HttpTestingController;
  let router: Router;
  let queryParamMap: BehaviorSubject<ParamMap>;

  /** The search state lives in the URL: the active route is simulated. */
  const startWith = async (params: Record<string, string>) => {
    queryParamMap = new BehaviorSubject(convertToParamMap(params));
    fixture = await mount(SearchView, [
      { provide: ActivatedRoute, useValue: { queryParamMap } },
    ]);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await settle(fixture);
  };

  afterEach(() => http.verify());

  it('without a term in the URL it does not call the backend', async () => {
    await startWith({});
    http.expectNone(() => true);
  });

  it('with a term in the URL it searches on entry and renders the results', async () => {
    await startWith({ q: 'nʉnka' });
    const httpRequest = http.expectOne((r) => r.url === '/api/buscar');
    expect(httpRequest.request.params.get('q')).toBe('nʉnka');
    expect(httpRequest.request.params.get('idioma')).toBe('damana');
    httpRequest.flush(RESULTS);
    await settle(fixture);

    expect(text(fixture)).toContain('oración 1');
    expect(text(fixture)).toContain('el agua es una');
  });

  it('respects the language and source given in the URL', async () => {
    await startWith({ q: 'agua', idioma: 'espanol', fuente: 'frases' });
    const httpRequest = http.expectOne((r) => r.url === '/api/buscar');
    expect(httpRequest.request.params.get('idioma')).toBe('espanol');
    expect(httpRequest.request.params.get('fuente')).toBe('frases');
    httpRequest.flush({ ...RESULTS, idioma: 'espanol' });
    await settle(fixture);
  });

  it('navigating to another term relaunches the search: the browser «back» works', async () => {
    await startWith({ q: 'nʉnka' });
    http.expectOne((r) => r.url === '/api/buscar').flush(RESULTS);
    await settle(fixture);

    queryParamMap.next(convertToParamMap({ q: 'ñingui' }));
    await settle(fixture);
    const second = http.expectOne((r) => r.url === '/api/buscar');
    expect(second.request.params.get('q')).toBe('ñingui'); // ñ intact
    second.flush({ ...RESULTS, consulta: 'ñingui', resultados: [], total: 0 });
    await settle(fixture);
  });

  it('submitting the form navigates instead of searching by hand', async () => {
    await startWith({});
    const field = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    field.value = 'nʉnka';
    field.dispatchEvent(new Event('input'));
    await settle(fixture);

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(router.navigate).toHaveBeenCalled();
    const [, extras] = vi.mocked(router.navigate).mock.calls[0];
    expect((extras as { queryParams: { q: string } }).queryParams.q).toBe('nʉnka');
  });

  it('if the backend fails it warns and leaves no stale results', async () => {
    await startWith({ q: 'nʉnka' });
    http.expectOne((r) => r.url === '/api/buscar').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture)).toContain('No se pudo completar la búsqueda');
  });

  it('zero results is not an error', async () => {
    await startWith({ q: 'zzzz' });
    http.expectOne((r) => r.url === '/api/buscar').flush({
      ...RESULTS,
      total: 0,
      resultados: [],
    });
    await settle(fixture);
    expect(text(fixture)).not.toContain('No se pudo completar');
    expect(queryAll(fixture, '.resultado').length).toBe(0);
  });
});
