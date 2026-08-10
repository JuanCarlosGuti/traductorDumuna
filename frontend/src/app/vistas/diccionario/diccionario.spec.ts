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

  it('lista las palabras damana con su frecuencia', async () => {
    await arrancar([frecuencia('nʉnka', 283), frecuencia('ñingui', 120)]);
    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).toContain('283');
  });

  it('el filtro ignora tildes pero NO confunde ʉ con u', async () => {
    await arrancar([frecuencia('nʉnka', 283), frecuencia('nunkuame', 241)]);
    await filtrar('nʉnka');
    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).not.toContain('nunkuame');
  });

  it('filtrar por «nunka» no encuentra «nʉnka»: son palabras distintas', async () => {
    await arrancar([frecuencia('nʉnka', 283)]);
    await filtrar('nunka');
    expect(texto(fixture)).not.toContain('nʉnka');
  });

  it('en modo español el filtro distingue «año» de «ano»', async () => {
    await arrancar([frecuencia('nʉnka', 283)]);
    // Ojo: el botón del modo damana dice «damana → español», así que buscar
    // por texto «español» cazaría el equivocado. Se va por posición.
    const [, aEspanol] = buscarTodos(fixture, '.modos button');
    aEspanol.click();
    await asentar(fixture);

    await filtrar('año');
    expect(texto(fixture)).toContain('ñingui');
    expect(texto(fixture)).not.toContain('gunkua');
  });

  it('pagina de 50 en 50 y el botón siguiente avanza', async () => {
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

  it('filtrar vuelve a la primera página', async () => {
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
