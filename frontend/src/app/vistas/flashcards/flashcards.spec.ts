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

  it('muestra la palabra damana pero no su traducción hasta revelar', async () => {
    await cargar();
    expect(texto(fixture)).toContain('nʉnka');
    expect(texto(fixture)).not.toContain('agua');
  });

  it('la barra espaciadora revela la traducción', async () => {
    await cargar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await asentar(fixture);
    expect(texto(fixture)).toContain('agua');
  });

  it('calificar envía la respuesta y pide la siguiente tarjeta', async () => {
    await cargar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await asentar(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })); // Bien
    await asentar(fixture);

    const respuesta = http.expectOne('/api/srs/respuesta');
    expect(respuesta.request.body).toEqual({ palabra: 'nʉnka', calificacion: 'bien' });
    respuesta.flush({ palabra: 'nʉnka', repeticiones: 3, intervaloDias: 6, proximaRevision: '' });
    await asentar(fixture);

    http.expectOne('/api/srs/siguiente').flush({ ...TARJETA, pendientes: 2 });
    await asentar(fixture);
  });

  it('no se puede calificar sin haber revelado', async () => {
    await cargar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    await asentar(fixture);
    http.expectNone('/api/srs/respuesta');
  });

  it('las teclas se ignoran mientras se escribe en un campo', async () => {
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

  it('con el mazo vacío no revienta y lo dice', async () => {
    await cargar({ tarjeta: null, pendientes: 0, nuevas: 0 });
    expect(buscarTodos(fixture, 'button').length).toBeLessThan(4);
  });

  it('si el backend falla avisa en vez de quedarse en blanco', async () => {
    fixture = await montar(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/siguiente').error(new ProgressEvent('error'));
    await asentar(fixture);
    expect(texto(fixture)).toContain('No se pudo cargar el mazo');
  });
});
