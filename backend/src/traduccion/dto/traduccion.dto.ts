import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { FuenteCorpus } from '../../consulta/consulta.enums';

export enum DireccionTraduccion {
  damana_a_espanol = 'damana_a_espanol',
  espanol_a_damana = 'espanol_a_damana',
}

export class TraducirDto {
  @ApiProperty({ description: 'Texto a traducir', example: 'nʉnka gontka' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  texto!: string;

  @ApiProperty({ enum: DireccionTraduccion })
  @IsEnum(DireccionTraduccion)
  direccion!: DireccionTraduccion;
}

export class FragmentoEjemploDto {
  @ApiProperty({ enum: FuenteCorpus })
  fuente!: FuenteCorpus;

  @ApiProperty({ example: 'capítulo 3 · fragmento 2' })
  referencia!: string;

  @ApiProperty()
  damana!: string;

  @ApiProperty({ description: 'En capítulos el paralelo es aproximado (partición proporcional)' })
  espanol!: string;

  @ApiProperty({ description: 'Similitud coseno TF-IDF con el texto de entrada' })
  puntaje!: number;
}

export class EntradaVocabularioUsadaDto {
  @ApiProperty()
  espanol!: string;

  @ApiProperty()
  damana!: string;
}

export class RespuestaTraduccionDto {
  @ApiProperty()
  traduccion!: string;

  @ApiProperty({ type: [String], description: 'Palabras sobre cuya traducción el modelo tiene dudas' })
  palabrasDudosas!: string[];

  @ApiProperty()
  explicacionBreve!: string;

  @ApiProperty({ type: [FragmentoEjemploDto], description: 'Fragmentos del corpus usados como ejemplos en el prompt' })
  ejemplos!: FragmentoEjemploDto[];

  @ApiProperty({ type: [EntradaVocabularioUsadaDto], description: 'Entradas de vocabulario incluidas en el prompt' })
  vocabularioUsado!: EntradaVocabularioUsadaDto[];
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
