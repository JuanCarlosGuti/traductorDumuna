import { JwtService } from '@nestjs/jwt';
import { ConfigAuth } from './auth.config';
import { AuthService, BLOQUEO_MS, MAX_INTENTOS } from './auth.service';

const CONTRASENA = 'ñandú-ʉnkua-2026';

const config: ConfigAuth = {
  activa: true,
  usuario: 'juan',
  password: CONTRASENA,
  secreto: 'secreto-de-prueba-suficientemente-largo',
  duracionDias: 30,
};

describe('AuthService', () => {
  let servicio: AuthService;

  beforeEach(() => {
    servicio = new AuthService(
      config,
      new JwtService({
        secret: config.secreto,
        signOptions: { expiresIn: `${config.duracionDias}d` },
      }),
    );
  });

  it('accepts the correct credentials, with ʉ and ñ in the password', () => {
    expect(servicio.verificar('juan', CONTRASENA)).toBe(true);
  });

  it('rejects the password with u where ʉ goes: they are different letters', () => {
    expect(servicio.verificar('juan', 'ñandú-unkua-2026')).toBe(false);
  });

  it('rejects the password with n where ñ goes', () => {
    expect(servicio.verificar('juan', 'nandú-ʉnkua-2026')).toBe(false);
  });

  it('rejects a wrong user even if the password is right', () => {
    expect(servicio.verificar('otro', CONTRASENA)).toBe(false);
  });

  it('the issued token can be verified and carries the user', () => {
    const token = servicio.emitirToken('juan');
    expect(servicio.usuarioDelToken(token)).toBe('juan');
  });

  it('a tampered token is not valid', () => {
    const token = servicio.emitirToken('juan');
    expect(servicio.usuarioDelToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('a token signed with another secret is not valid', () => {
    const intruso = new AuthService(
      config,
      new JwtService({ secret: 'otro-secreto-distinto' }),
    );
    expect(servicio.usuarioDelToken(intruso.emitirToken('juan'))).toBeNull();
  });

  it('an expired token is not valid', () => {
    const efimero = new AuthService(
      config,
      new JwtService({ secret: config.secreto, signOptions: { expiresIn: '-1s' } }),
    );
    expect(servicio.usuarioDelToken(efimero.emitirToken('juan'))).toBeNull();
  });

  describe('attempt limit', () => {
    const IP = '203.0.113.7';

    it('blocks after the attempts are used up', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado(IP, 1000)).toBe(true);
    });

    it('does not block before they are used up', () => {
      for (let i = 0; i < MAX_INTENTOS - 1; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado(IP, 1000)).toBe(false);
    });

    it('the block expires by itself', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado(IP, 1000 + BLOQUEO_MS + 1)).toBe(false);
    });

    it('a successful login clears previous failures', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      servicio.olvidarFallos(IP);
      expect(servicio.bloqueado(IP, 1000)).toBe(false);
    });

    it('the block is per IP: it does not lock everyone else out', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado('198.51.100.4', 1000)).toBe(false);
    });
  });
});
