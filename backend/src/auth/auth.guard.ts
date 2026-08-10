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

/** Petición con el usuario ya resuelto por el guard. */
export interface PeticionConSesion {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  usuario?: string;
}

/**
 * Guard global: todo /api exige sesión salvo lo marcado con @Publico().
 *
 * Los archivos estáticos del frontend NO pasan por aquí (los sirve
 * ServeStatic, que no es una ruta de Nest), y así debe ser: la SPA tiene
 * que poder cargarse para pintar la pantalla de login, y Render hace su
 * health check contra «/».
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
