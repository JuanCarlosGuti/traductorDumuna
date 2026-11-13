import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('creates the app with the navigation for the six views', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const links = Array.from(html.querySelectorAll('nav a')).map((a) => a.textContent?.trim());
    expect(links).toEqual(['Buscar', 'Diccionario', 'Gramática', 'Flashcards', 'Traductor', 'Pendientes']);
  });

  it('without a session it does not show the logout button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.session')).toBeNull();
  });

  it('with a stored session it shows the user and the logout button', async () => {
    // The service reads localStorage on construction, same as on a reload.
    localStorage.setItem('damana.token', 'token-de-prueba');
    localStorage.setItem('damana.username', 'juan');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const session = (fixture.nativeElement as HTMLElement).querySelector('.session');
    expect(session?.textContent).toContain('juan');
    expect(session?.querySelector('button')?.textContent?.trim()).toBe('Salir');
  });
});
