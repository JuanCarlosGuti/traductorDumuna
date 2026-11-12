import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigAuth } from './auth.config';
import { AuthGuard, PeticionConSesion } from './auth.guard';
import { AuthService } from './auth.service';
import { CLAVE_PUBLICO } from './publico.decorator';

const config: ConfigAuth = {
  activa: true,
  usuario: 'juan',
  password: 'clave',
  secreto: 'secreto-de-prueba-suficientemente-largo',
  duracionDias: 30,
};

/** Minimal context: only what the guard actually looks at. */
const contextoCon = (peticion: PeticionConSesion): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => peticion }),
    getHandler: () => function manejador() {},
    getClass: () => class Controlador {},
  }) as unknown as ExecutionContext;

describe('AuthGuard', () => {
  let auth: AuthService;
  let guard: AuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    auth = new AuthService(config, new JwtService({ secret: config.secreto }));
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    guard = new AuthGuard(reflector, config, auth);
  });

  it('lets through with a valid token and leaves the user on the request', () => {
    const peticion: PeticionConSesion = {
      headers: { authorization: `Bearer ${auth.emitirToken('juan')}` },
    };
    expect(guard.canActivate(contextoCon(peticion))).toBe(true);
    expect(peticion.usuario).toBe('juan');
  });

  it('rejects without a header', () => {
    expect(() => guard.canActivate(contextoCon({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a scheme other than Bearer', () => {
    const peticion = { headers: { authorization: 'Basic anVhbjpjbGF2ZQ==' } };
    expect(() => guard.canActivate(contextoCon(peticion))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a made-up token', () => {
    const peticion = { headers: { authorization: 'Bearer no.es.un.token' } };
    expect(() => guard.canActivate(contextoCon(peticion))).toThrow(
      UnauthorizedException,
    );
  });

  it('lets through routes marked with @Publico()', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((clave) => clave === CLAVE_PUBLICO);
    expect(guard.canActivate(contextoCon({ headers: {} }))).toBe(true);
  });

  it('with auth disabled it requires nothing (local development)', () => {
    const abierto = new AuthGuard(reflector, { ...config, activa: false }, auth);
    expect(abierto.canActivate(contextoCon({ headers: {} }))).toBe(true);
  });
});
