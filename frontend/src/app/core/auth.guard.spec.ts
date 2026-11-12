import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { sessionStarted } from './auth.guard';
import { AuthService } from './auth.service';

/** The guard uses inject(): it must be called inside a DI context. */
const run = () =>
  TestBed.runInInjectionContext(
    () => sessionStarted(null as never, null as never) as Promise<boolean | UrlTree>,
  );

describe('sessionStarted', () => {
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
    expect(await run()).toBe(true);
    // No calls: the afterEach's http.verify() confirms it.
  });

  it('without a session and with auth active it sends to /entrar', async () => {
    const result = run();
    http.expectOne('/api/auth/status').flush({ active: true });

    const target = await result;
    expect(target).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(target as UrlTree)).toBe('/entrar');
  });

  it('without a session but with the API open (local) it lets through', async () => {
    const result = run();
    http.expectOne('/api/auth/status').flush({ active: false });
    expect(await result).toBe(true);
  });

  it('if the state cannot be queried, it plays safe and asks for login', async () => {
    const result = run();
    http.expectOne('/api/auth/status').error(new ProgressEvent('error'));
    expect(await result).toBeInstanceOf(UrlTree);
  });

  it('the state is queried only once even when navigating several times', async () => {
    TestBed.inject(AuthService);
    const first = run();
    http.expectOne('/api/auth/status').flush({ active: false });
    expect(await first).toBe(true);

    expect(await run()).toBe(true); // no second call
  });
});
