import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginView } from './login';

describe('Entrar', () => {
  let fixture: ComponentFixture<LoginView>;
  let http: HttpTestingController;
  let router: Router;

  const element = () => fixture.nativeElement as HTMLElement;
  const field = (name: string) =>
    element().querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

  const type = async (user: string, password: string) => {
    field('username').value = user;
    field('username').dispatchEvent(new Event('input'));
    field('password').value = password;
    field('password').dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  /**
   * Zoneless Angular: whenStable() does not wait for the promises the
   * component fires, so we must yield to the event loop before
   * looking at the DOM.
   */
  const settle = async () => {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  };

  const submit = async () => {
    element().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginView],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginView);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('renders both fields, with the password one hidden', () => {
    expect(field('username').type).toBe('text');
    expect(field('password').type).toBe('password');
  });

  it('logs in with correct credentials and goes to search', async () => {
    await type('juan', 'ñandú-ʉnkua');
    await submit();

    const httpRequest = http.expectOne('/api/auth/login');
    expect(httpRequest.request.body).toEqual({
      user: 'juan',
      password: 'ñandú-ʉnkua', // ʉ and ñ travel intact
    });
    httpRequest.flush({ token: 'abc', user: 'juan', durationDays: 30 });
    await settle();

    expect(router.navigate).toHaveBeenCalledWith(['/buscar']);
    expect(localStorage.getItem('damana.token')).toBe('abc');
  });

  it('with bad credentials it warns and does NOT navigate', async () => {
    await type('juan', 'mala');
    await submit();
    http.expectOne('/api/auth/login').flush(
      { message: 'Usuario o contraseña incorrectos' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await settle();

    expect(element().querySelector('.error')?.textContent).toContain(
      'Usuario o contraseña incorrectos',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('after a failure it clears the password but keeps the user', async () => {
    await type('juan', 'mala');
    await submit();
    http.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(field('password').value).toBe('');
    expect(field('username').value).toBe('juan');
  });

  it('the attempt block is explained differently from a bad password', async () => {
    await type('juan', 'mala');
    await submit();
    http.expectOne('/api/auth/login').flush({}, { status: 429, statusText: 'Too Many Requests' });
    await settle();

    expect(element().querySelector('.error')?.textContent).toContain('Demasiados intentos');
  });

  it('if the server does not respond it says so instead of blaming the credentials', async () => {
    await type('juan', 'x');
    await submit();
    http.expectOne('/api/auth/login').error(new ProgressEvent('error'));
    await settle();

    expect(element().querySelector('.error')?.textContent).toContain('servidor');
  });

  it('while logging in it disables the button: no double submissions', async () => {
    await type('juan', 'x');
    await submit();
    const button = element().querySelector('button[type="submit"]')!;
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.textContent).toContain('Entrando');

    http.expectOne('/api/auth/login').flush({ token: 't', user: 'juan', durationDays: 30 });
    await fixture.whenStable();
  });
});
