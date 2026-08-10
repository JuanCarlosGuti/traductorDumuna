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

  it('crea la app con la navegación de las cinco vistas', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const enlaces = Array.from(html.querySelectorAll('nav a')).map((a) => a.textContent?.trim());
    expect(enlaces).toEqual(['Buscar', 'Diccionario', 'Gramática', 'Flashcards', 'Traductor']);
  });

  it('sin sesión no muestra el botón de salir', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.sesion')).toBeNull();
  });

  it('con sesión guardada muestra el usuario y el botón de salir', async () => {
    // El servicio lee localStorage al construirse, igual que en una recarga.
    localStorage.setItem('damana.token', 'token-de-prueba');
    localStorage.setItem('damana.usuario', 'juan');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const sesion = (fixture.nativeElement as HTMLElement).querySelector('.sesion');
    expect(sesion?.textContent).toContain('juan');
    expect(sesion?.querySelector('button')?.textContent?.trim()).toBe('Salir');
  });
});
