import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { FichaPalabra } from '../../core/modelos';
import { Ficha } from './ficha';

const FICHA: FichaPalabra = {
  palabra: 'nʉnka',
  entradasVocabulario: [
    { espanol: 'agua', categoria: 'Otros', notas: null, fuente: 'dic' },
  ],
  formasVerbales: [],
  frecuenciaTotal: 283,
  frecuenciaPorFuente: [{ fuente: 'oraciones', frecuencia: 280 }],
  concordancias: [
    {
      fuente: 'oraciones',
      id: 1,
      referencia: 'oración 1',
      fragmento: 'naka <mark>nʉnka</mark> gontka',
      textoParalelo: 'el agua es una',
      puntaje: null,
    },
  ],
  traduccionesCandidatas: [{ palabra: 'agua', coocurrencias: 12 }],
};

describe('Ficha', () => {
  let fixture: ComponentFixture<Ficha>;
  let http: HttpTestingController;
  let router: Router;
  let paramMap: BehaviorSubject<ParamMap>;

  const arrancarCon = async (palabra: string) => {
    paramMap = new BehaviorSubject(convertToParamMap({ palabra }));
    fixture = await montar(Ficha, [{ provide: ActivatedRoute, useValue: { paramMap } }]);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('pide la palabra de la URL y pinta su ficha', async () => {
    await arrancarCon('nʉnka');
    // encodeURIComponent: la ʉ viaja porcentificada en la ruta
    http.expectOne('/api/palabra/n%CA%89nka').flush(FICHA);
    await asentar(fixture);

    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).toContain('agua');
    expect(texto(fixture)).toContain('283');
  });

  it('marca la palabra damana con lang="mbp"', async () => {
    await arrancarCon('nʉnka');
    http.expectOne('/api/palabra/n%CA%89nka').flush(FICHA);
    await asentar(fixture);
    expect(buscarTodos(fixture, 'h1[lang="mbp"]')[0].textContent).toContain('nʉnka');
  });

  it('una candidata lleva a buscarla en español', async () => {
    await arrancarCon('nʉnka');
    http.expectOne('/api/palabra/n%CA%89nka').flush(FICHA);
    await asentar(fixture);

    buscarTodos(fixture, '.candidatas button')[0].click();
    await asentar(fixture);
    expect(router.navigate).toHaveBeenCalledWith(['/buscar'], {
      queryParams: { q: 'agua', idioma: 'espanol' },
    });
  });

  it('navegar a otra palabra recarga la ficha', async () => {
    await arrancarCon('nʉnka');
    http.expectOne('/api/palabra/n%CA%89nka').flush(FICHA);
    await asentar(fixture);

    paramMap.next(convertToParamMap({ palabra: 'ñingui' }));
    await asentar(fixture);
    http.expectOne('/api/palabra/%C3%B1ingui').flush({
      ...FICHA,
      palabra: 'ñingui',
      entradasVocabulario: [],
    });
    await asentar(fixture);
    expect(texto(fixture)).toContain('ñingui'); // la ñ no se degrada a n
  });

  it('una palabra inexistente se anuncia sin romper la vista', async () => {
    await arrancarCon('zzzz');
    http.expectOne('/api/palabra/zzzz').flush({}, { status: 404, statusText: 'Not Found' });
    await asentar(fixture);
    expect(texto(fixture)).toContain('zzzz');
  });
});
