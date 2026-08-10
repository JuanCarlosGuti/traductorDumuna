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

/** Contexto mínimo: solo lo que el guard llega a mirar. */
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

  it('deja pasar con un token válido y deja el usuario en la petición', () => {
    const peticion: PeticionConSesion = {
      headers: { authorization: `Bearer ${auth.emitirToken('juan')}` },
    };
    expect(guard.canActivate(contextoCon(peticion))).toBe(true);
    expect(peticion.usuario).toBe('juan');
  });

  it('rechaza sin cabecera', () => {
    expect(() => guard.canActivate(contextoCon({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un esquema que no sea Bearer', () => {
    const peticion = { headers: { authorization: 'Basic anVhbjpjbGF2ZQ==' } };
    expect(() => guard.canActivate(contextoCon(peticion))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un token inventado', () => {
    const peticion = { headers: { authorization: 'Bearer no.es.un.token' } };
    expect(() => guard.canActivate(contextoCon(peticion))).toThrow(
      UnauthorizedException,
    );
  });

  it('deja pasar las rutas marcadas con @Publico()', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((clave) => clave === CLAVE_PUBLICO);
    expect(guard.canActivate(contextoCon({ headers: {} }))).toBe(true);
  });

  it('con la auth desactivada no exige nada (desarrollo local)', () => {
    const abierto = new AuthGuard(reflector, { ...config, activa: false }, auth);
    expect(abierto.canActivate(contextoCon({ headers: {} }))).toBe(true);
  });
});
