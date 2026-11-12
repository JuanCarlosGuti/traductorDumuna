import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { SrsStatus } from '../../core/models';
import { Flashcards } from './flashcards';

const CARD: SrsStatus = {
  tarjeta: { palabra: 'nʉnka', tipo: 'vocabulario', traduccion: 'agua', repeticiones: 2 },
  pendientes: 3,
  nuevas: 1,
};

describe('Flashcards', () => {
  let fixture: ComponentFixture<Flashcards>;
  let http: HttpTestingController;

  const load = async (status: SrsStatus = CARD) => {
    fixture = await mount(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/siguiente').flush(status);
    await settle(fixture);
  };

  afterEach(() => http.verify());

  it('shows the Damana word but not its translation until revealed', async () => {
    await load();
    expect(text(fixture)).toContain('nʉnka');
    expect(text(fixture)).not.toContain('agua');
  });

  it('the space bar reveals the translation', async () => {
    await load();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await settle(fixture);
    expect(text(fixture)).toContain('agua');
  });

  it('grading sends the answer and requests the next card', async () => {
    await load();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await settle(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })); // Good
    await settle(fixture);

    const response = http.expectOne('/api/srs/respuesta');
    expect(response.request.body).toEqual({ palabra: 'nʉnka', calificacion: 'bien' });
    response.flush({ palabra: 'nʉnka', repeticiones: 3, intervaloDias: 6, proximaRevision: '' });
    await settle(fixture);

    http.expectOne('/api/srs/siguiente').flush({ ...CARD, pendientes: 2 });
    await settle(fixture);
  });

  it('grading is not possible without revealing first', async () => {
    await load();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    await settle(fixture);
    http.expectNone('/api/srs/respuesta');
  });

  it('keys are ignored while typing in a field', async () => {
    await load();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    await settle(fixture);
    expect(text(fixture)).not.toContain('agua');
    field.remove();
  });

  it('with an empty deck it does not crash and says so', async () => {
    await load({ tarjeta: null, pendientes: 0, nuevas: 0 });
    expect(queryAll(fixture, 'button').length).toBeLessThan(4);
  });

  it('if the backend fails it warns instead of staying blank', async () => {
    fixture = await mount(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/siguiente').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture)).toContain('No se pudo cargar el mazo');
  });
});
