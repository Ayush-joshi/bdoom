import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RadioService } from './radio.service';

@Controller('radio')
@UseGuards(SessionGuard)
export class RadioController {
  constructor(private readonly radioService: RadioService) {}

  @Get('nearby')
  async getNearby(
    @Query('lat') latStr: string,
    @Query('lng') lngStr: string,
    @Query('radius') radiusStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
      throw new BadRequestException('Invalid latitude or longitude.');
    }

    const radius = radiusStr ? parseFloat(radiusStr) : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 20;

    return this.radioService.getNearbyStations(lat, lng, radius, limit);
  }

  @Get('resolve')
  async resolve(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('Missing URL to resolve.');
    }
    try {
      return await this.radioService.resolveUrl(url);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not resolve stream URL.',
      );
    }
  }
}
