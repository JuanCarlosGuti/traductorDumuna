import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { CONFIG_AUTH, ConfigAuth } from './auth.config';

/** Failed attempts tolerated per IP before blocking. */
export const MAX_INTENTOS = 8;
/** How long the block lasts once the attempts are used up. */
export const BLOQUEO_MS = 10 * 60 * 1000;

interface Intentos {
  fallos: number;
  ultimo: number;
}

/**
 * Constant-time comparison. A plain `===` stops at the first differing
 * character, and that difference of microseconds, measured many times, lets
 * the password be guessed character by character. The SHA-256 digests are
 * compared because timingSafeEqual requires both sides to have the same length.
 */
function igualSeguro(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

@Injectable()
export class AuthService {
  private readonly intentosPorIp = new Map<string, Intentos>();

  constructor(
    @Inject(CONFIG_AUTH) private readonly config: ConfigAuth,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Both comparisons are ALWAYS made, without short-circuiting: if a
   * wrong user skipped the password check, the response
   * time would reveal when the user was right.
   */
  verificar(usuario: string, password: string): boolean {
    const usuarioOk = igualSeguro(usuario, this.config.usuario);
    const passwordOk = igualSeguro(password, this.config.password);
    return usuarioOk && passwordOk;
  }

  emitirToken(usuario: string): string {
    return this.jwt.sign({ sub: usuario });
  }

  /** The user in the token, or null if it has been tampered with or has expired. */
  usuarioDelToken(token: string): string | null {
    try {
      const carga = this.jwt.verify<{ sub?: string }>(token);
      return typeof carga.sub === 'string' ? carga.sub : null;
    } catch {
      return null;
    }
  }

  bloqueado(ip: string, ahora: number = Date.now()): boolean {
    const intentos = this.intentosPorIp.get(ip);
    if (!intentos) return false;
    if (ahora - intentos.ultimo > BLOQUEO_MS) {
      this.intentosPorIp.delete(ip);
      return false;
    }
    return intentos.fallos >= MAX_INTENTOS;
  }

  registrarFallo(ip: string, ahora: number = Date.now()): void {
    this.purgar(ahora);
    const intentos = this.intentosPorIp.get(ip);
    const vigente = intentos && ahora - intentos.ultimo <= BLOQUEO_MS;
    this.intentosPorIp.set(ip, {
      fallos: vigente ? intentos.fallos + 1 : 1,
      ultimo: ahora,
    });
  }

  olvidarFallos(ip: string): void {
    this.intentosPorIp.delete(ip);
  }

  /** Keeps the map from growing without bound with IPs that no longer matter. */
  private purgar(ahora: number): void {
    for (const [ip, intentos] of this.intentosPorIp) {
      if (ahora - intentos.ultimo > BLOQUEO_MS) this.intentosPorIp.delete(ip);
    }
  }
}
