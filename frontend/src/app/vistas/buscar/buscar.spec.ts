import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { RespuestaBusqueda } from '../../core/modelos';
import { Buscar } from './buscar';

const RESULTADOS: RespuestaBusqueda = {
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
  let fixture: ComponentFixture<Buscar>;
  let http: HttpTestingController;
  let router: Router;
  let queryParamMap: BehaviorSubject<ParamMap>;

  /** El estado de la búsqueda vive en la URL: se simula la ruta activa. */
  const arrancarCon = async (params: Record<string, string>) => {
    queryParamMap = new BehaviorSubject(convertToParamMap(params));
    fixture = await montar(Buscar, [
      { provide: ActivatedRoute, useValue: { queryParamMap } },
    ]);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('sin término en la URL no llama al backend', async () => {
    await arrancarCon({});
    http.expectNone(() => true);
  });

  it('con término en la URL busca al entrar y pinta los resultados', async () => {
    await arrancarCon({ q: 'nʉnka' });
    const peticion = http.expectOne((r) => r.url === '/api/buscar');
    expect(peticion.request.params.get('q')).toBe('nʉnka');
    expect(peticion.request.params.get('idioma')).toBe('damana');
    peticion.flush(RESULTADOS);
    await asentar(fixture);

    expect(texto(fixture)).toContain('oración 1');
    expect(texto(fixture)).toContain('el agua es una');
  });

  it('respeta el idioma y la fuente que vengan en la URL', async () => {
    await arrancarCon({ q: 'agua', idioma: 'espanol', fuente: 'frases' });
    const peticion = http.expectOne((r) => r.url === '/api/buscar');
    expect(peticion.request.params.get('idioma')).toBe('espanol');
    expect(peticion.request.params.get('fuente')).toBe('frases');
    peticion.flush({ ...RESULTADOS, idioma: 'espanol' });
    await asentar(fixture);
  });

  it('navegar a otro término relanza la búsqueda: el «atrás» del navegador funciona', async () => {
    await arrancarCon({ q: 'nʉnka' });
    http.expectOne((r) => r.url === '/api/buscar').flush(RESULTADOS);
    await asentar(fixture);

    queryParamMap.next(convertToParamMap({ q: 'ñingui' }));
    await asentar(fixture);
    const segunda = http.expectOne((r) => r.url === '/api/buscar');
    expect(segunda.request.params.get('q')).toBe('ñingui'); // ñ intacta
    segunda.flush({ ...RESULTADOS, consulta: 'ñingui', resultados: [], total: 0 });
    await asentar(fixture);
  });

  it('enviar el formulario navega en vez de buscar a mano', async () => {
    await arrancarCon({});
    const campo = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    campo.value = 'nʉnka';
    campo.dispatchEvent(new Event('input'));
    await asentar(fixture);

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await asentar(fixture);

    expect(router.navigate).toHaveBeenCalled();
    const [, extras] = vi.mocked(router.navigate).mock.calls[0];
    expect((extras as { queryParams: { q: string } }).queryParams.q).toBe('nʉnka');
  });

  it('si el backend falla avisa y no deja resultados viejos', async () => {
    await arrancarCon({ q: 'nʉnka' });
    http.expectOne((r) => r.url === '/api/buscar').error(new ProgressEvent('error'));
    await asentar(fixture);
    expect(texto(fixture)).toContain('No se pudo completar la búsqueda');
  });

  it('cero resultados no es un error', async () => {
    await arrancarCon({ q: 'zzzz' });
    http.expectOne((r) => r.url === '/api/buscar').flush({
      ...RESULTADOS,
      total: 0,
      resultados: [],
    });
    await asentar(fixture);
    expect(texto(fixture)).not.toContain('No se pudo completar');
    expect(buscarTodos(fixture, '.resultado').length).toBe(0);
  });
});
