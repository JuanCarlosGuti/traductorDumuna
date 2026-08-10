import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Nombre de usuario configurado en el servidor' })
  @IsString()
  @IsNotEmpty()
  // Tope defensivo: sin él se podrían mandar megabytes para que el servidor
  // los hashee en cada intento.
  @MaxLength(200)
  usuario!: string;

  @ApiProperty({ description: 'Contraseña configurada en el servidor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

export class SesionDto {
  @ApiProperty({ description: 'Token de sesión; va en la cabecera Authorization: Bearer' })
  token!: string;

  @ApiProperty()
  usuario!: string;

  @ApiProperty({ description: 'Días que dura la sesión antes de caducar' })
  duracionDias!: number;
}

export class EstadoAuthDto {
  @ApiProperty({
    description:
      'false cuando el servidor no tiene credenciales configuradas y la API está abierta (solo desarrollo local)',
  })
  activa!: boolean;
}

export class UsuarioDto {
  @ApiProperty()
  usuario!: string;
}
