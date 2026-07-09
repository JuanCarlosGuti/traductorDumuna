import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FuenteCorpus, Idioma } from '../consulta.enums';

export class BuscarQueryDto {
  @ApiProperty({ description: 'Palabra a buscar (insensible a mayúsculas y tildes; ʉ ≠ u, ñ ≠ n)', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({ enum: Idioma, default: Idioma.damana, description: 'Idioma en el que se busca' })
  @IsOptional()
  @IsEnum(Idioma)
  idioma: Idioma = Idioma.damana;

  @ApiPropertyOptional({ enum: FuenteCorpus, description: 'Restringir a una fuente del corpus' })
  @IsOptional()
  @IsEnum(FuenteCorpus)
  fuente?: FuenteCorpus;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 1000, description: 'Máximo de concordancias devueltas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limite = 100;
}

export class FrecuenciasQueryDto {
  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 10000, description: 'Máximo de palabras devueltas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limite = 500;
}

export class ConcordanciaDto {
  @ApiProperty({ enum: FuenteCorpus })
  fuente!: FuenteCorpus;

  @ApiProperty({ description: 'rowid de la fila en su tabla de origen' })
  id!: number;

  @ApiProperty({ example: 'capítulo 3', description: 'Referencia legible: capítulo N / frase N (fuente) / vocabulario N' })
  referencia!: string;

  @ApiProperty({ description: 'Contexto ±120 caracteres cortado en límite de palabra; la palabra encontrada va envuelta en <mark> y el resto escapado como HTML' })
  fragmento!: string;

  @ApiProperty({ description: 'Texto completo paralelo en el otro idioma' })
  textoParalelo!: string;
}

export class RespuestaBusquedaDto {
  @ApiProperty()
  consulta!: string;

  @ApiProperty({ enum: Idioma })
  idioma!: Idioma;

  @ApiProperty({ description: 'Total de ocurrencias encontradas (puede superar a las devueltas si excede el límite)' })
  total!: number;

  @ApiProperty({ type: [ConcordanciaDto] })
  resultados!: ConcordanciaDto[];
}

export class FrecuenciaFuenteDto {
  @ApiProperty({ enum: FuenteCorpus })
  fuente!: FuenteCorpus;

  @ApiProperty()
  frecuencia!: number;
}

export class TraduccionCandidataDto {
  @ApiProperty({ description: 'Palabra española normalizada que co-ocurre en los textos paralelos' })
  palabra!: string;

  @ApiProperty({ description: 'En cuántos textos paralelos co-ocurre (conteo de ocurrencias)' })
  coocurrencias!: number;
}

export class FichaPalabraDto {
  @ApiProperty({ description: 'La palabra en forma normalizada' })
  palabra!: string;

  @ApiProperty()
  frecuenciaTotal!: number;

  @ApiProperty({ type: [FrecuenciaFuenteDto] })
  frecuenciaPorFuente!: FrecuenciaFuenteDto[];

  @ApiProperty({ type: [ConcordanciaDto], description: 'Primeras 10 concordancias' })
  concordancias!: ConcordanciaDto[];

  @ApiProperty({ type: [TraduccionCandidataDto], description: '10 palabras españolas que más co-ocurren en los textos paralelos (excluyendo stopwords)' })
  traduccionesCandidatas!: TraduccionCandidataDto[];
}

export class FrecuenciaDto {
  @ApiProperty()
  palabra!: string;

  @ApiProperty()
  frecuencia!: number;

  @ApiProperty({
    nullable: true,
    description: 'Categoría de la entrada de vocabulario cuyo damana coincide con la palabra, si existe',
  })
  categoria!: string | null;
}

export class VocabularioDto {
  @ApiProperty({ description: 'rowid en la tabla vocabulario' })
  id!: number;

  @ApiProperty()
  espanol!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true, example: 'Verbos' })
  categoria!: string | null;

  @ApiProperty({ nullable: true })
  notas!: string | null;

  @ApiProperty({ nullable: true })
  fuente!: string | null;
}

export class FraseDto {
  @ApiProperty({ description: 'rowid en la tabla frases' })
  id!: number;

  @ApiProperty({ nullable: true })
  fuente!: string | null;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true })
  espanol!: string | null;

  @ApiProperty({ nullable: true })
  notas!: string | null;
}

export class LemaDto {
  @ApiProperty({ example: 'tener' })
  lema!: string;

  @ApiProperty({ description: 'Número de formas conjugadas' })
  formas!: number;
}

export class ConjugacionDto {
  @ApiProperty({ description: 'rowid en la tabla conjugaciones' })
  id!: number;

  @ApiProperty({ example: 'nujkunananka' })
  damana!: string;

  @ApiProperty({ example: 'yo tuve', description: 'Glosa en español' })
  espanol!: string;

  @ApiProperty({ example: 'tener' })
  lema!: string;

  @ApiProperty({ nullable: true })
  fuente!: string | null;

  @ApiProperty({ nullable: true })
  notas!: string | null;
}

export class TablaConjugacionDto {
  @ApiProperty()
  lema!: string;

  @ApiProperty({ type: [ConjugacionDto] })
  conjugaciones!: ConjugacionDto[];
}
