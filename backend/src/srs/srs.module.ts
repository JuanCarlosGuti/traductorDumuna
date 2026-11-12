import { Module } from '@nestjs/common';
import { QueryModule } from '../query/query.module';
import { SrsController } from './srs.controller';
import { SrsService } from './srs.service';

@Module({
  imports: [QueryModule],
  controllers: [SrsController],
  providers: [SrsService],
})
export class SrsModule {}
