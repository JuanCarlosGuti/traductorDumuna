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
    summary: 'Palabras sin equivalente, las más pedidas primero',
    description:
      'Cada palabra que el traductor devolvió en palabras_sin_equivalente, más las filas de elicitación que volvieron sin llenar. Sobrevive a las reimportaciones.',
  })
  @ApiOkResponse({ type: [PendingItemDto] })
  listAll(): PendingItemDto[] {
    return this.pendingItems.listAll();
  }

  @Post('export')
  @ApiOperation({
    summary: 'Exportar lote para las hablantes nativas',
    description:
      'Genera formato_elicitacion_pendientes_<fecha>.xlsx con las columnas del formato de elicitación (palabra_es y ejemplo_es llenas, el resto vacío en amarillo) y marca las pendientes como exportadas. Al volver lleno, se deja en /datos y npm run importar lo absorbe.',
  })
  @ApiProduces(XLSX_TYPE)
  async exportBatchFile(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const batch = await this.pendingItems.exportBatch();
    res.set({
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="${batch.fileName}"`,
      'X-Filas-Exportadas': String(batch.rows),
    });
    return new StreamableFile(batch.content);
  }
}
