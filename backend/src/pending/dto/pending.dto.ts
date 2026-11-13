import { ApiProperty } from '@nestjs/swagger';

export class PendingItemDto {
  @ApiProperty({ description: 'rowid in the pending_items table (the exported id is pend_<rowid>)' })
  id!: number;

  @ApiProperty({ example: 'vecina' })
  word!: string;

  @ApiProperty({ enum: ['spanish', 'damana'], description: 'Language of the missing word' })
  language!: 'spanish' | 'damana';

  @ApiProperty({ nullable: true, description: 'Original user sentence where it appeared' })
  context!: string | null;

  @ApiProperty({ description: 'Times the translator returned it without an equivalent' })
  timesRequested!: number;

  @ApiProperty({ enum: ['pending', 'exported', 'resolved'] })
  status!: 'pending' | 'exported' | 'resolved';

  @ApiProperty({ enum: ['translator', 'elicitation'] })
  origin!: 'translator' | 'elicitation';

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
