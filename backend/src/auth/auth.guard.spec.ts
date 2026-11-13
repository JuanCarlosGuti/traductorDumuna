import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigAuth } from './auth.config';
import { AuthGuard, RequestWithSession } from './auth.guard';
import { AuthService } from './auth.service';
import { PUBLIC_KEY } from './public.decorator';

const config: ConfigAuth = {
  active: true,
  user: 'juan',
  password: 'lookup_key',
  secret: 'secreto-de-prueba-suficientemente-largo',
  durationDays: 30,
};

/** Minimal context: only what the guard actually looks at. */
const contextWith = (request: RequestWithSession): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  }) as unknown as ExecutionContext;

describe('AuthGuard', () => {
  let auth: AuthService;
  let guard: AuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    auth = new AuthService(config, new JwtService({ secret: config.secret }));
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    guard = new AuthGuard(reflector, config, auth);
  });

  it('lets through with a valid token and leaves the user on the request', () => {
    const request: RequestWithSession = {
      headers: { authorization: `Bearer ${auth.issueToken('juan')}` },
    };
    expect(guard.canActivate(contextWith(request))).toBe(true);
    expect(request.user).toBe('juan');
  });

  it('rejects without a header', () => {
    expect(() => guard.canActivate(contextWith({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a scheme other than Bearer', () => {
    const request = { headers: { authorization: 'Basic anVhbjpjbGF2ZQ==' } };
    expect(() => guard.canActivate(contextWith(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a made-up token', () => {
    const request = { headers: { authorization: 'Bearer no.es.un.token' } };
    expect(() => guard.canActivate(contextWith(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('lets through routes marked with @Public()', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) => key === PUBLIC_KEY);
    expect(guard.canActivate(contextWith({ headers: {} }))).toBe(true);
  });

  it('with auth disabled it requires nothing (local development)', () => {
    const open = new AuthGuard(reflector, { ...config, active: false }, auth);
    expect(open.canActivate(contextWith({ headers: {} }))).toBe(true);
  });
});
