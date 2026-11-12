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

  const withSession = async () => {
    const signingIn = auth.signIn('juan', 'x');
    control.expectOne('/api/auth/login').flush({
      token: 'token-valido',
      usuario: 'juan',
      duracionDias: 30,
    });
    await signingIn;
  };

  it('without a session it adds no header', () => {
    void firstValueFrom(http.get('/api/vocabulario'));
    const httpRequest = control.expectOne('/api/vocabulario');
    expect(httpRequest.request.headers.has('Authorization')).toBe(false);
    httpRequest.flush([]);
  });

  it('with a session it adds Authorization: Bearer', async () => {
    await withSession();
    void firstValueFrom(http.get('/api/vocabulario'));
    const httpRequest = control.expectOne('/api/vocabulario');
    expect(httpRequest.request.headers.get('Authorization')).toBe('Bearer token-valido');
    httpRequest.flush([]);
  });

  it('does not send the token to servers other than the API', async () => {
    await withSession();
    void firstValueFrom(http.get('https://example.com/algo'));
    const httpRequest = control.expectOne('https://example.com/algo');
    expect(httpRequest.request.headers.has('Authorization')).toBe(false);
    httpRequest.flush({});
  });

  it('a 401 logs out and leads to login', async () => {
    await withSession();
    const call = firstValueFrom(http.get('/api/vocabulario')).catch(() => null);
    control
      .expectOne('/api/vocabulario')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await call;

    expect(auth.authenticated()).toBe(false);
    expect(localStorage.getItem('damana.token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/entrar']);
  });

  it('a 401 from login itself does NOT redirect: we are already on that screen', async () => {
    const attempt = auth.signIn('juan', 'mala').catch(() => null);
    control
      .expectOne('/api/auth/login')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await attempt;
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('other errors do not log out', async () => {
    await withSession();
    const call = firstValueFrom(http.get('/api/vocabulario')).catch(() => null);
    control
      .expectOne('/api/vocabulario')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await call;

    expect(auth.authenticated()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
