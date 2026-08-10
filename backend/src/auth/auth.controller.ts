import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CONFIG_AUTH, ConfigAuth } from './auth.config';
import { PeticionConSesion } from './auth.guard';
import { AuthService } from './auth.service';
import { Publico } from './publico.decorator';
import { EstadoAuthDto, LoginDto, SesionDto, UsuarioDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG_AUTH) private readonly config: ConfigAuth,
  ) {}

  @Publico()
  @Get('estado')
  @ApiOperation({
    summary: '¿Exige sesión este servidor? Permite a la app saltarse el login en local.',
  })
  estado(): EstadoAuthDto {
    return { activa: this.config.activa };
  }

  @Publico()
  @Post('login')
  // 200 en vez del 201 por defecto de POST: no se está creando un recurso.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrega un token de sesión a cambio de las credenciales' })
  login(@Body() dto: LoginDto, @Req() peticion: PeticionConSesion): SesionDto {
    const ip = peticion.ip ?? 'desconocida';
    if (this.auth.bloqueado(ip)) {
      throw new HttpException(
        'Demasiados intentos fallidos; espera unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!this.auth.verificar(dto.usuario, dto.password)) {
      this.auth.registrarFallo(ip);
      // Mismo mensaje para usuario y contraseña: distinguirlos confirmaría
      // a quien prueba cuál de los dos acertó.
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    this.auth.olvidarFallos(ip);
    return {
      token: this.auth.emitirToken(dto.usuario),
      usuario: dto.usuario,
      duracionDias: this.config.duracionDias,
    };
  }

  @Get('sesion')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comprueba que el token sigue siendo válido' })
  sesion(@Req() peticion: PeticionConSesion): UsuarioDto {
    return { usuario: peticion.usuario ?? this.config.usuario };
  }
}
