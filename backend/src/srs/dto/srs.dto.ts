import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Calificacion } from '../sm2';

export class RespuestaSrsDto {
  @ApiProperty({ description: 'La palabra de la tarjeta respondida', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  palabra!: string;

  @ApiProperty({ enum: Calificacion })
  @IsEnum(Calificacion)
  calificacion!: Calificacion;
}

export class TarjetaSrsDto {
  @ApiProperty({ description: 'Palabra o expresión damana (anverso)' })
  palabra!: string;

  @ApiProperty({ enum: ['vocabulario', 'frecuencia'], description: 'De dónde sale la tarjeta' })
  tipo!: 'vocabulario' | 'frecuencia';

  @ApiProperty({
    description:
      'Reverso: la traducción del vocabulario, o las traducciones candidatas para palabras frecuentes',
  })
  traduccion!: string;

  @ApiProperty()
  repeticiones!: number;
}

export class EstadoSrsDto {
  @ApiProperty({ type: TarjetaSrsDto, nullable: true, description: 'null si no queda nada por repasar' })
  tarjeta!: TarjetaSrsDto | null;

  @ApiProperty({ description: 'Tarjetas ya vistas cuya revisión venció' })
  pendientes!: number;

  @ApiProperty({ description: 'Tarjetas nunca vistas' })
  nuevas!: number;
}

export class ProgresoActualizadoDto {
  @ApiProperty()
  palabra!: string;

  @ApiProperty()
  repeticiones!: number;

  @ApiProperty()
  intervaloDias!: number;

  @ApiProperty({ description: 'ISO 8601' })
  proximaRevision!: string;
}
