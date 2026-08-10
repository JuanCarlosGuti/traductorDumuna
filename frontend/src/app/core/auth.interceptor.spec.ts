import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let control: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    control = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    control.verify();
    localStorage.clear();
  });

  const conSesion = async () => {
    const entrando = auth.entrar('juan', 'x');
    control.expectOne('/api/auth/login').flush({
      token: 'token-valido',
      usuario: 'juan',
      duracionDias: 30,
    });
    await entrando;
  };

  it('sin sesión no añade cabecera', () => {
    void firstValueFrom(http.get('/api/vocabulario'));
    const peticion = control.expectOne('/api/vocabulario');
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush([]);
  });

  it('con sesión añade Authorization: Bearer', async () => {
    await conSesion();
    void firstValueFrom(http.get('/api/vocabulario'));
    const peticion = control.expectOne('/api/vocabulario');
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
    peticion.flush([]);
  });

  it('no manda el token a servidores ajenos a la API', async () => {
    await conSesion();
    void firstValueFrom(http.get('https://example.com/algo'));
    const peticion = control.expectOne('https://example.com/algo');
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({});
  });

  it('un 401 cierra la sesión y lleva al login', async () => {
    await conSesion();
    const llamada = firstValueFrom(http.get('/api/vocabulario')).catch(() => null);
    control
      .expectOne('/api/vocabulario')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await llamada;

    expect(auth.autenticado()).toBe(false);
    expect(localStorage.getItem('damana.token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/entrar']);
  });

  it('un 401 del propio login NO redirige: ya se está en la pantalla', async () => {
    const intento = auth.entrar('juan', 'mala').catch(() => null);
    control
      .expectOne('/api/auth/login')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await intento;
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('otros errores no cierran la sesión', async () => {
    await conSesion();
    const llamada = firstValueFrom(http.get('/api/vocabulario')).catch(() => null);
    control
      .expectOne('/api/vocabulario')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await llamada;

    expect(auth.autenticado()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
