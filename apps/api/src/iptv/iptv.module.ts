import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IptvController } from './iptv.controller';
import { IptvTranscodeService } from './iptv-transcode.service';

@Module({
  imports: [AuthModule],
  controllers: [IptvController],
  providers: [IptvTranscodeService],
})
export class IptvModule {}
