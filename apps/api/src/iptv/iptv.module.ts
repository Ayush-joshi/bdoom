import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IptvController } from './iptv.controller';

@Module({
  imports: [AuthModule],
  controllers: [IptvController],
})
export class IptvModule {}
