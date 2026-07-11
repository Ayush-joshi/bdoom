import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { NormalizedStation, RadioSourceAdapter } from './radio-source.interface';

export class CuratedJsonAdapter implements RadioSourceAdapter {
  readonly name = 'curated';
  private readonly logger = new Logger(CuratedJsonAdapter.name);

  async fetchStations(): Promise<NormalizedStation[]> {
    try {
      this.logger.log('Loading curated stations from JSON...');
      const filePath = path.join(__dirname, '../data/curated-stations.json');
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`Curated stations file not found at ${filePath}`);
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content) as any[];

      const stations: NormalizedStation[] = data.map((s, idx) => ({
        source: this.name,
        sourceId: `curated-${idx}`,
        name: s.name,
        url: s.url,
        url_resolved: s.url_resolved ?? s.url,
        homepage: s.homepage ?? '',
        favicon: s.favicon ?? '',
        country: s.country ?? '',
        countrycode: s.countrycode ?? '',
        state: s.state ?? '',
        language: s.language ?? '',
        tags: s.tags ?? '',
        codec: s.codec ?? '',
        bitrate: Number(s.bitrate) || 0,
        hls: !!s.hls,
        lastcheckok: s.lastcheckok !== false,
        geo_lat: Number(s.geo_lat),
        geo_long: Number(s.geo_long),
      }));

      this.logger.log(`Loaded ${stations.length} curated stations.`);
      return stations;
    } catch (error) {
      this.logger.error('Failed to load curated stations', error);
      return [];
    }
  }
}
