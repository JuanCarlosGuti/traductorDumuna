import { ApiProperty } from '@nestjs/swagger';

export class PendienteDto {
  @ApiProperty({ description: 'rowid en la tabla pendientes (el id exportado es pend_<rowid>)' })
  id!: number;

  @ApiProperty({ example: 'vecina' })
  palabra!: string;

  @ApiProperty({ enum: ['espanol', 'damana'], description: 'Idioma de la palabra que falta' })
  idioma!: 'espanol' | 'damana';

  @ApiProperty({ nullable: true, description: 'Frase original del usuario donde apareció' })
  contexto!: string | null;

  @ApiProperty({ description: 'Veces que el traductor la devolvió sin equivalente' })
  vecesPedida!: number;

  @ApiProperty({ enum: ['pendiente', 'exportada', 'resuelta'] })
  estado!: 'pendiente' | 'exportada' | 'resuelta';

  @ApiProperty({ enum: ['traductor', 'elicitacion'] })
  origen!: 'traductor' | 'elicitacion';

  @ApiProperty()
  creadoEn!: string;

  @ApiProperty()
  actualizadoEn!: string;
}
