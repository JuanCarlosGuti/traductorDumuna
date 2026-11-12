import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('starts without a session', () => {
    expect(service.authenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('stores token and user on login', async () => {
    const signingIn = service.signIn('juan', 'ñandú-ʉnkua');
    const httpRequest = http.expectOne('/api/auth/login');
    expect(httpRequest.request.body).toEqual({ usuario: 'juan', password: 'ñandú-ʉnkua' });
    httpRequest.flush({ token: 'abc.def.ghi', usuario: 'juan', duracionDias: 30 });
    await signingIn;

    expect(service.authenticated()).toBe(true);
    expect(service.user()).toBe('juan');
    expect(localStorage.getItem('damana.token')).toBe('abc.def.ghi');
  });

  it('restores the stored session on reload', () => {
    localStorage.setItem('damana.token', 'abc.def.ghi');
    localStorage.setItem('damana.usuario', 'juan');
    // New instance = cold start, as when reloading the page.
    const reloaded = TestBed.runInInjectionContext(() => new AuthService());
    expect(reloaded.authenticated()).toBe(true);
    expect(reloaded.user()).toBe('juan');
  });

  it('salir deletes the session from storage', async () => {
    const signingIn = service.signIn('juan', 'x');
    http.expectOne('/api/auth/login').flush({
      token: 't',
      usuario: 'juan',
      duracionDias: 30,
    });
    await signingIn;

    service.signOut();
    expect(service.authenticated()).toBe(false);
    expect(localStorage.getItem('damana.token')).toBeNull();
  });

  it('asks the server whether it requires a session, and remembers it', async () => {
    const first = service.requiresSession();
    http.expectOne('/api/auth/estado').flush({ activa: true });
    expect(await first).toBe(true);

    // The second one does not ask again: http.verify() would fail if it did.
    expect(await service.requiresSession()).toBe(true);
  });

  it('if it cannot ask, it assumes a session is needed', async () => {
    const queryText = service.requiresSession();
    http.expectOne('/api/auth/estado').error(new ProgressEvent('error'));
    expect(await queryText).toBe(true);
  });
});
