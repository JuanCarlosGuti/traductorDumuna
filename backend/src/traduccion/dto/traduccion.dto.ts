import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DominioCorpus, FuenteCorpus } from '../../consulta/consulta.enums';

export enum DireccionTraduccion {
  damana_a_espanol = 'damana_a_espanol',
  espanol_a_damana = 'espanol_a_damana',
}

export class TraducirDto {
  @ApiProperty({ description: 'Texto a traducir', example: 'mi mamá cocina en la casa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  texto!: string;

  @ApiProperty({ enum: DireccionTraduccion })
  @IsEnum(DireccionTraduccion)
  direccion!: DireccionTraduccion;
}

export class ParGlosaDto {
  @ApiProperty({ description: 'Palabra o grupo de palabras del texto original' })
  origen!: string;

  @ApiProperty({ description: 'Segmento de la traducción que le corresponde' })
  destino!: string;
}

export class AcepcionDto {
  @ApiProperty({ description: 'Palabra del texto de entrada que motivó la búsqueda' })
  palabra!: string;

  @ApiProperty()
  espanol!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ nullable: true })
  categoria!: string | null;

  @ApiProperty({
    enum: ['exacta', 'sin_tildes', 'sinonimo', 'singular', 'frase', 'posible'],
    description:
      'Cómo se encontró: exacta, sin tildes, por sinónimo coloquial del español (mamá → madre), por singular, por frase completa o por prefijo (posible)',
  })
  coincidencia!: 'exacta' | 'sin_tildes' | 'sinonimo' | 'singular' | 'frase' | 'posible';
}

export class NombrePropioUsadoDto {
  @ApiProperty({ description: 'Cómo venía escrito en el texto' })
  enTexto!: string;

  @ApiProperty()
  espanol!: string;

  @ApiProperty({ description: 'Grafía que se usa en damana' })
  damana!: string;
}

export class ReglaUsadaDto {
  @ApiProperty({ example: '-ndzina' })
  forma!: string;

  @ApiProperty({ nullable: true, example: 'pluraliza sustantivos' })
  significado!: string | null;

  @ApiProperty({ nullable: true, example: 'terrua (hombre) → terruandzina = hombres' })
  ejemplo!: string | null;

  @ApiProperty({ nullable: true, description: 'plural, posesivo, negacion, pregunta, pasado, futuro o null (general)' })
  disparador!: string | null;
}

export class FragmentoEjemploDto {
  @ApiProperty({ enum: FuenteCorpus })
  fuente!: FuenteCorpus;

  @ApiProperty({ enum: DominioCorpus, description: 'biblico, cotidiano o gramatica' })
  dominio!: DominioCorpus;

  @ApiProperty({ example: 'frase 12 (Preguntas para conversar)' })
  referencia!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty()
  espanol!: string;

  @ApiProperty({ description: 'Similitud coseno TF-IDF con el texto de entrada' })
  puntaje!: number;
}

export class ApoyoDto {
  @ApiProperty({
    enum: ['bueno', 'parcial', 'revisar'],
    description:
      'Cuánto respalda el corpus a esta traducción. Se deriva de la media de los puntajes del retrieval y de cuántos ejemplos muestran la lengua en uso; no se almacena, se recalcula.',
  })
  nivel!: 'bueno' | 'parcial' | 'revisar';

  @ApiProperty({
    type: [String],
    description: 'Motivos cuando el nivel es «revisar»: sin_ejemplos, similitud_baja, apoyo_solo_de_diccionario',
  })
  motivos!: string[];
}

export class RespuestaTraduccionDto {
  @ApiProperty({ description: 'Las palabras sin equivalente van entre corchetes: [vecina]' })
  traduccion!: string;

  @ApiProperty({ type: [ParGlosaDto], description: 'Glosa palabra por palabra' })
  glosa!: ParGlosaDto[];

  @ApiProperty({ type: [String], description: 'Palabras que el modelo no pudo traducir con el corpus; se registran en pendientes' })
  palabrasSinEquivalente!: string[];

  @ApiProperty({ type: [String], description: 'Reglas gramaticales que el modelo dice haber aplicado' })
  reglasAplicadas!: string[];

  @ApiProperty({ minimum: 0, maximum: 1, description: 'Confianza declarada por el modelo' })
  confianza!: number;

  @ApiProperty()
  explicacionBreve!: string;

  @ApiProperty({ type: ApoyoDto })
  apoyo!: ApoyoDto;

  @ApiProperty({ type: [FragmentoEjemploDto], description: 'Ejemplos usados en el prompt, agrupables por dominio' })
  ejemplos!: FragmentoEjemploDto[];

  @ApiProperty({ type: [AcepcionDto], description: 'Acepciones del diccionario para las palabras de la frase' })
  diccionario!: AcepcionDto[];

  @ApiProperty({ type: [NombrePropioUsadoDto] })
  nombresPropios!: NombrePropioUsadoDto[];

  @ApiProperty({ type: [ReglaUsadaDto], description: 'Reglas que viajaron en el prompt' })
  reglas!: ReglaUsadaDto[];

  @ApiProperty({ type: [String], description: 'Rasgos detectados en la frase: plural, posesivo, negacion, pregunta, pasado, futuro' })
  disparadores!: string[];
}

export class EstadoTraductorDto {
  @ApiProperty({ description: 'false si no hay ningún motor de traducción configurado' })
  disponible!: boolean;

  @ApiProperty({
    enum: ['anthropic', 'compatible'],
    nullable: true,
    description: 'anthropic = Claude vía ANTHROPIC_API_KEY; compatible = API estilo OpenAI vía TRADUCTOR_BASE_URL (Ollama, Gemini, Groq...)',
  })
  proveedor!: 'anthropic' | 'compatible' | null;

  @ApiProperty({ nullable: true, description: 'Modelo en uso' })
  modelo!: string | null;
}

export class ValidarTraduccionDto {
  @ApiProperty({ description: 'Texto original que se tradujo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  texto!: string;

  @ApiProperty({ enum: DireccionTraduccion })
  @IsEnum(DireccionTraduccion)
  direccion!: DireccionTraduccion;

  @ApiProperty({ description: 'La traducción correcta (la del modelo si se confirma, la escrita a mano si se corrige)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  traduccion!: string;

  @ApiProperty({ enum: ['confirmada', 'corregida'] })
  @IsIn(['confirmada', 'corregida'])
  origen!: 'confirmada' | 'corregida';

  @ApiPropertyOptional({ description: 'Lo que había propuesto el modelo (solo informativo)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  traduccionModelo?: string;
}

export class ValidacionGuardadaDto {
  @ApiProperty()
  guardada!: boolean;

  @ApiProperty({ description: 'Total de pares validados acumulados' })
  total!: number;
}
