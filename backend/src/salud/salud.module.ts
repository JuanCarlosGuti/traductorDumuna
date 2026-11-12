import { Module } from '@nestjs/common';
import { HealthController } from './salud.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
