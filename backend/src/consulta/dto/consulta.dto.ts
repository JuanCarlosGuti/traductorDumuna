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
import { CorpusSource, Language } from '../consulta.enums';

export class SearchQueryDto {
  @ApiProperty({ description: 'Palabra a buscar (insensible a mayúsculas y tildes; ʉ ≠ u, ñ ≠ n)', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({ enum: Language, default: Language.damana, description: 'Idioma en el que se busca' })
  @IsOptional()
  @IsEnum(Language)
  idioma: Language = Language.damana;

  @ApiPropertyOptional({ enum: CorpusSource, description: 'Restringir a una fuente del corpus' })
  @IsOptional()
  @IsEnum(CorpusSource)
  fuente?: CorpusSource;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 1000, description: 'Máximo de concordancias devueltas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limite = 100;
}

export class FrequenciesQueryDto {
  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 10000, description: 'Máximo de palabras devueltas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limite = 500;
}

export class ConcordanceDto {
  @ApiProperty({ enum: CorpusSource })
  fuente!: CorpusSource;

  @ApiProperty({ description: 'rowid de la fila en su tabla de origen' })
  id!: number;

  @ApiProperty({ example: 'capítulo 3', description: 'Referencia legible: capítulo N / frase N (fuente) / vocabulario N' })
  referencia!: string;

  @ApiProperty({ description: 'Contexto ±120 caracteres cortado en límite de palabra; la palabra encontrada va envuelta en <mark> y el resto escapado como HTML' })
  fragmento!: string;

  @ApiProperty({ description: 'Texto completo paralelo en el otro idioma' })
  textoParalelo!: string;

  @ApiProperty({
    nullable: true,
    description: 'Solo en modo similitud: puntaje coseno TF-IDF (las oraciones estado=revisar pesan la mitad)',
  })
  puntaje!: number | null;
}

export class SearchResponseDto {
  @ApiProperty()
  consulta!: string;

  @ApiProperty({ enum: Language })
  idioma!: Language;

  @ApiProperty({
    enum: ['concordancia', 'similitud'],
    description: 'concordancia = consulta de una palabra (ocurrencias exactas); similitud = varias palabras (TF-IDF sobre oraciones, frases y conjugaciones)',
  })
  modo!: 'concordancia' | 'similitud';

  @ApiProperty({ description: 'Total de ocurrencias encontradas (puede superar a las devueltas si excede el límite)' })
  total!: number;

  @ApiProperty({ type: [ConcordanceDto] })
  resultados!: ConcordanceDto[];
}

export class SourceFrequencyDto {
  @ApiProperty({ enum: CorpusSource })
  fuente!: CorpusSource;

  @ApiProperty()
  frecuencia!: number;
}

export class CandidateTranslationDto {
  @ApiProperty({ description: 'Palabra española normalizada que co-ocurre en los textos paralelos' })
  palabra!: string;

  @ApiProperty({ description: 'En cuántos textos paralelos co-ocurre (conteo de ocurrencias)' })
  coocurrencias!: number;
}

export class WordCardVocabularyEntryDto {
  @ApiProperty({ description: 'Traducción directa registrada en el vocabulario' })
  espanol!: string;

  @ApiProperty({ nullable: true })
  categoria!: string | null;

  @ApiProperty({ nullable: true })
  notas!: string | null;

  @ApiProperty({ nullable: true })
  fuente!: string | null;
}

export class VerbFormDto {
  @ApiProperty({ example: 'nujkunananka', description: 'La forma conjugada completa en la que aparece la palabra' })
  damana!: string;

  @ApiProperty({ example: 'yo tuve', description: 'Glosa de la forma conjugada' })
  espanol!: string;

  @ApiProperty({ example: 'tener' })
  lema!: string;
}

export class WordCardDto {
  @ApiProperty({ description: 'La palabra en forma normalizada' })
  palabra!: string;

  @ApiProperty({
    type: [WordCardVocabularyEntryDto],
    description: 'Traducciones directas: entradas de vocabulario cuyo damana coincide con la palabra',
  })
  entradasVocabulario!: WordCardVocabularyEntryDto[];

  @ApiProperty({
    type: [VerbFormDto],
    description: 'Si la palabra es una forma conjugada, su glosa y lema',
  })
  formasVerbales!: VerbFormDto[];

  @ApiProperty()
  frecuenciaTotal!: number;

  @ApiProperty({ type: [SourceFrequencyDto] })
  frecuenciaPorFuente!: SourceFrequencyDto[];

  @ApiProperty({ type: [ConcordanceDto], description: 'Primeras 10 concordancias' })
  concordancias!: ConcordanceDto[];

  @ApiProperty({ type: [CandidateTranslationDto], description: '10 palabras españolas que más co-ocurren en los textos paralelos (traducciones candidatas estadísticas, sin stopwords)' })
  traduccionesCandidatas!: CandidateTranslationDto[];
}

export class FrequencyDto {
  @ApiProperty()
  palabra!: string;

  @ApiProperty()
  frecuencia!: number;

  @ApiProperty({
    nullable: true,
    description: 'Traducción directa del vocabulario (o glosa de conjugación) cuando el damana coincide con la palabra',
  })
  traduccion!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Categoría de la entrada de vocabulario cuyo damana coincide con la palabra, si existe',
  })
  categoria!: string | null;
}

export class VocabularyDto {
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

export class PhraseDto {
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

  @ApiProperty({ enum: ['biblico', 'cotidiano', 'gramatica'], description: 'Registro de lengua del par' })
  dominio!: 'biblico' | 'cotidiano' | 'gramatica';
}

export class LemmaDto {
  @ApiProperty({ example: 'tener' })
  lema!: string;

  @ApiProperty({ description: 'Número de formas conjugadas' })
  formas!: number;
}

export class ConjugationDto {
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

export class ConjugationTableDto {
  @ApiProperty()
  lema!: string;

  @ApiProperty({ type: [ConjugationDto] })
  conjugaciones!: ConjugationDto[];
}

export class ProperNameDto {
  @ApiProperty({ description: 'rowid en la tabla nombres_propios' })
  id!: number;

  @ApiProperty({ example: 'Jehová', description: 'Grafía con la que aparece en el corpus damana' })
  damana!: string;

  @ApiProperty({ example: 'Jehová' })
  espanol!: string;

  @ApiProperty()
  seEscribeIgual!: boolean;

  @ApiProperty({ type: [String], description: 'Otras grafías vistas en las fuentes' })
  otrasGrafias!: string[];

  @ApiProperty({ nullable: true })
  notas!: string | null;
}
