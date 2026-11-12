import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { CONFIG_AUTH, ConfigAuth } from './auth.config';
import { PUBLIC_KEY } from './public.decorator';

/** Request with the user already resolved by the guard. */
export interface RequestWithSession {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  usuario?: string;
}

/**
 * Global guard: all of /api requires a session except what is marked with @Public().
 *
 * The frontend's static files do NOT go through here (they are served by
 * ServeStatic, which is not a Nest route), and that is how it must be: the SPA has
 * to be able to load in order to render the login screen, and Render runs its
 * health check against «/».
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CONFIG_AUTH) private readonly config: ConfigAuth,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.activa) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const header = request.headers?.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const [kind, token] = (value ?? '').split(' ');
    if (kind !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta la sesión');
    }

    const user = this.auth.userFromToken(token);
    if (!user) {
      throw new UnauthorizedException('Sesión inválida o caducada');
    }
    request.usuario = user;
    return true;
  }
}
