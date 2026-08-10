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

  it('acepta las credenciales correctas, con ʉ y ñ en la contraseña', () => {
    expect(servicio.verificar('juan', CONTRASENA)).toBe(true);
  });

  it('rechaza la contraseña con u donde va ʉ: son letras distintas', () => {
    expect(servicio.verificar('juan', 'ñandú-unkua-2026')).toBe(false);
  });

  it('rechaza la contraseña con n donde va ñ', () => {
    expect(servicio.verificar('juan', 'nandú-ʉnkua-2026')).toBe(false);
  });

  it('rechaza usuario incorrecto aunque la contraseña sea buena', () => {
    expect(servicio.verificar('otro', CONTRASENA)).toBe(false);
  });

  it('el token emitido se puede verificar y lleva el usuario', () => {
    const token = servicio.emitirToken('juan');
    expect(servicio.usuarioDelToken(token)).toBe('juan');
  });

  it('un token manipulado no vale', () => {
    const token = servicio.emitirToken('juan');
    expect(servicio.usuarioDelToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('un token firmado con otro secreto no vale', () => {
    const intruso = new AuthService(
      config,
      new JwtService({ secret: 'otro-secreto-distinto' }),
    );
    expect(servicio.usuarioDelToken(intruso.emitirToken('juan'))).toBeNull();
  });

  it('un token caducado no vale', () => {
    const efimero = new AuthService(
      config,
      new JwtService({ secret: config.secreto, signOptions: { expiresIn: '-1s' } }),
    );
    expect(servicio.usuarioDelToken(efimero.emitirToken('juan'))).toBeNull();
  });

  describe('límite de intentos', () => {
    const IP = '203.0.113.7';

    it('bloquea tras agotar los intentos', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado(IP, 1000)).toBe(true);
    });

    it('no bloquea antes de agotarlos', () => {
      for (let i = 0; i < MAX_INTENTOS - 1; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado(IP, 1000)).toBe(false);
    });

    it('el bloqueo caduca solo', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado(IP, 1000 + BLOQUEO_MS + 1)).toBe(false);
    });

    it('un login correcto limpia los fallos previos', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      servicio.olvidarFallos(IP);
      expect(servicio.bloqueado(IP, 1000)).toBe(false);
    });

    it('el bloqueo es por IP: no deja fuera a los demás', () => {
      for (let i = 0; i < MAX_INTENTOS; i++) servicio.registrarFallo(IP, 1000);
      expect(servicio.bloqueado('198.51.100.4', 1000)).toBe(false);
    });
  });
});
