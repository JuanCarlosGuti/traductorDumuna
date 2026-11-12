import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { CONFIG_AUTH, ConfigAuth } from './auth.config';

/** Failed attempts tolerated per IP before blocking. */
export const MAX_ATTEMPTS = 8;
/** How long the block lasts once the attempts are used up. */
export const BLOCK_MS = 10 * 60 * 1000;

interface Attempts {
  failures: number;
  last: number;
}

/**
 * Constant-time comparison. A plain `===` stops at the first differing
 * character, and that difference of microseconds, measured many times, lets
 * the password be guessed character by character. The SHA-256 digests are
 * compared because timingSafeEqual requires both sides to have the same length.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

@Injectable()
export class AuthService {
  private readonly attemptsByIp = new Map<string, Attempts>();

  constructor(
    @Inject(CONFIG_AUTH) private readonly config: ConfigAuth,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Both comparisons are ALWAYS made, without short-circuiting: if a
   * wrong user skipped the password check, the response
   * time would reveal when the user was right.
   */
  verify(user: string, password: string): boolean {
    const userOk = safeEqual(user, this.config.user);
    const passwordOk = safeEqual(password, this.config.password);
    return userOk && passwordOk;
  }

  issueToken(user: string): string {
    return this.jwt.sign({ sub: user });
  }

  /** The user in the token, or null if it has been tampered with or has expired. */
  userFromToken(token: string): string | null {
    try {
      const load = this.jwt.verify<{ sub?: string }>(token);
      return typeof load.sub === 'string' ? load.sub : null;
    } catch {
      return null;
    }
  }

  blocked(ip: string, now: number = Date.now()): boolean {
    const attempts = this.attemptsByIp.get(ip);
    if (!attempts) return false;
    if (now - attempts.last > BLOCK_MS) {
      this.attemptsByIp.delete(ip);
      return false;
    }
    return attempts.failures >= MAX_ATTEMPTS;
  }

  recordFailure(ip: string, now: number = Date.now()): void {
    this.purge(now);
    const attempts = this.attemptsByIp.get(ip);
    const valid = attempts && now - attempts.last <= BLOCK_MS;
    this.attemptsByIp.set(ip, {
      failures: valid ? attempts.failures + 1 : 1,
      last: now,
    });
  }

  forgetFailures(ip: string): void {
    this.attemptsByIp.delete(ip);
  }

  /** Keeps the map from growing without bound with IPs that no longer matter. */
  private purge(now: number): void {
    for (const [ip, attempts] of this.attemptsByIp) {
      if (now - attempts.last > BLOCK_MS) this.attemptsByIp.delete(ip);
    }
  }
}
