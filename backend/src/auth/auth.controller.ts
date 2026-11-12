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
import { RequestWithSession } from './auth.guard';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthStatusDto, LoginDto, SessionDto, UserDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG_AUTH) private readonly config: ConfigAuth,
  ) {}

  @Public()
  @Get('status')
  @ApiOperation({
    summary: '¿Exige sesión este servidor? Permite a la app saltarse el login en local.',
  })
  status(): AuthStatusDto {
    return { active: this.config.active };
  }

  @Public()
  @Post('login')
  // 200 instead of POST's default 201: no resource is being created.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrega un token de sesión a cambio de las credenciales' })
  login(@Body() dto: LoginDto, @Req() request: RequestWithSession): SessionDto {
    const ip = request.ip ?? 'desconocida';
    if (this.auth.blocked(ip)) {
      throw new HttpException(
        'Demasiados intentos fallidos; espera unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!this.auth.verify(dto.user, dto.password)) {
      this.auth.recordFailure(ip);
      // Same message for user and password: telling them apart would confirm
      // to whoever is probing which of the two was right.
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    this.auth.forgetFailures(ip);
    return {
      token: this.auth.issueToken(dto.user),
      user: dto.user,
      durationDays: this.config.durationDays,
    };
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comprueba que el token sigue siendo válido' })
  session(@Req() request: RequestWithSession): UserDto {
    return { user: request.user ?? this.config.user };
  }
}
