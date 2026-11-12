import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CorpusDomain, CorpusSource } from '../../query/query.enums';

export enum TranslationDirection {
  damana_a_espanol = 'damana_a_espanol',
  espanol_a_damana = 'espanol_a_damana',
}

export class TranslateDto {
  @ApiProperty({ description: 'Texto a traducir', example: 'mi mamá cocina en la casa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiProperty({ enum: TranslationDirection })
  @IsEnum(TranslationDirection)
  direction!: TranslationDirection;
}

export class GlossPairDto {
  @ApiProperty({ description: 'Palabra o grupo de palabras del texto original' })
  origin!: string;

  @ApiProperty({ description: 'Segmento de la traducción que le corresponde' })
  target!: string;
}

export class SenseDto {
  @ApiProperty({ description: 'Palabra del texto de entrada que motivó la búsqueda' })
  word!: string;

  @ApiProperty()
  spanish!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({
    enum: ['exacta', 'sin_tildes', 'sinonimo', 'singular', 'frase', 'posible'],
    description:
      'Cómo se encontró: exacta, sin tildes, por sinónimo coloquial del español (mamá → madre), por singular, por frase completa o por prefijo (posible)',
  })
  match!: 'exacta' | 'sin_tildes' | 'sinonimo' | 'singular' | 'frase' | 'posible';
}

export class UsedProperNameDto {
  @ApiProperty({ description: 'Cómo venía escrito en el texto' })
  inText!: string;

  @ApiProperty()
  spanish!: string;

  @ApiProperty({ description: 'Grafía que se usa en damana' })
  damana!: string;
}

export class UsedRuleDto {
  @ApiProperty({ example: '-ndzina' })
  form!: string;

  @ApiProperty({ nullable: true, example: 'pluraliza sustantivos' })
  meaning!: string | null;

  @ApiProperty({ nullable: true, example: 'terrua (hombre) → terruandzina = hombres' })
  example!: string | null;

  @ApiProperty({ nullable: true, description: 'plural, posesivo, negacion, pregunta, pasado, futuro o null (general)' })
  trigger!: string | null;
}

export class ExampleFragmentDto {
  @ApiProperty({ enum: CorpusSource })
  source!: CorpusSource;

  @ApiProperty({ enum: CorpusDomain, description: 'biblico, cotidiano o gramatica' })
  domain!: CorpusDomain;

  @ApiProperty({ example: 'frase 12 (Preguntas para conversar)' })
  reference!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty()
  spanish!: string;

  @ApiProperty({ description: 'Similitud coseno TF-IDF con el texto de entrada' })
  score!: number;
}

export class SupportDto {
  @ApiProperty({
    enum: ['bueno', 'parcial', 'revisar'],
    description:
      'Cuánto respalda el corpus a esta traducción. Se deriva de la media de los puntajes del retrieval y de cuántos ejemplos muestran la lengua en uso; no se almacena, se recalcula.',
  })
  level!: 'bueno' | 'parcial' | 'revisar';

  @ApiProperty({
    type: [String],
    description: 'Motivos cuando el nivel es «revisar»: sin_ejemplos, similitud_baja, apoyo_solo_de_diccionario',
  })
  reasons!: string[];
}

export class TranslationResponseDto {
  @ApiProperty({ description: 'Las palabras sin equivalente van entre corchetes: [vecina]' })
  translation!: string;

  @ApiProperty({ type: [GlossPairDto], description: 'Glosa palabra por palabra' })
  gloss!: GlossPairDto[];

  @ApiProperty({ type: [String], description: 'Palabras que el modelo no pudo traducir con el corpus; se registran en pendientes' })
  wordsWithoutEquivalent!: string[];

  @ApiProperty({ type: [String], description: 'Reglas gramaticales que el modelo dice haber aplicado' })
  appliedRules!: string[];

  @ApiProperty({ minimum: 0, maximum: 1, description: 'Confianza declarada por el modelo' })
  confidence!: number;

  @ApiProperty()
  briefExplanation!: string;

  @ApiProperty({ type: SupportDto })
  support!: SupportDto;

  @ApiProperty({ type: [ExampleFragmentDto], description: 'Ejemplos usados en el prompt, agrupables por dominio' })
  examples!: ExampleFragmentDto[];

  @ApiProperty({ type: [SenseDto], description: 'Acepciones del diccionario para las palabras de la frase' })
  dictionary!: SenseDto[];

  @ApiProperty({ type: [UsedProperNameDto] })
  properNames!: UsedProperNameDto[];

  @ApiProperty({ type: [UsedRuleDto], description: 'Reglas que viajaron en el prompt' })
  rules!: UsedRuleDto[];

  @ApiProperty({ type: [String], description: 'Rasgos detectados en la frase: plural, posesivo, negacion, pregunta, pasado, futuro' })
  triggers!: string[];
}

export class TranslatorStatusDto {
  @ApiProperty({ description: 'false si no hay ningún motor de traducción configurado' })
  available!: boolean;

  @ApiProperty({
    enum: ['anthropic', 'compatible'],
    nullable: true,
    description: 'anthropic = Claude vía ANTHROPIC_API_KEY; compatible = API estilo OpenAI vía TRADUCTOR_BASE_URL (Ollama, Gemini, Groq...)',
  })
  provider!: 'anthropic' | 'compatible' | null;

  @ApiProperty({ nullable: true, description: 'Modelo en uso' })
  model!: string | null;
}

export class ValidateTranslationDto {
  @ApiProperty({ description: 'Texto original que se tradujo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiProperty({ enum: TranslationDirection })
  @IsEnum(TranslationDirection)
  direction!: TranslationDirection;

  @ApiProperty({ description: 'La traducción correcta (la del modelo si se confirma, la escrita a mano si se corrige)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  translation!: string;

  @ApiProperty({ enum: ['confirmada', 'corregida'] })
  @IsIn(['confirmada', 'corregida'])
  origin!: 'confirmada' | 'corregida';

  @ApiPropertyOptional({ description: 'Lo que había propuesto el modelo (solo informativo)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  modelTranslation?: string;
}

export class SavedValidationDto {
  @ApiProperty()
  saved!: boolean;

  @ApiProperty({ description: 'Total de pares validados acumulados' })
  total!: number;
}
