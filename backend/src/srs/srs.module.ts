import { Module } from '@nestjs/common';
import { ConsultaModule } from '../consulta/consulta.module';
import { SrsController } from './srs.controller';
import { SrsService } from './srs.service';

@Module({
  imports: [ConsultaModule],
  controllers: [SrsController],
  providers: [SrsService],
})
export class SrsModule {}
