import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RadioController } from './radio.controller';
import { RadioService } from './radio.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RadioController],
  providers: [RadioService],
  exports: [RadioService],
})
export class RadioModule {}
