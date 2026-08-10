import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Entrar } from './entrar';

describe('Entrar', () => {
  let fixture: ComponentFixture<Entrar>;
  let http: HttpTestingController;
  let router: Router;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const campo = (nombre: string) =>
    elemento().querySelector<HTMLInputElement>(`input[name="${nombre}"]`)!;

  const escribir = async (usuario: string, password: string) => {
    campo('usuario').value = usuario;
    campo('usuario').dispatchEvent(new Event('input'));
    campo('password').value = password;
    campo('password').dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  /**
   * Angular zoneless: whenStable() no espera a las promesas que lanza el
   * componente, así que hay que ceder el turno al bucle de eventos antes
   * de mirar el DOM.
   */
  const asentar = async () => {
    await new Promise((listo) => setTimeout(listo));
    await fixture.whenStable();
  };

  const enviar = async () => {
    elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
    await asentar();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Entrar],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(Entrar);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('pinta los dos campos, con el de contraseña oculto', () => {
    expect(campo('usuario').type).toBe('text');
    expect(campo('password').type).toBe('password');
  });

  it('entra con credenciales correctas y va al buscador', async () => {
    await escribir('juan', 'ñandú-ʉnkua');
    await enviar();

    const peticion = http.expectOne('/api/auth/login');
    expect(peticion.request.body).toEqual({
      usuario: 'juan',
      password: 'ñandú-ʉnkua', // la ʉ y la ñ viajan intactas
    });
    peticion.flush({ token: 'abc', usuario: 'juan', duracionDias: 30 });
    await asentar();

    expect(router.navigate).toHaveBeenCalledWith(['/buscar']);
    expect(localStorage.getItem('damana.token')).toBe('abc');
  });

  it('con credenciales malas avisa y NO navega', async () => {
    await escribir('juan', 'mala');
    await enviar();
    http.expectOne('/api/auth/login').flush(
      { message: 'Usuario o contraseña incorrectos' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await asentar();

    expect(elemento().querySelector('.error')?.textContent).toContain(
      'Usuario o contraseña incorrectos',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('tras un fallo limpia la contraseña pero conserva el usuario', async () => {
    await escribir('juan', 'mala');
    await enviar();
    http.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    await asentar();

    expect(campo('password').value).toBe('');
    expect(campo('usuario').value).toBe('juan');
  });

  it('el bloqueo por intentos se explica distinto que una contraseña mala', async () => {
    await escribir('juan', 'mala');
    await enviar();
    http.expectOne('/api/auth/login').flush({}, { status: 429, statusText: 'Too Many Requests' });
    await asentar();

    expect(elemento().querySelector('.error')?.textContent).toContain('Demasiados intentos');
  });

  it('si el servidor no responde lo dice en vez de culpar a las credenciales', async () => {
    await escribir('juan', 'x');
    await enviar();
    http.expectOne('/api/auth/login').error(new ProgressEvent('error'));
    await asentar();

    expect(elemento().querySelector('.error')?.textContent).toContain('servidor');
  });

  it('mientras entra deshabilita el botón: sin dobles envíos', async () => {
    await escribir('juan', 'x');
    await enviar();
    const boton = elemento().querySelector('button[type="submit"]')!;
    expect(boton.hasAttribute('disabled')).toBe(true);
    expect(boton.textContent).toContain('Entrando');

    http.expectOne('/api/auth/login').flush({ token: 't', usuario: 'juan', duracionDias: 30 });
    await fixture.whenStable();
  });
});
