import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { Lema, TablaConjugacion } from '../../core/modelos';
import { Gramatica } from './gramatica';

const LEMAS: Lema[] = [
  { lema: 'tener', formas: 72 },
  { lema: 'leer', formas: 6 },
];

const TABLA_LEER: TablaConjugacion = {
  lema: 'leer',
  conjugaciones: [
    { id: 1, damana: 'nʉjkasheshisha', espanol: 'me lee', lema: 'leer', fuente: 'doc', notas: null },
    { id: 2, damana: 'naijkasheshisha', espanol: 'nos lee', lema: 'leer', fuente: 'doc', notas: 'plural' },
  ],
};

describe('Gramatica', () => {
  let fixture: ComponentFixture<Gramatica>;
  let http: HttpTestingController;

  const arrancar = async (lemas: Lema[] = LEMAS) => {
    fixture = await montar(Gramatica);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/gramatica/lemas').flush(lemas);
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('lists the lemmas with their number of forms', async () => {
    await arrancar();
    expect(texto(fixture)).toContain('tener');
    expect(texto(fixture)).toContain('72');
  });

  it('choosing a lemma loads its conjugation table', async () => {
    await arrancar();
    const [, leer] = buscarTodos(fixture, '.lemas button');
    leer.click();
    await asentar(fixture);

    http.expectOne('/api/gramatica/lemas/leer').flush(TABLA_LEER);
    await asentar(fixture);

    expect(texto(fixture)).toContain('nʉjkasheshisha'); // ʉ intact
    expect(texto(fixture)).toContain('nos lee');
    expect(buscarTodos(fixture, 'tbody tr').length).toBe(2);
  });

  it('Damana forms are marked with lang="mbp" for the screen reader', async () => {
    await arrancar();
    buscarTodos(fixture, '.lemas button')[1].click();
    await asentar(fixture);
    http.expectOne('/api/gramatica/lemas/leer').flush(TABLA_LEER);
    await asentar(fixture);

    const formas = buscarTodos(fixture, 'td[lang="mbp"]').map((e) => e.textContent?.trim());
    expect(formas).toEqual(['nʉjkasheshisha', 'naijkasheshisha']);
  });

  it('a lemma the backend cannot find is reported without breaking the list', async () => {
    await arrancar();
    buscarTodos(fixture, '.lemas button')[1].click();
    await asentar(fixture);
    http.expectOne('/api/gramatica/lemas/leer').flush({}, { status: 404, statusText: 'Not Found' });
    await asentar(fixture);

    expect(texto(fixture)).toContain('No se pudo cargar la conjugación');
    expect(buscarTodos(fixture, '.lemas button').length).toBe(2); // the list is still there
  });

  it('without conjugations it suggests running the importer', async () => {
    await arrancar([]);
    expect(texto(fixture)).toContain('¿Se ejecutó el importador?');
  });

  it('if the initial load fails it says so', async () => {
    fixture = await montar(Gramatica);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/gramatica/lemas').error(new ProgressEvent('error'));
    await asentar(fixture);
    expect(texto(fixture)).toContain('No se pudieron cargar los lemas');
  });
});
