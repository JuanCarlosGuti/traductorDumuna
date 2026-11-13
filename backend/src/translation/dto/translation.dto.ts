import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CorpusDomain, CorpusSource } from '../../query/query.enums';

export enum TranslationDirection {
  damana_to_spanish = 'damana_to_spanish',
  spanish_to_damana = 'spanish_to_damana',
}

export class TranslateDto {
  @ApiProperty({ description: 'Text to translate', example: 'mi mamá cocina en la casa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiProperty({ enum: TranslationDirection })
  @IsEnum(TranslationDirection)
  direction!: TranslationDirection;
}

export class GlossPairDto {
  @ApiProperty({ description: 'Word or group of words from the original text' })
  origin!: string;

  @ApiProperty({ description: 'Segment of the translation that corresponds to it' })
  target!: string;
}

export class SenseDto {
  @ApiProperty({ description: 'Word of the input text that triggered the lookup' })
  word!: string;

  @ApiProperty()
  spanish!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({
    enum: ['exact', 'no_accents', 'synonym', 'singular', 'phrase', 'possible'],
    description:
      'How it was found: exact, without accents, by a colloquial Spanish synonym (mamá → madre), by singular, by a whole phrase or by prefix (possible)',
  })
  match!: 'exact' | 'no_accents' | 'synonym' | 'singular' | 'phrase' | 'possible';
}

export class UsedProperNameDto {
  @ApiProperty({ description: 'How it was written in the text' })
  inText!: string;

  @ApiProperty()
  spanish!: string;

  @ApiProperty({ description: 'Spelling used in Damana' })
  damana!: string;
}

export class UsedRuleDto {
  @ApiProperty({ example: '-ndzina' })
  form!: string;

  @ApiProperty({ nullable: true, example: 'pluraliza sustantivos' })
  meaning!: string | null;

  @ApiProperty({ nullable: true, example: 'terrua (hombre) → terruandzina = hombres' })
  example!: string | null;

  @ApiProperty({ nullable: true, description: 'plural, possessive, negation, question, past, future or null (general)' })
  trigger!: string | null;
}

export class ExampleFragmentDto {
  @ApiProperty({ enum: CorpusSource })
  source!: CorpusSource;

  @ApiProperty({ enum: CorpusDomain, description: 'biblical, everyday or grammar' })
  domain!: CorpusDomain;

  @ApiProperty({ example: 'frase 12 (Preguntas para conversar)' })
  reference!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty()
  spanish!: string;

  @ApiProperty({ description: 'TF-IDF cosine similarity with the input text' })
  score!: number;
}

export class SupportDto {
  @ApiProperty({
    enum: ['good', 'partial', 'review'],
    description:
      'How much the corpus supports this translation. It is derived from the mean of the retrieval scores and from how many examples show the language in use; it is not stored, it is recalculated.',
  })
  level!: 'good' | 'partial' | 'review';

  @ApiProperty({
    type: [String],
    description: 'Reasons when the level is «review»: no_examples, low_similarity, dictionary_only_support',
  })
  reasons!: string[];
}

export class TranslationResponseDto {
  @ApiProperty({ description: 'Words without an equivalent go in square brackets: [vecina]' })
  translation!: string;

  @ApiProperty({ type: [GlossPairDto], description: 'Word-by-word gloss' })
  gloss!: GlossPairDto[];

  @ApiProperty({ type: [String], description: 'Words the model could not translate with the corpus; they are recorded as pending items' })
  wordsWithoutEquivalent!: string[];

  @ApiProperty({ type: [String], description: 'Grammar rules the model says it applied' })
  appliedRules!: string[];

  @ApiProperty({ minimum: 0, maximum: 1, description: 'Confidence declared by the model' })
  confidence!: number;

  @ApiProperty()
  briefExplanation!: string;

  @ApiProperty({ type: SupportDto })
  support!: SupportDto;

  @ApiProperty({ type: [ExampleFragmentDto], description: 'Examples used in the prompt, groupable by domain' })
  examples!: ExampleFragmentDto[];

  @ApiProperty({ type: [SenseDto], description: 'Dictionary senses for the words of the sentence' })
  dictionary!: SenseDto[];

  @ApiProperty({ type: [UsedProperNameDto] })
  properNames!: UsedProperNameDto[];

  @ApiProperty({ type: [UsedRuleDto], description: 'Rules that went into the prompt' })
  rules!: UsedRuleDto[];

  @ApiProperty({ type: [String], description: 'Features detected in the sentence: plural, possessive, negation, question, past, future' })
  triggers!: string[];
}

export class TranslatorStatusDto {
  @ApiProperty({ description: 'false if no translation engine is configured' })
  available!: boolean;

  @ApiProperty({
    enum: ['anthropic', 'compatible'],
    nullable: true,
    description: 'anthropic = Claude via ANTHROPIC_API_KEY; compatible = OpenAI-style API via TRANSLATOR_BASE_URL (Ollama, Gemini, Groq...)',
  })
  provider!: 'anthropic' | 'compatible' | null;

  @ApiProperty({ nullable: true, description: 'Model in use' })
  model!: string | null;
}

export class ValidateTranslationDto {
  @ApiProperty({ description: 'Original text that was translated' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiProperty({ enum: TranslationDirection })
  @IsEnum(TranslationDirection)
  direction!: TranslationDirection;

  @ApiProperty({ description: 'The correct translation (the model one if confirmed, the hand-written one if corrected)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  translation!: string;

  @ApiProperty({ enum: ['confirmed', 'corrected'] })
  @IsIn(['confirmed', 'corrected'])
  origin!: 'confirmed' | 'corrected';

  @ApiPropertyOptional({ description: 'What the model had proposed (informational only)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  modelTranslation?: string;
}

export class SavedValidationDto {
  @ApiProperty()
  saved!: boolean;

  @ApiProperty({ description: 'Total accumulated validated pairs' })
  total!: number;
}
