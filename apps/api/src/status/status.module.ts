import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatusController } from './status.controller';

@Module({
  imports: [AuthModule],
  controllers: [StatusController],
})
export class StatusModule {}
