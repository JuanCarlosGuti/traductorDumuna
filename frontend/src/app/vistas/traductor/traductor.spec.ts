import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { EstadoTraductor, RespuestaTraduccion } from '../../core/modelos';
import { Traductor } from './traductor';

const DISPONIBLE: EstadoTraductor = {
  disponible: true,
  proveedor: 'compatible',
  modelo: 'llama-3.3-70b',
};

const RESPUESTA: RespuestaTraduccion = {
  traduccion: 'el agua es una',
  palabrasDudosas: ['agua'],
  explicacionBreve: 'Traducción literal.',
  apoyo: { nivel: 'bueno', motivos: [] },
  ejemplos: [
    {
      fuente: 'oraciones',
      referencia: 'oración 1',
      damana: 'nʉnka shkua',
      espanol: 'el agua es una',
      puntaje: 0.9,
    },
  ],
  vocabularioUsado: [{ espanol: 'agua', damana: 'nʉnka' }],
};

describe('Traductor', () => {
  let fixture: ComponentFixture<Traductor>;
  let http: HttpTestingController;

  const arrancar = async (estado: EstadoTraductor = DISPONIBLE) => {
    fixture = await montar(Traductor);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/traducir/estado').flush(estado);
    await asentar(fixture);
  };

  const escribir = async (valor: string) => {
    const area = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    area.value = valor;
    area.dispatchEvent(new Event('input'));
    await asentar(fixture);
  };

  const traducir = async () => {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('manda el texto y la dirección elegida', async () => {
    await arrancar();
    await escribir('nʉnka shkua');
    await traducir();

    const peticion = http.expectOne('/api/traducir');
    expect(peticion.request.body).toEqual({
      texto: 'nʉnka shkua', // la ʉ llega intacta al backend
      direccion: 'damana_a_espanol',
    });
    peticion.flush(RESPUESTA);
    await asentar(fixture);
    expect(texto(fixture)).toContain('el agua es una');
  });

  it('no manda nada si el texto está vacío', async () => {
    await arrancar();
    await traducir();
    http.expectNone('/api/traducir');
  });

  it('marca visualmente las palabras que el modelo dio por dudosas', async () => {
    await arrancar();
    await escribir('nʉnka shkua');
    await traducir();
    http.expectOne('/api/traducir').flush(RESPUESTA);
    await asentar(fixture);

    const dudosas = buscarTodos(fixture, '.dudosa').map((e) => e.textContent?.trim());
    expect(dudosas).toContain('agua');
  });

  it('con apoyo «revisar» muestra el aviso; con «bueno» no', async () => {
    await arrancar();
    await escribir('x');
    await traducir();
    http.expectOne('/api/traducir').flush({
      ...RESPUESTA,
      apoyo: { nivel: 'revisar', motivos: ['sin_ejemplos'] },
    });
    await asentar(fixture);
    expect(texto(fixture)).toContain('Poco apoyo del corpus');
  });

  it('intercambiar la dirección invierte el sentido de la traducción', async () => {
    await arrancar();
    const boton = buscarTodos(fixture, 'button').find((b) =>
      /intercambiar|⇄|↔/i.test(b.textContent ?? '' + b.getAttribute('aria-label')),
    );
    if (boton) {
      boton.click();
      await asentar(fixture);
    }
    await escribir('agua');
    await traducir();
    const peticion = http.expectOne('/api/traducir');
    expect(['damana_a_espanol', 'espanol_a_damana']).toContain(
      peticion.request.body.direccion,
    );
    peticion.flush(RESPUESTA);
    await asentar(fixture);
  });

  it('si el traductor no está configurado explica cómo configurarlo', async () => {
    await arrancar({ disponible: false, proveedor: null, modelo: null });
    expect(texto(fixture)).toContain('Falta configurar un motor de traducción');
    expect(buscarTodos(fixture, '.aviso').length).toBe(1);
  });

  it('un error del backend se muestra con su mensaje', async () => {
    await arrancar();
    await escribir('nʉnka');
    await traducir();
    http.expectOne('/api/traducir').flush(
      { message: 'El texto supera el máximo' },
      { status: 400, statusText: 'Bad Request' },
    );
    await asentar(fixture);
    expect(texto(fixture)).toContain('El texto supera el máximo');
  });

  it('si el backend no responde culpa a la conexión, no al texto', async () => {
    await arrancar();
    await escribir('nʉnka');
    await traducir();
    http.expectOne('/api/traducir').error(new ProgressEvent('error'));
    await asentar(fixture);
    expect(texto(fixture)).toContain('No se pudo contactar');
  });
});
