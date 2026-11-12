import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { EntradaVocabulario, Frecuencia } from '../../core/modelos';
import { Diccionario } from './diccionario';

const frecuencia = (palabra: string, n: number): Frecuencia => ({
  palabra,
  frecuencia: n,
  traduccion: null,
  categoria: null,
});

const VOCABULARIO: EntradaVocabulario[] = [
  { id: 1, espanol: 'agua', damana: 'nʉnka', categoria: 'Otros', notas: null, fuente: 'dic' },
  { id: 2, espanol: 'año', damana: 'ñingui', categoria: 'Otros', notas: null, fuente: 'dic' },
  { id: 3, espanol: 'ano', damana: 'gunkua', categoria: 'Otros', notas: null, fuente: 'dic' },
];

describe('Diccionario', () => {
  let fixture: ComponentFixture<Diccionario>;
  let http: HttpTestingController;

  const filtrar = async (valor: string) => {
    const campo = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await asentar(fixture);
  };

  const arrancar = async (palabras: Frecuencia[]) => {
    fixture = await montar(Diccionario);
    http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url === '/api/frecuencias').flush(palabras);
    http.expectOne('/api/vocabulario').flush(VOCABULARIO);
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('lists the Damana words with their frequency', async () => {
    await arrancar([frecuencia('nʉnka', 283), frecuencia('ñingui', 120)]);
    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).toContain('283');
  });

  it('the filter ignores accents but does NOT confuse ʉ with u', async () => {
    await arrancar([frecuencia('nʉnka', 283), frecuencia('nunkuame', 241)]);
    await filtrar('nʉnka');
    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).not.toContain('nunkuame');
  });

  it('filtering by «nunka» does not find «nʉnka»: they are different words', async () => {
    await arrancar([frecuencia('nʉnka', 283)]);
    await filtrar('nunka');
    expect(texto(fixture)).not.toContain('nʉnka');
  });

  it('in Spanish mode the filter tells «año» from «ano»', async () => {
    await arrancar([frecuencia('nʉnka', 283)]);
    // Careful: the Damana mode button says «damana → español», so searching
    // by the text «español» would catch the wrong one. Go by position.
    const [, aEspanol] = buscarTodos(fixture, '.modos button');
    aEspanol.click();
    await asentar(fixture);

    await filtrar('año');
    expect(texto(fixture)).toContain('ñingui');
    expect(texto(fixture)).not.toContain('gunkua');
  });

  it('pages 50 at a time and the next button advances', async () => {
    const muchas = Array.from({ length: 120 }, (_, i) =>
      frecuencia(`palabra${String(i).padStart(3, '0')}`, 120 - i),
    );
    await arrancar(muchas);
    expect(buscarTodos(fixture, 'tbody tr').length).toBe(50);

    const [, siguiente] = buscarTodos(fixture, '.paginador button');
    siguiente.click();
    await asentar(fixture);
    expect(texto(fixture)).toContain('palabra050');
    expect(texto(fixture)).not.toContain('palabra000');
  });

  it('filtering goes back to the first page', async () => {
    const muchas = Array.from({ length: 120 }, (_, i) =>
      frecuencia(`palabra${String(i).padStart(3, '0')}`, 120 - i),
    );
    await arrancar(muchas);
    const [, siguiente] = buscarTodos(fixture, '.paginador button');
    siguiente.click();
    await asentar(fixture);

    await filtrar('palabra00');
    expect(texto(fixture)).toContain('palabra000');
  });
});
