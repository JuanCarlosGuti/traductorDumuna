import { ApiProperty } from '@nestjs/swagger';

export class PendingItemDto {
  @ApiProperty({ description: 'rowid en la tabla pendientes (el id exportado es pend_<rowid>)' })
  id!: number;

  @ApiProperty({ example: 'vecina' })
  word!: string;

  @ApiProperty({ enum: ['espanol', 'damana'], description: 'Idioma de la palabra que falta' })
  language!: 'espanol' | 'damana';

  @ApiProperty({ nullable: true, description: 'Frase original del usuario donde apareció' })
  context!: string | null;

  @ApiProperty({ description: 'Veces que el traductor la devolvió sin equivalente' })
  timesRequested!: number;

  @ApiProperty({ enum: ['pendiente', 'exportada', 'resuelta'] })
  status!: 'pendiente' | 'exportada' | 'resuelta';

  @ApiProperty({ enum: ['traductor', 'elicitacion'] })
  origin!: 'traductor' | 'elicitacion';

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
