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
import { CLAVE_PUBLICO } from './publico.decorator';

/** Request with the user already resolved by the guard. */
export interface PeticionConSesion {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  usuario?: string;
}

/**
 * Global guard: all of /api requires a session except what is marked with @Publico().
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

  canActivate(contexto: ExecutionContext): boolean {
    if (!this.config.activa) return true;

    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const peticion = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const cabecera = peticion.headers?.authorization;
    const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera;
    const [tipo, token] = (valor ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta la sesión');
    }

    const usuario = this.auth.usuarioDelToken(token);
    if (!usuario) {
      throw new UnauthorizedException('Sesión inválida o caducada');
    }
    peticion.usuario = usuario;
    return true;
  }
}
