import { Logger } from '@nestjs/common';
import { NormalizedStation, RadioSourceAdapter } from './radio-source.interface';

export class RadioBrowserAdapter implements RadioSourceAdapter {
  readonly name = 'radio-browser';
  private readonly logger = new Logger(RadioBrowserAdapter.name);

  async fetchStations(): Promise<NormalizedStation[]> {
    const servers = [
      'https://de1.api.radio-browser.info',
      'https://nl1.api.radio-browser.info',
    ];
    let lastError: unknown;

    for (const server of servers) {
      try {
        this.logger.log(`Fetching radio stations from ${server}...`);
        const url = `${server}/json/stations/search?has_geo_info=true&hidebroken=true&limit=25000`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 BDoom/1.0' },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = (await response.json()) as any[];
        const validStations = data.filter(
          (s) =>
            s.stationuuid &&
            s.name?.trim() &&
            Number.isFinite(s.geo_lat) &&
            Number.isFinite(s.geo_long),
        );

        this.logger.log(`Fetched ${validStations.length} stations from ${server}`);

        return validStations.map((s) => ({
          source: this.name,
          sourceId: s.stationuuid,
          name: s.name.trim(),
          url: s.url ?? '',
          url_resolved: s.url_resolved ?? '',
          homepage: s.homepage ?? '',
          favicon: s.favicon ?? '',
          country: s.country ?? '',
          countrycode: s.countrycode ?? '',
          state: s.state ?? '',
          language: s.language ?? '',
          tags: s.tags ?? '',
          codec: s.codec ?? '',
          bitrate: Number(s.bitrate) || 0,
          hls: s.hls === 1,
          lastcheckok: s.lastcheckok === 1,
          geo_lat: Number(s.geo_lat),
          geo_long: Number(s.geo_long),
        }));
      } catch (err) {
        this.logger.warn(
          `Failed fetching from mirror ${server}: ${err instanceof Error ? err.message : String(err)}`,
        );
        lastError = err;
      }
    }
    this.logger.error('No Radio Browser mirrors succeeded');
    return [];
  }
}
