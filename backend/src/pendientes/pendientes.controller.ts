import { Controller, Get, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PendienteDto } from './dto/pendientes.dto';
import { PendientesService } from './pendientes.service';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('pendientes')
@Controller('pendientes')
export class PendientesController {
  constructor(private readonly pendientes: PendientesService) {}

  @Get()
  @ApiOperation({
    summary: 'Palabras sin equivalente, las más pedidas primero',
    description:
      'Cada palabra que el traductor devolvió en palabras_sin_equivalente, más las filas de elicitación que volvieron sin llenar. Sobrevive a las reimportaciones.',
  })
  @ApiOkResponse({ type: [PendienteDto] })
  listar(): PendienteDto[] {
    return this.pendientes.listar();
  }

  @Post('exportar')
  @ApiOperation({
    summary: 'Exportar lote para las hablantes nativas',
    description:
      'Genera formato_elicitacion_pendientes_<fecha>.xlsx con las columnas del formato de elicitación (palabra_es y ejemplo_es llenas, el resto vacío en amarillo) y marca las pendientes como exportadas. Al volver lleno, se deja en /datos y npm run importar lo absorbe.',
  })
  @ApiProduces(TIPO_XLSX)
  async exportar(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const lote = await this.pendientes.exportarLote();
    res.set({
      'Content-Type': TIPO_XLSX,
      'Content-Disposition': `attachment; filename="${lote.nombreArchivo}"`,
      'X-Filas-Exportadas': String(lote.filas),
    });
    return new StreamableFile(lote.contenido);
  }
}
