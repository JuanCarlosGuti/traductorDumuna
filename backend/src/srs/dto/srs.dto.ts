import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Grade } from '../sm2';

export class SrsAnswerDto {
  @ApiProperty({ description: 'The word of the answered card', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  word!: string;

  @ApiProperty({ enum: Grade })
  @IsEnum(Grade)
  grade!: Grade;
}

export class SrsCardDto {
  @ApiProperty({ description: 'Damana word or expression (front)' })
  word!: string;

  @ApiProperty({ enum: ['vocabulary', 'frequency'], description: 'Where the card comes from' })
  type!: 'vocabulary' | 'frequency';

  @ApiProperty({
    description:
      'Back: the vocabulary translation, or the candidate translations for frequent words',
  })
  translation!: string;

  @ApiProperty()
  repetitions!: number;
}

export class SrsStatusDto {
  @ApiProperty({ type: SrsCardDto, nullable: true, description: 'null if there is nothing left to review' })
  card!: SrsCardDto | null;

  @ApiProperty({ description: 'Cards already seen whose review is due' })
  pendingCards!: number;

  @ApiProperty({ description: 'Cards never seen' })
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
