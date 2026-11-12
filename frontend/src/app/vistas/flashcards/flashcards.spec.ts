import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { EstadoSrs } from '../../core/modelos';
import { Flashcards } from './flashcards';

const TARJETA: EstadoSrs = {
  tarjeta: { palabra: 'nʉnka', tipo: 'vocabulario', traduccion: 'agua', repeticiones: 2 },
  pendientes: 3,
  nuevas: 1,
};

describe('Flashcards', () => {
  let fixture: ComponentFixture<Flashcards>;
  let http: HttpTestingController;

  const cargar = async (estado: EstadoSrs = TARJETA) => {
    fixture = await montar(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/siguiente').flush(estado);
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('shows the Damana word but not its translation until revealed', async () => {
    await cargar();
    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).not.toContain('agua');
  });

  it('the space bar reveals the translation', async () => {
    await cargar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await asentar(fixture);
    expect(texto(fixture)).toContain('agua');
  });

  it('grading sends the answer and requests the next card', async () => {
    await cargar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await asentar(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })); // Good
    await asentar(fixture);

    const respuesta = http.expectOne('/api/srs/respuesta');
    expect(respuesta.request.body).toEqual({ palabra: 'nʉnka', calificacion: 'bien' });
    respuesta.flush({ palabra: 'nʉnka', repeticiones: 3, intervaloDias: 6, proximaRevision: '' });
    await asentar(fixture);

    http.expectOne('/api/srs/siguiente').flush({ ...TARJETA, pendientes: 2 });
    await asentar(fixture);
  });

  it('grading is not possible without revealing first', async () => {
    await cargar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    await asentar(fixture);
    http.expectNone('/api/srs/respuesta');
  });

  it('keys are ignored while typing in a field', async () => {
    await cargar();
    const campo = document.createElement('input');
    document.body.appendChild(campo);
    campo.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    await asentar(fixture);
    expect(texto(fixture)).not.toContain('agua');
    campo.remove();
  });

  it('with an empty deck it does not crash and says so', async () => {
    await cargar({ tarjeta: null, pendientes: 0, nuevas: 0 });
    expect(buscarTodos(fixture, 'button').length).toBeLessThan(4);
  });

  it('if the backend fails it warns instead of staying blank', async () => {
    fixture = await montar(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/siguiente').error(new ProgressEvent('error'));
    await asentar(fixture);
    expect(texto(fixture)).toContain('No se pudo cargar el mazo');
  });
});
