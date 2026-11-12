import { JwtService } from '@nestjs/jwt';
import { ConfigAuth } from './auth.config';
import { AuthService, BLOCK_MS, MAX_ATTEMPTS } from './auth.service';

const PASSWORD_VALUE = 'ñandú-ʉnkua-2026';

const config: ConfigAuth = {
  activa: true,
  usuario: 'juan',
  password: PASSWORD_VALUE,
  secreto: 'secreto-de-prueba-suficientemente-largo',
  duracionDias: 30,
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(
      config,
      new JwtService({
        secret: config.secreto,
        signOptions: { expiresIn: `${config.duracionDias}d` },
      }),
    );
  });

  it('accepts the correct credentials, with ʉ and ñ in the password', () => {
    expect(service.verify('juan', PASSWORD_VALUE)).toBe(true);
  });

  it('rejects the password with u where ʉ goes: they are different letters', () => {
    expect(service.verify('juan', 'ñandú-unkua-2026')).toBe(false);
  });

  it('rejects the password with n where ñ goes', () => {
    expect(service.verify('juan', 'nandú-ʉnkua-2026')).toBe(false);
  });

  it('rejects a wrong user even if the password is right', () => {
    expect(service.verify('otro', PASSWORD_VALUE)).toBe(false);
  });

  it('the issued token can be verified and carries the user', () => {
    const token = service.issueToken('juan');
    expect(service.userFromToken(token)).toBe('juan');
  });

  it('a tampered token is not valid', () => {
    const token = service.issueToken('juan');
    expect(service.userFromToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('a token signed with another secret is not valid', () => {
    const intruder = new AuthService(
      config,
      new JwtService({ secret: 'otro-secreto-distinto' }),
    );
    expect(service.userFromToken(intruder.issueToken('juan'))).toBeNull();
  });

  it('an expired token is not valid', () => {
    const ephemeral = new AuthService(
      config,
      new JwtService({ secret: config.secreto, signOptions: { expiresIn: '-1s' } }),
    );
    expect(service.userFromToken(ephemeral.issueToken('juan'))).toBeNull();
  });

  describe('attempt limit', () => {
    const IP = '203.0.113.7';

    it('blocks after the attempts are used up', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) service.recordFailure(IP, 1000);
      expect(service.blocked(IP, 1000)).toBe(true);
    });

    it('does not block before they are used up', () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) service.recordFailure(IP, 1000);
      expect(service.blocked(IP, 1000)).toBe(false);
    });

    it('the block expires by itself', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) service.recordFailure(IP, 1000);
      expect(service.blocked(IP, 1000 + BLOCK_MS + 1)).toBe(false);
    });

    it('a successful login clears previous failures', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) service.recordFailure(IP, 1000);
      service.forgetFailures(IP);
      expect(service.blocked(IP, 1000)).toBe(false);
    });

    it('the block is per IP: it does not lock everyone else out', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) service.recordFailure(IP, 1000);
      expect(service.blocked('198.51.100.4', 1000)).toBe(false);
    });
  });
});
