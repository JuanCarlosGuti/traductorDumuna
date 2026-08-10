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

  it('arranca sin sesión', () => {
    expect(servicio.autenticado()).toBe(false);
    expect(servicio.token()).toBeNull();
  });

  it('guarda token y usuario al entrar', async () => {
    const entrando = servicio.entrar('juan', 'ñandú-ʉnkua');
    const peticion = http.expectOne('/api/auth/login');
    expect(peticion.request.body).toEqual({ usuario: 'juan', password: 'ñandú-ʉnkua' });
    peticion.flush({ token: 'abc.def.ghi', usuario: 'juan', duracionDias: 30 });
    await entrando;

    expect(servicio.autenticado()).toBe(true);
    expect(servicio.usuario()).toBe('juan');
    expect(localStorage.getItem('damana.token')).toBe('abc.def.ghi');
  });

  it('recupera la sesión guardada al recargar', () => {
    localStorage.setItem('damana.token', 'abc.def.ghi');
    localStorage.setItem('damana.usuario', 'juan');
    // Instancia nueva = arranque en frío, como al recargar la página.
    const recargado = TestBed.runInInjectionContext(() => new AuthService());
    expect(recargado.autenticado()).toBe(true);
    expect(recargado.usuario()).toBe('juan');
  });

  it('salir borra la sesión del almacenamiento', async () => {
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

  it('pregunta al servidor si exige sesión, y lo recuerda', async () => {
    const primera = servicio.exigeSesion();
    http.expectOne('/api/auth/estado').flush({ activa: true });
    expect(await primera).toBe(true);

    // La segunda no vuelve a preguntar: http.verify() fallaría si lo hiciera.
    expect(await servicio.exigeSesion()).toBe(true);
  });

  it('si no puede preguntar, asume que hace falta sesión', async () => {
    const consulta = servicio.exigeSesion();
    http.expectOne('/api/auth/estado').error(new ProgressEvent('error'));
    expect(await consulta).toBe(true);
  });
});
