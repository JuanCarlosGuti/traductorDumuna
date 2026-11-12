import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Grade } from '../sm2';

export class SrsAnswerDto {
  @ApiProperty({ description: 'La palabra de la tarjeta respondida', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  word!: string;

  @ApiProperty({ enum: Grade })
  @IsEnum(Grade)
  grade!: Grade;
}

export class SrsCardDto {
  @ApiProperty({ description: 'Palabra o expresión damana (anverso)' })
  word!: string;

  @ApiProperty({ enum: ['vocabulario', 'frecuencia'], description: 'De dónde sale la tarjeta' })
  type!: 'vocabulario' | 'frecuencia';

  @ApiProperty({
    description:
      'Reverso: la traducción del vocabulario, o las traducciones candidatas para palabras frecuentes',
  })
  translation!: string;

  @ApiProperty()
  repetitions!: number;
}

export class SrsStatusDto {
  @ApiProperty({ type: SrsCardDto, nullable: true, description: 'null si no queda nada por repasar' })
  card!: SrsCardDto | null;

  @ApiProperty({ description: 'Tarjetas ya vistas cuya revisión venció' })
  pendingCards!: number;

  @ApiProperty({ description: 'Tarjetas nunca vistas' })
  newCards!: number;
}

export class UpdatedProgressDto {
  @ApiProperty()
  word!: string;

  @ApiProperty()
  repetitions!: number;

  @ApiProperty()
  intervalDays!: number;

  @ApiProperty({ description: 'ISO 8601' })
  nextReview!: string;
}
