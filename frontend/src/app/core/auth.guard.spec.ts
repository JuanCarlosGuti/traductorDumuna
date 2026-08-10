import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { sesionIniciada } from './auth.guard';
import { AuthService } from './auth.service';

/** El guard usa inject(): hay que llamarlo dentro de un contexto de DI. */
const ejecutar = () =>
  TestBed.runInInjectionContext(
    () => sesionIniciada(null as never, null as never) as Promise<boolean | UrlTree>,
  );

describe('sesionIniciada', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('con sesión deja pasar sin preguntar al servidor', async () => {
    localStorage.setItem('damana.token', 't');
    expect(await ejecutar()).toBe(true);
    // Sin llamadas: http.verify() del afterEach lo confirma.
  });

  it('sin sesión y con auth activa manda a /entrar', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/estado').flush({ activa: true });

    const destino = await resultado;
    expect(destino).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(destino as UrlTree)).toBe('/entrar');
  });

  it('sin sesión pero con la API abierta (local) deja pasar', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/estado').flush({ activa: false });
    expect(await resultado).toBe(true);
  });

  it('si no se puede consultar el estado, tira a lo seguro y pide login', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/estado').error(new ProgressEvent('error'));
    expect(await resultado).toBeInstanceOf(UrlTree);
  });

  it('el estado se consulta una sola vez aunque se navegue varias', async () => {
    TestBed.inject(AuthService);
    const primera = ejecutar();
    http.expectOne('/api/auth/estado').flush({ activa: false });
    expect(await primera).toBe(true);

    expect(await ejecutar()).toBe(true); // sin segunda llamada
  });
});
