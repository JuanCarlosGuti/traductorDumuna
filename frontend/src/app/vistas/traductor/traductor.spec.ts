import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { EstadoTraductor, RespuestaTraduccion } from '../../core/modelos';
import { Traductor } from './traductor';

const DISPONIBLE: EstadoTraductor = {
  disponible: true,
  proveedor: 'compatible',
  modelo: 'gpt-oss-120b',
};

const RESPUESTA: RespuestaTraduccion = {
  traduccion: 'Ranzhe abu urragamba [vecina] dugwa',
  glosa: [
    { origen: 'mi', destino: 'Ranzhe' },
    { origen: 'mamá', destino: 'abu' },
    { origen: 'cocina', destino: 'dugwa' },
  ],
  palabrasSinEquivalente: ['vecina'],
  reglasAplicadas: ['-nzhe (posesivo)'],
  confianza: 0.72,
  explicacionBreve: 'Diccionario más regla del posesivo.',
  apoyo: { nivel: 'bueno', motivos: [] },
  ejemplos: [
    { fuente: 'oraciones', dominio: 'cotidiano', referencia: 'oración 9', damana: 'Abu urragamba nuka', espanol: 'mamá está en la casa', puntaje: 0.9 },
    { fuente: 'conjugaciones', dominio: 'gramatica', referencia: 'conjugación 2 (cocinar)', damana: 'dugwa', espanol: 'cocina', puntaje: 0.5 },
    { fuente: 'oraciones', dominio: 'biblico', referencia: 'oración 1', damana: 'Jehová nʉnka gontka', espanol: 'Jehová hizo el agua', puntaje: 0.3 },
  ],
  diccionario: [
    { palabra: 'mamá', espanol: 'mamá', damana: 'Abu', categoria: 'Personas y familia', coincidencia: 'exacta' },
    { palabra: 'cocina', espanol: 'Cocinar', damana: 'Dugua', categoria: 'Verbos', coincidencia: 'posible' },
  ],
  nombresPropios: [],
  reglas: [{ forma: '-nzhe', significado: 'posesivo / "de"', ejemplo: 'Kunkujshina → Kunkujshinanzhe = de Dios', disparador: 'posesivo' }],
  disparadores: ['posesivo'],
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

  const traducirConRespuesta = async (respuesta: RespuestaTraduccion = RESPUESTA) => {
    await escribir('mi mamá cocina en la casa');
    await traducir();
    http.expectOne('/api/traducir').flush(respuesta);
    await asentar(fixture);
  };

  const boton = (textoBoton: RegExp) =>
    buscarTodos(fixture, 'button').find((b) => textoBoton.test(b.textContent ?? ''))!;

  afterEach(() => http.verify());

  it('manda el texto y la dirección elegida (español → damana por defecto)', async () => {
    await arrancar();
    await escribir('mi mamá cocina en la casa');
    await traducir();

    const peticion = http.expectOne('/api/traducir');
    expect(peticion.request.body).toEqual({
      texto: 'mi mamá cocina en la casa',
      direccion: 'espanol_a_damana',
    });
    peticion.flush(RESPUESTA);
    await asentar(fixture);
    expect(texto(fixture)).toContain('Ranzhe abu urragamba');
  });

  it('no manda nada si el texto está vacío', async () => {
    await arrancar();
    await traducir();
    http.expectNone('/api/traducir');
  });

  it('muestra la glosa palabra por palabra bajo la traducción', async () => {
    await arrancar();
    await traducirConRespuesta();
    const pares = buscarTodos(fixture, '.glosa .par').map((p) => [
      p.querySelector('.origen')?.textContent?.trim(),
      p.querySelector('.destino')?.textContent?.trim(),
    ]);
    expect(pares).toEqual([
      ['mi', 'Ranzhe'],
      ['mamá', 'abu'],
      ['cocina', 'dugwa'],
    ]);
    // el lado damana va marcado con lang="mbp" para el lector de pantalla
    expect(buscarTodos(fixture, '.glosa .destino[lang="mbp"]').length).toBe(3);
  });

  it('resalta las palabras sin equivalente, sin corchetes, y avisa que quedaron en Pendientes', async () => {
    await arrancar();
    await traducirConRespuesta();
    const marcadas = buscarTodos(fixture, '.traduccion .sin-equivalente').map((e) => e.textContent?.trim());
    expect(marcadas).toEqual(['vecina']);
    expect(buscarTodos(fixture, '.traduccion')[0].textContent).not.toContain('[');
    expect(texto(fixture)).toContain('quedaron en Pendientes');
  });

  it('muestra las reglas aplicadas, la confianza y el diccionario usado', async () => {
    await arrancar();
    await traducirConRespuesta();
    expect(texto(fixture)).toContain('-nzhe (posesivo)');
    expect(texto(fixture)).toContain('confianza 72 %');
    expect(buscarTodos(fixture, '.diccionario tbody tr').length).toBe(2);
    expect(texto(fixture)).toContain('Abu');
    expect(texto(fixture)).toContain('posible');
  });

  it('agrupa los ejemplos por dominio en bloques colapsables', async () => {
    await arrancar();
    await traducirConRespuesta();
    const titulos = buscarTodos(fixture, 'details.ejemplos summary').map((s) => s.textContent?.trim());
    expect(titulos).toEqual([
      'Ejemplos cotidianos (1)',
      'Ejemplos de gramática (conjugaciones) (1)',
      'Ejemplos del corpus bíblico (1)',
    ]);
  });

  it('«esta traducción es correcta» guarda el par como confirmado', async () => {
    await arrancar();
    await traducirConRespuesta();
    boton(/es correcta/).click();
    await asentar(fixture);

    const peticion = http.expectOne('/api/traducir/validar');
    expect(peticion.request.body).toEqual({
      texto: 'mi mamá cocina en la casa',
      direccion: 'espanol_a_damana',
      traduccion: 'Ranzhe abu urragamba [vecina] dugwa',
      origen: 'confirmada',
      traduccionModelo: 'Ranzhe abu urragamba [vecina] dugwa',
    });
    peticion.flush({ guardada: true, total: 3 });
    await asentar(fixture);
    expect(texto(fixture)).toContain('Guardada como correcta (3 validadas)');
  });

  it('«corregir» permite escribir la traducción correcta y la guarda como corregida (con ʉ)', async () => {
    await arrancar();
    await traducirConRespuesta();
    boton(/^\s*Corregir\s*$/).click();
    await asentar(fixture);

    const campo = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#correccion')!;
    expect(campo.value).toBe('Ranzhe abu urragamba vecina dugwa'); // sin corchetes, para editar
    campo.value = 'Ranzhe abu urragamba anzhirru kʉdugwa';
    campo.dispatchEvent(new Event('input'));
    await asentar(fixture);
    boton(/Guardar corrección/).click();
    await asentar(fixture);

    const peticion = http.expectOne('/api/traducir/validar');
    expect(peticion.request.body.origen).toBe('corregida');
    expect(peticion.request.body.traduccion).toBe('Ranzhe abu urragamba anzhirru kʉdugwa');
    peticion.flush({ guardada: true, total: 1 });
    await asentar(fixture);
    expect(texto(fixture)).toContain('Corrección guardada');
  });

  it('con apoyo «revisar» muestra el aviso; con «bueno» no', async () => {
    await arrancar();
    await traducirConRespuesta({ ...RESPUESTA, apoyo: { nivel: 'revisar', motivos: ['sin_ejemplos'] }, ejemplos: [] });
    expect(texto(fixture)).toContain('Poco apoyo del corpus');
    expect(texto(fixture)).toContain('No se encontraron ejemplos parecidos');
  });

  it('intercambiar la dirección invierte el sentido de la traducción', async () => {
    await arrancar();
    boton(/⇄/).click();
    await asentar(fixture);
    await escribir('nʉnka shkua');
    await traducir();
    const peticion = http.expectOne('/api/traducir');
    expect(peticion.request.body.direccion).toBe('damana_a_espanol');
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
