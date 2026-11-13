import { Controller, Get, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PendingItemDto } from './dto/pending.dto';
import { PendingService } from './pending.service';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('pending')
@Controller('pending')
export class PendingController {
  constructor(private readonly pendingItems: PendingService) {}

  @Get()
  @ApiOperation({
    summary: 'Words without an equivalent, most requested first',
    description:
      'Every word the translator returned in words_without_equivalent, plus the elicitation rows that came back unfilled. It survives re-imports.',
  })
  @ApiOkResponse({ type: [PendingItemDto] })
  listAll(): PendingItemDto[] {
    return this.pendingItems.listAll();
  }

  @Post('export')
  @ApiOperation({
    summary: 'Export a batch for the native speakers',
    description:
      'Generates formato_elicitacion_pendientes_<date>.xlsx with the elicitation format columns (palabra_es and ejemplo_es filled in, the rest empty in yellow) and marks the pending items as exported. When it comes back filled in, it is dropped into /data and npm run import:corpus absorbs it.',
  })
  @ApiProduces(XLSX_TYPE)
  async exportBatchFile(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const batch = await this.pendingItems.exportBatch();
    res.set({
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="${batch.fileName}"`,
      'X-Exported-Rows': String(batch.rows),
    });
    return new StreamableFile(batch.content);
  }
}
