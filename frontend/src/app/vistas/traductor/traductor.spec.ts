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

  it('sends the text and the chosen direction (Spanish → Damana by default)', async () => {
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

  it('while translating it warns about the wait (Claude: 5-15 s), locks the box and releases it when done', async () => {
    await arrancar({ disponible: true, proveedor: 'anthropic', modelo: 'claude-opus-5-5' });
    await escribir('mi mamá cocina en la casa');
    await traducir();

    // Request in flight: visible notice, box and controls locked.
    const area = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    expect(area.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('select')!.disabled).toBe(true);
    expect((boton(/Traduciendo/) as HTMLButtonElement).disabled).toBe(true);
    const aviso = (fixture.nativeElement as HTMLElement).querySelector('.espera')!;
    expect(aviso.getAttribute('role')).toBe('status');
    expect(aviso.textContent).toContain('Traduciendo con Claude… suele tardar entre 5 y 15 s');

    http.expectOne('/api/traducir').flush(RESPUESTA);
    await asentar(fixture);

    // Done: typing is possible again (with ʉ) and the notice disappears.
    expect(area.disabled).toBe(false);
    expect(buscarTodos(fixture, '.espera').length).toBe(0);
    await escribir('nʉnka ñingui');
    expect(area.value).toBe('nʉnka ñingui');
    expect((boton(/^\s*Traducir\s*$/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('with a compatible provider the notice names the model and not Claude', async () => {
    await arrancar(); // AVAILABLE: compatible, gpt-oss-120b
    await escribir('nʉnka');
    await traducir();
    const aviso = (fixture.nativeElement as HTMLElement).querySelector('.espera')!;
    expect(aviso.textContent).toContain('Traduciendo con gpt-oss-120b…');
    expect(aviso.textContent).not.toContain('Claude');
    http.expectOne('/api/traducir').flush(RESPUESTA);
    await asentar(fixture);
  });

  it('sends nothing if the text is empty', async () => {
    await arrancar();
    await traducir();
    http.expectNone('/api/traducir');
  });

  it('shows the word-by-word gloss under the translation', async () => {
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
    // the Damana side is marked with lang="mbp" for the screen reader
    expect(buscarTodos(fixture, '.glosa .destino[lang="mbp"]').length).toBe(3);
  });

  it('highlights the words without an equivalent, without brackets, and says they were left in Pendientes', async () => {
    await arrancar();
    await traducirConRespuesta();
    const marcadas = buscarTodos(fixture, '.traduccion .sin-equivalente').map((e) => e.textContent?.trim());
    expect(marcadas).toEqual(['vecina']);
    expect(buscarTodos(fixture, '.traduccion')[0].textContent).not.toContain('[');
    expect(texto(fixture)).toContain('quedaron en Pendientes');
  });

  it('shows the applied rules, the confidence and the dictionary used', async () => {
    await arrancar();
    await traducirConRespuesta();
    expect(texto(fixture)).toContain('-nzhe (posesivo)');
    expect(texto(fixture)).toContain('confianza 72 %');
    expect(buscarTodos(fixture, '.diccionario tbody tr').length).toBe(2);
    expect(texto(fixture)).toContain('Abu');
    expect(texto(fixture)).toContain('posible');
  });

  it('groups the examples by domain in collapsible blocks', async () => {
    await arrancar();
    await traducirConRespuesta();
    const titulos = buscarTodos(fixture, 'details.ejemplos summary').map((s) => s.textContent?.trim());
    expect(titulos).toEqual([
      'Ejemplos cotidianos (1)',
      'Ejemplos de gramática (conjugaciones) (1)',
      'Ejemplos del corpus bíblico (1)',
    ]);
  });

  it('«esta traducción es correcta» stores the pair as confirmed', async () => {
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

  it('«corregir» lets the correct translation be typed and stores it as corrected (with ʉ)', async () => {
    await arrancar();
    await traducirConRespuesta();
    boton(/^\s*Corregir\s*$/).click();
    await asentar(fixture);

    const campo = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#correccion')!;
    expect(campo.value).toBe('Ranzhe abu urragamba vecina dugwa'); // no brackets, for editing
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

  it('with «revisar» support it shows the warning; with «bueno» it does not', async () => {
    await arrancar();
    await traducirConRespuesta({ ...RESPUESTA, apoyo: { nivel: 'revisar', motivos: ['sin_ejemplos'] }, ejemplos: [] });
    expect(texto(fixture)).toContain('Poco apoyo del corpus');
    expect(texto(fixture)).toContain('No se encontraron ejemplos parecidos');
  });

  it('swapping the direction reverses the translation direction', async () => {
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

  it('if the translator is not configured it explains how to configure it', async () => {
    await arrancar({ disponible: false, proveedor: null, modelo: null });
    expect(texto(fixture)).toContain('Falta configurar un motor de traducción');
    expect(buscarTodos(fixture, '.aviso').length).toBe(1);
  });

  it('a backend error is shown with its message', async () => {
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

  it('if the backend does not respond it blames the connection, not the text', async () => {
    await arrancar();
    await escribir('nʉnka');
    await traducir();
    http.expectOne('/api/traducir').error(new ProgressEvent('error'));
    await asentar(fixture);
    expect(texto(fixture)).toContain('No se pudo contactar');
  });
});
