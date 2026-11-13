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
  @ApiProperty({ description: 'Word to search for (case and accent insensitive; ʉ ≠ u, ñ ≠ n)', example: 'nʉnka' })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({ enum: Language, default: Language.damana, description: 'Language to search in' })
  @IsOptional()
  @IsEnum(Language)
  language: Language = Language.damana;

  @ApiPropertyOptional({ enum: CorpusSource, description: 'Restrict to one corpus source' })
  @IsOptional()
  @IsEnum(CorpusSource)
  source?: CorpusSource;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 1000, description: 'Maximum number of concordances returned' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 100;
}

export class FrequenciesQueryDto {
  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 10000, description: 'Maximum number of words returned' })
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

  @ApiProperty({ description: 'rowid of the row in its source table' })
  id!: number;

  @ApiProperty({ example: 'capítulo 3', description: 'Readable reference shown in the app (in Spanish): oración N / frase N (source) / vocabulario N' })
  reference!: string;

  @ApiProperty({ description: 'Context of ±120 characters cut at a word boundary; the matched word is wrapped in <mark> and the rest is HTML-escaped' })
  fragment!: string;

  @ApiProperty({ description: 'Full parallel text in the other language' })
  parallelText!: string;

  @ApiProperty({
    nullable: true,
    description: 'Similarity mode only: TF-IDF cosine score (sentences with status=review weigh half)',
  })
  score!: number | null;
}

export class SearchResponseDto {
  @ApiProperty()
  query!: string;

  @ApiProperty({ enum: Language })
  language!: Language;

  @ApiProperty({
    enum: ['concordance', 'similarity'],
    description: 'concordance = one-word query (exact occurrences); similarity = several words (TF-IDF over sentences, phrases and conjugations)',
  })
  mode!: 'concordance' | 'similarity';

  @ApiProperty({ description: 'Total occurrences found (may exceed those returned if over the limit)' })
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
  @ApiProperty({ description: 'Normalized Spanish word that co-occurs in the parallel texts' })
  word!: string;

  @ApiProperty({ description: 'In how many parallel texts it co-occurs (occurrence count)' })
  cooccurrences!: number;
}

export class WordCardVocabularyEntryDto {
  @ApiProperty({ description: 'Direct translation recorded in the vocabulary' })
  spanish!: string;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  source!: string | null;
}

export class VerbFormDto {
  @ApiProperty({ example: 'nujkunananka', description: 'The full conjugated form in which the word appears' })
  damana!: string;

  @ApiProperty({ example: 'yo tuve', description: 'Gloss of the conjugated form' })
  spanish!: string;

  @ApiProperty({ example: 'tener' })
  lemma!: string;
}

export class WordCardDto {
  @ApiProperty({ description: 'The word in normalized form' })
  word!: string;

  @ApiProperty({
    type: [WordCardVocabularyEntryDto],
    description: 'Direct translations: vocabulary entries whose Damana matches the word',
  })
  vocabularyEntries!: WordCardVocabularyEntryDto[];

  @ApiProperty({
    type: [VerbFormDto],
    description: 'If the word is a conjugated form, its gloss and lemma',
  })
  verbForms!: VerbFormDto[];

  @ApiProperty()
  totalFrequency!: number;

  @ApiProperty({ type: [SourceFrequencyDto] })
  frequencyBySource!: SourceFrequencyDto[];

  @ApiProperty({ type: [ConcordanceDto], description: 'First 10 concordances' })
  concordances!: ConcordanceDto[];

  @ApiProperty({ type: [CandidateTranslationDto], description: 'The 10 Spanish words that co-occur most in the parallel texts (statistical candidate translations, without stopwords)' })
  candidateTranslations!: CandidateTranslationDto[];
}

export class FrequencyDto {
  @ApiProperty()
  word!: string;

  @ApiProperty()
  frequency!: number;

  @ApiProperty({
    nullable: true,
    description: 'Direct translation from the vocabulary (or conjugation gloss) when the Damana matches the word',
  })
  translation!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Category of the vocabulary entry whose Damana matches the word, if any',
  })
  category!: string | null;
}

export class VocabularyDto {
  @ApiProperty({ description: 'rowid in the vocabulary table' })
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
  @ApiProperty({ description: 'rowid in the phrases table' })
  id!: number;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true })
  spanish!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: ['biblical', 'everyday', 'grammar'], description: 'Language register of the pair' })
  domain!: 'biblical' | 'everyday' | 'grammar';
}

export class LemmaDto {
  @ApiProperty({ example: 'tener' })
  lemma!: string;

  @ApiProperty({ description: 'Number of conjugated forms' })
  forms!: number;
}

export class ConjugationDto {
  @ApiProperty({ description: 'rowid in the conjugations table' })
  id!: number;

  @ApiProperty({ example: 'nujkunananka' })
  damana!: string;

  @ApiProperty({ example: 'yo tuve', description: 'Spanish gloss' })
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
  @ApiProperty({ description: 'rowid in the proper_names table' })
  id!: number;

  @ApiProperty({ example: 'Jehová', description: 'Spelling with which it appears in the Damana corpus' })
  damana!: string;

  @ApiProperty({ example: 'Jehová' })
  spanish!: string;

  @ApiProperty()
  sameSpelling!: boolean;

  @ApiProperty({ type: [String], description: 'Other spellings seen in the sources' })
  otherSpellings!: string[];

  @ApiProperty({ nullable: true })
  notes!: string | null;
}
