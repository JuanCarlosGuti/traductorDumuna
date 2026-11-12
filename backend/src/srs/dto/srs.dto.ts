import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Grade } from '../sm2';

export class SrsAnswerDto {
  @ApiProperty({ description: 'La palabra de la tarjeta respondida', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  palabra!: string;

  @ApiProperty({ enum: Grade })
  @IsEnum(Grade)
  calificacion!: Grade;
}

export class SrsCardDto {
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

export class SrsStatusDto {
  @ApiProperty({ type: SrsCardDto, nullable: true, description: 'null si no queda nada por repasar' })
  tarjeta!: SrsCardDto | null;

  @ApiProperty({ description: 'Tarjetas ya vistas cuya revisión venció' })
  pendientes!: number;

  @ApiProperty({ description: 'Tarjetas nunca vistas' })
  nuevas!: number;
}

export class UpdatedProgressDto {
  @ApiProperty()
  palabra!: string;

  @ApiProperty()
  repeticiones!: number;

  @ApiProperty()
  intervaloDias!: number;

  @ApiProperty({ description: 'ISO 8601' })
  proximaRevision!: string;
}
