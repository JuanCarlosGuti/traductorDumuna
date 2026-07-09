import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('crea la app con la navegación de las cinco vistas', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const enlaces = Array.from(html.querySelectorAll('nav a')).map((a) => a.textContent?.trim());
    expect(enlaces).toEqual(['Buscar', 'Diccionario', 'Gramática', 'Flashcards', 'Traductor']);
  });
});
