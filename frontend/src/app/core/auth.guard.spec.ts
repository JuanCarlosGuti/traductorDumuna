import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { sesionIniciada } from './auth.guard';
import { AuthService } from './auth.service';

/** The guard uses inject(): it must be called inside a DI context. */
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

  it('with a session it lets through without asking the server', async () => {
    localStorage.setItem('damana.token', 't');
    expect(await ejecutar()).toBe(true);
    // No calls: the afterEach's http.verify() confirms it.
  });

  it('without a session and with auth active it sends to /entrar', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/estado').flush({ activa: true });

    const destino = await resultado;
    expect(destino).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(destino as UrlTree)).toBe('/entrar');
  });

  it('without a session but with the API open (local) it lets through', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/estado').flush({ activa: false });
    expect(await resultado).toBe(true);
  });

  it('if the state cannot be queried, it plays safe and asks for login', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/estado').error(new ProgressEvent('error'));
    expect(await resultado).toBeInstanceOf(UrlTree);
  });

  it('the state is queried only once even when navigating several times', async () => {
    TestBed.inject(AuthService);
    const primera = ejecutar();
    http.expectOne('/api/auth/estado').flush({ activa: false });
    expect(await primera).toBe(true);

    expect(await ejecutar()).toBe(true); // no second call
  });
});
