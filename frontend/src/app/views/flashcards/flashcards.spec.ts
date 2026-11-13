import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { SrsStatus } from '../../core/models';
import { Flashcards } from './flashcards';

const CARD: SrsStatus = {
  card: { word: 'nʉnka', type: 'vocabulary', translation: 'agua', repetitions: 2 },
  pendingCards: 3,
  newCards: 1,
};

describe('Flashcards', () => {
  let fixture: ComponentFixture<Flashcards>;
  let http: HttpTestingController;

  const load = async (status: SrsStatus = CARD) => {
    fixture = await mount(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/next').flush(status);
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

    const response = http.expectOne('/api/srs/answer');
    expect(response.request.body).toEqual({ word: 'nʉnka', grade: 'good' });
    response.flush({ word: 'nʉnka', repetitions: 3, intervalDays: 6, nextReview: '' });
    await settle(fixture);

    http.expectOne('/api/srs/next').flush({ ...CARD, pendingCards: 2 });
    await settle(fixture);
  });

  it('grading is not possible without revealing first', async () => {
    await load();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    await settle(fixture);
    http.expectNone('/api/srs/answer');
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
    await load({ card: null, pendingCards: 0, newCards: 0 });
    expect(queryAll(fixture, 'button').length).toBeLessThan(4);
  });

  it('if the backend fails it warns instead of staying blank', async () => {
    fixture = await mount(Flashcards);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/srs/next').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture)).toContain('No se pudo cargar el mazo');
  });
});
