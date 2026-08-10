import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { CONFIG_AUTH, ConfigAuth } from './auth.config';

/** Intentos fallidos que se toleran por IP antes de bloquear. */
export const MAX_INTENTOS = 8;
/** Cuánto dura el bloqueo una vez agotados los intentos. */
export const BLOQUEO_MS = 10 * 60 * 1000;

interface Intentos {
  fallos: number;
  ultimo: number;
}

/**
 * Compara en tiempo constante. Un `===` normal corta en el primer carácter
 * distinto, y esa diferencia de microsegundos, medida muchas veces, deja
 * adivinar la contraseña carácter a carácter. Se comparan los digests
 * SHA-256 porque timingSafeEqual exige que ambos lados midan lo mismo.
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
   * Las dos comparaciones se hacen SIEMPRE, sin cortocircuitar: si un
   * usuario equivocado saltara la comprobación de contraseña, el tiempo de
   * respuesta revelaría cuándo se acertó el usuario.
   */
  verificar(usuario: string, password: string): boolean {
    const usuarioOk = igualSeguro(usuario, this.config.usuario);
    const passwordOk = igualSeguro(password, this.config.password);
    return usuarioOk && passwordOk;
  }

  emitirToken(usuario: string): string {
    return this.jwt.sign({ sub: usuario });
  }

  /** El usuario del token, o null si viene manipulado o caducado. */
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

  /** Evita que el mapa crezca sin límite con IPs que ya no importan. */
  private purgar(ahora: number): void {
    for (const [ip, intentos] of this.intentosPorIp) {
      if (ahora - intentos.ultimo > BLOQUEO_MS) this.intentosPorIp.delete(ip);
    }
  }
}
