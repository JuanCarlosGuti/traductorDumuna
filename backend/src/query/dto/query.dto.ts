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
import { CorpusSource, Language } from '../query.enums';

export class SearchQueryDto {
  @ApiProperty({ description: 'Palabra a buscar (insensible a mayúsculas y tildes; ʉ ≠ u, ñ ≠ n)', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({ enum: Language, default: Language.damana, description: 'Idioma en el que se busca' })
  @IsOptional()
  @IsEnum(Language)
  language: Language = Language.damana;

  @ApiPropertyOptional({ enum: CorpusSource, description: 'Restringir a una fuente del corpus' })
  @IsOptional()
  @IsEnum(CorpusSource)
  source?: CorpusSource;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 1000, description: 'Máximo de concordancias devueltas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 100;
}

export class FrequenciesQueryDto {
  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 10000, description: 'Máximo de palabras devueltas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit = 500;
}

export class ConcordanceDto {
  @ApiProperty({ enum: CorpusSource })
  source!: CorpusSource;

  @ApiProperty({ description: 'rowid de la fila en su tabla de origen' })
  id!: number;

  @ApiProperty({ example: 'capítulo 3', description: 'Referencia legible: capítulo N / frase N (fuente) / vocabulario N' })
  reference!: string;

  @ApiProperty({ description: 'Contexto ±120 caracteres cortado en límite de palabra; la palabra encontrada va envuelta en <mark> y el resto escapado como HTML' })
  fragment!: string;

  @ApiProperty({ description: 'Texto completo paralelo en el otro idioma' })
  parallelText!: string;

  @ApiProperty({
    nullable: true,
    description: 'Solo en modo similitud: puntaje coseno TF-IDF (las oraciones estado=revisar pesan la mitad)',
  })
  score!: number | null;
}

export class SearchResponseDto {
  @ApiProperty()
  query!: string;

  @ApiProperty({ enum: Language })
  language!: Language;

  @ApiProperty({
    enum: ['concordancia', 'similitud'],
    description: 'concordancia = consulta de una palabra (ocurrencias exactas); similitud = varias palabras (TF-IDF sobre oraciones, frases y conjugaciones)',
  })
  mode!: 'concordancia' | 'similitud';

  @ApiProperty({ description: 'Total de ocurrencias encontradas (puede superar a las devueltas si excede el límite)' })
  total!: number;

  @ApiProperty({ type: [ConcordanceDto] })
  results!: ConcordanceDto[];
}

export class SourceFrequencyDto {
  @ApiProperty({ enum: CorpusSource })
  source!: CorpusSource;

  @ApiProperty()
  frequency!: number;
}

export class CandidateTranslationDto {
  @ApiProperty({ description: 'Palabra española normalizada que co-ocurre en los textos paralelos' })
  word!: string;

  @ApiProperty({ description: 'En cuántos textos paralelos co-ocurre (conteo de ocurrencias)' })
  cooccurrences!: number;
}

export class WordCardVocabularyEntryDto {
  @ApiProperty({ description: 'Traducción directa registrada en el vocabulario' })
  spanish!: string;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  source!: string | null;
}

export class VerbFormDto {
  @ApiProperty({ example: 'nujkunananka', description: 'La forma conjugada completa en la que aparece la palabra' })
  damana!: string;

  @ApiProperty({ example: 'yo tuve', description: 'Glosa de la forma conjugada' })
  spanish!: string;

  @ApiProperty({ example: 'tener' })
  lemma!: string;
}

export class WordCardDto {
  @ApiProperty({ description: 'La palabra en forma normalizada' })
  word!: string;

  @ApiProperty({
    type: [WordCardVocabularyEntryDto],
    description: 'Traducciones directas: entradas de vocabulario cuyo damana coincide con la palabra',
  })
  vocabularyEntries!: WordCardVocabularyEntryDto[];

  @ApiProperty({
    type: [VerbFormDto],
    description: 'Si la palabra es una forma conjugada, su glosa y lema',
  })
  verbForms!: VerbFormDto[];

  @ApiProperty()
  totalFrequency!: number;

  @ApiProperty({ type: [SourceFrequencyDto] })
  frequencyBySource!: SourceFrequencyDto[];

  @ApiProperty({ type: [ConcordanceDto], description: 'Primeras 10 concordancias' })
  concordances!: ConcordanceDto[];

  @ApiProperty({ type: [CandidateTranslationDto], description: '10 palabras españolas que más co-ocurren en los textos paralelos (traducciones candidatas estadísticas, sin stopwords)' })
  candidateTranslations!: CandidateTranslationDto[];
}

export class FrequencyDto {
  @ApiProperty()
  word!: string;

  @ApiProperty()
  frequency!: number;

  @ApiProperty({
    nullable: true,
    description: 'Traducción directa del vocabulario (o glosa de conjugación) cuando el damana coincide con la palabra',
  })
  translation!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Categoría de la entrada de vocabulario cuyo damana coincide con la palabra, si existe',
  })
  category!: string | null;
}

export class VocabularyDto {
  @ApiProperty({ description: 'rowid en la tabla vocabulario' })
  id!: number;

  @ApiProperty()
  spanish!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true, example: 'Verbos' })
  category!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  source!: string | null;
}

export class PhraseDto {
  @ApiProperty({ description: 'rowid en la tabla frases' })
  id!: number;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true })
  spanish!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: ['biblico', 'cotidiano', 'gramatica'], description: 'Registro de lengua del par' })
  domain!: 'biblico' | 'cotidiano' | 'gramatica';
}

export class LemmaDto {
  @ApiProperty({ example: 'tener' })
  lemma!: string;

  @ApiProperty({ description: 'Número de formas conjugadas' })
  forms!: number;
}

export class ConjugationDto {
  @ApiProperty({ description: 'rowid en la tabla conjugaciones' })
  id!: number;

  @ApiProperty({ example: 'nujkunananka' })
  damana!: string;

  @ApiProperty({ example: 'yo tuve', description: 'Glosa en español' })
  spanish!: string;

  @ApiProperty({ example: 'tener' })
  lemma!: string;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;
}

export class ConjugationTableDto {
  @ApiProperty()
  lemma!: string;

  @ApiProperty({ type: [ConjugationDto] })
  conjugations!: ConjugationDto[];
}

export class ProperNameDto {
  @ApiProperty({ description: 'rowid en la tabla nombres_propios' })
  id!: number;

  @ApiProperty({ example: 'Jehová', description: 'Grafía con la que aparece en el corpus damana' })
  damana!: string;

  @ApiProperty({ example: 'Jehová' })
  spanish!: string;

  @ApiProperty()
  sameSpelling!: boolean;

  @ApiProperty({ type: [String], description: 'Otras grafías vistas en las fuentes' })
  otherSpellings!: string[];

  @ApiProperty({ nullable: true })
  notes!: string | null;
}
