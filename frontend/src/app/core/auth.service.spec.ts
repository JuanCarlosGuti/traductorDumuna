import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let servicio: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('starts without a session', () => {
    expect(servicio.autenticado()).toBe(false);
    expect(servicio.token()).toBeNull();
  });

  it('stores token and user on login', async () => {
    const entrando = servicio.entrar('juan', 'ñandú-ʉnkua');
    const peticion = http.expectOne('/api/auth/login');
    expect(peticion.request.body).toEqual({ usuario: 'juan', password: 'ñandú-ʉnkua' });
    peticion.flush({ token: 'abc.def.ghi', usuario: 'juan', duracionDias: 30 });
    await entrando;

    expect(servicio.autenticado()).toBe(true);
    expect(servicio.usuario()).toBe('juan');
    expect(localStorage.getItem('damana.token')).toBe('abc.def.ghi');
  });

  it('restores the stored session on reload', () => {
    localStorage.setItem('damana.token', 'abc.def.ghi');
    localStorage.setItem('damana.usuario', 'juan');
    // New instance = cold start, as when reloading the page.
    const recargado = TestBed.runInInjectionContext(() => new AuthService());
    expect(recargado.autenticado()).toBe(true);
    expect(recargado.usuario()).toBe('juan');
  });

  it('salir deletes the session from storage', async () => {
    const entrando = servicio.entrar('juan', 'x');
    http.expectOne('/api/auth/login').flush({
      token: 't',
      usuario: 'juan',
      duracionDias: 30,
    });
    await entrando;

    servicio.salir();
    expect(servicio.autenticado()).toBe(false);
    expect(localStorage.getItem('damana.token')).toBeNull();
  });

  it('asks the server whether it requires a session, and remembers it', async () => {
    const primera = servicio.exigeSesion();
    http.expectOne('/api/auth/estado').flush({ activa: true });
    expect(await primera).toBe(true);

    // The second one does not ask again: http.verify() would fail if it did.
    expect(await servicio.exigeSesion()).toBe(true);
  });

  it('if it cannot ask, it assumes a session is needed', async () => {
    const consulta = servicio.exigeSesion();
    http.expectOne('/api/auth/estado').error(new ProgressEvent('error'));
    expect(await consulta).toBe(true);
  });
});
