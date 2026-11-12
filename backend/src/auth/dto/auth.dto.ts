import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Nombre de usuario configurado en el servidor' })
  @IsString()
  @IsNotEmpty()
  // Defensive cap: without it megabytes could be sent for the server
  // to hash on every attempt.
  @MaxLength(200)
  user!: string;

  @ApiProperty({ description: 'Contraseña configurada en el servidor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

export class SessionDto {
  @ApiProperty({ description: 'Token de sesión; va en la cabecera Authorization: Bearer' })
  token!: string;

  @ApiProperty()
  user!: string;

  @ApiProperty({ description: 'Días que dura la sesión antes de caducar' })
  durationDays!: number;
}

export class AuthStatusDto {
  @ApiProperty({
    description:
      'false cuando el servidor no tiene credenciales configuradas y la API está abierta (solo desarrollo local)',
  })
  active!: boolean;
}

export class UserDto {
  @ApiProperty()
  user!: string;
}
