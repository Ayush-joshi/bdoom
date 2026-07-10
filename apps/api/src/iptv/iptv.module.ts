import { Module } from '@nestjs/common';
import { IptvController } from './iptv.controller';

@Module({
  controllers: [IptvController],
})
export class IptvModule {}
