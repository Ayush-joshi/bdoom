import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { getConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { validateRemoteUrl } from '../iptv/iptv-url';

export interface RadioStationEntity {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  tags: string;
  codec: string;
  bitrate: number;
  hls: boolean;
  lastcheckok: boolean;
  geo_lat: number;
  geo_long: number;
  streamUrl: string;
  isHttps: boolean;
}

export interface NearbyStationEntity extends RadioStationEntity {
  distanceKm: number;
}

@Injectable()
export class RadioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadioService.name);
  private readonly resolvedCache = new Map<
    string,
    { resolved: { streamUrl: string; alternatives: string[]; hls: boolean }; timestamp: number }
  >();
  private readonly CACHE_TTL = 3600 * 1000; // 1 hour
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit(): void {
    void this.initializeCache();
  }

  onModuleDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private async initializeCache(): Promise<void> {
    const config = getConfig();
    if (config.nodeEnv === 'test') {
      this.logger.log('Skipping radio stations cache initialization in test environment.');
      return;
    }

    try {
      const countRow = await this.databaseService.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM radio_stations',
      );
      if (!countRow || countRow.count === 0) {
        this.logger.log('Radio stations cache is empty. Performing initial fetch...');
        await this.refreshCache();
      }

      // Refresh the cache every 12 hours
      this.refreshInterval = setInterval(() => {
        void this.refreshCache().catch((err) => {
          this.logger.error('Failed to periodically refresh radio cache', err);
        });
      }, 12 * 60 * 60 * 1000);
    } catch (error) {
      this.logger.error('Failed to initialize radio stations cache', error);
    }
  }

  async refreshCache(): Promise<void> {
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

        this.logger.log(`Caching ${validStations.length} valid stations in SQLite...`);

        await this.databaseService.exec('BEGIN TRANSACTION');
        try {
          await this.databaseService.run('DELETE FROM radio_stations');
          const insertSql = `
            INSERT OR REPLACE INTO radio_stations (
              stationuuid, name, url, url_resolved, homepage, favicon, 
              country, countrycode, state, language, tags, codec, 
              bitrate, hls, lastcheckok, geo_lat, geo_long
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          for (const s of validStations) {
            await this.databaseService.run(insertSql, [
              s.stationuuid,
              s.name.trim(),
              s.url ?? '',
              s.url_resolved ?? '',
              s.homepage ?? '',
              s.favicon ?? '',
              s.country ?? '',
              s.countrycode ?? '',
              s.state ?? '',
              s.language ?? '',
              s.tags ?? '',
              s.codec ?? '',
              Number(s.bitrate) || 0,
              s.hls === 1 ? 1 : 0,
              s.lastcheckok === 1 ? 1 : 0,
              Number(s.geo_lat),
              Number(s.geo_long),
            ]);
          }
          await this.databaseService.exec('COMMIT');
          this.logger.log('Radio stations cache update complete.');
          return;
        } catch (dbError) {
          await this.databaseService.exec('ROLLBACK');
          throw dbError;
        }
      } catch (err) {
        this.logger.warn(
          `Failed fetching from mirror ${server}: ${err instanceof Error ? err.message : String(err)}`,
        );
        lastError = err;
      }
    }
    throw lastError ?? new Error('No Radio Browser mirrors succeeded');
  }

  async getNearbyStations(
    lat: number,
    lng: number,
    radiusKm?: number,
    limit = 20,
  ): Promise<{ stations: NearbyStationEntity[]; usedNearestFallback: boolean }> {
    const stations = await this.databaseService.all<any>('SELECT * FROM radio_stations');
    const mapped: NearbyStationEntity[] = stations.map((s) => {
      const dist = haversineDistanceKm(lat, lng, s.geo_lat, s.geo_long);
      const streamUrl = s.url_resolved?.trim() || s.url?.trim() || '';
      return {
        stationuuid: s.stationuuid,
        name: s.name,
        url: s.url,
        url_resolved: s.url_resolved,
        homepage: s.homepage,
        favicon: s.favicon,
        country: s.country,
        countrycode: s.countrycode,
        state: s.state,
        language: s.language,
        tags: s.tags,
        codec: s.codec,
        bitrate: s.bitrate,
        hls: s.hls === 1,
        lastcheckok: s.lastcheckok === 1,
        geo_lat: s.geo_lat,
        geo_long: s.geo_long,
        streamUrl,
        isHttps: streamUrl.startsWith('https://'),
        distanceKm: dist,
      };
    });

    mapped.sort((a, b) => a.distanceKm - b.distanceKm);

    if (radiusKm === undefined || isNaN(radiusKm)) {
      return {
        stations: mapped.slice(0, limit),
        usedNearestFallback: false,
      };
    }

    const filtered = mapped.filter((s) => s.distanceKm <= radiusKm);
    if (filtered.length > 0) {
      return {
        stations: filtered.slice(0, limit),
        usedNearestFallback: false,
      };
    }

    return {
      stations: mapped.slice(0, limit),
      usedNearestFallback: true,
    };
  }

  async resolveUrl(
    url: string,
  ): Promise<{ streamUrl: string; alternatives: string[]; hls: boolean }> {
    const cached = this.resolvedCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.resolved;
    }

    const resolved = await this.resolveStream(url);
    this.resolvedCache.set(url, { resolved, timestamp: Date.now() });
    return resolved;
  }

  private async resolveStream(
    url: string,
    depth = 0,
  ): Promise<{ streamUrl: string; alternatives: string[]; hls: boolean }> {
    if (depth > 2) {
      throw new Error('Playlist nesting level exceeded.');
    }

    const { response, finalUrl } = await this.safeFetch(url);
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

    const isM3u =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      finalUrl.includes('.m3u8') ||
      finalUrl.includes('.m3u');
    const isPls = contentType.includes('scpls') || finalUrl.includes('.pls');

    if (isM3u) {
      const text = await response.text();
      if (text.includes('#EXT-X-STREAM-INF') || text.includes('#EXT-X-TARGETDURATION')) {
        return { streamUrl: finalUrl, alternatives: [], hls: true };
      }
      const parsedUrls = this.parseM3u(text, finalUrl);
      return this.selectBestUrls(parsedUrls, depth + 1);
    }

    if (isPls) {
      const text = await response.text();
      const parsedUrls = this.parsePls(text, finalUrl);
      return this.selectBestUrls(parsedUrls, depth + 1);
    }

    const isHls =
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      finalUrl.includes('.m3u8');
    return { streamUrl: finalUrl, alternatives: [], hls: isHls };
  }

  private async safeFetch(
    targetUrl: string,
    maxRedirects = 5,
  ): Promise<{ response: Response; finalUrl: string }> {
    let currentUrl = targetUrl;
    for (let i = 0; i < maxRedirects; i++) {
      const validated = await validateRemoteUrl(currentUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      let response: Response;
      try {
        response = await fetch(validated, {
          redirect: 'manual',
          headers: { 'User-Agent': 'Mozilla/5.0 BDoom/1.0' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      controller.abort();

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          break;
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      return { response, finalUrl: currentUrl };
    }

    const validated = await validateRemoteUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    let response: Response;
    try {
      response = await fetch(validated, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 BDoom/1.0' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    controller.abort();
    return { response, finalUrl: currentUrl };
  }

  private parseM3u(content: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      try {
        urls.push(new URL(trimmed, baseUrl).toString());
      } catch {
        // Skip
      }
    }
    return urls;
  }

  private parsePls(content: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^File\d+=(https?:\/\/.*)$/i);
      if (match) {
        try {
          urls.push(new URL(match[1].trim(), baseUrl).toString());
        } catch {
          // Skip
        }
      }
    }
    return urls;
  }

  private async selectBestUrls(
    urls: string[],
    depth: number,
  ): Promise<{ streamUrl: string; alternatives: string[]; hls: boolean }> {
    if (urls.length === 0) {
      throw new Error('No candidate URLs in playlist');
    }

    const httpsUrls = urls.filter((u) => u.startsWith('https://'));
    const httpUrls = urls.filter((u) => u.startsWith('http://'));
    const sortedCandidates = [...httpsUrls, ...httpUrls];

    let firstWorking: { streamUrl: string; alternatives: string[]; hls: boolean } | null = null;
    const workingAlternatives: string[] = [];

    for (const cand of sortedCandidates) {
      try {
        const resolved = await this.resolveStream(cand, depth);
        if (!firstWorking) {
          firstWorking = resolved;
        } else {
          workingAlternatives.push(resolved.streamUrl);
        }
      } catch {
        // Skip failing stream candidate
      }
    }

    if (firstWorking) {
      return {
        streamUrl: firstWorking.streamUrl,
        alternatives: [...workingAlternatives, ...firstWorking.alternatives],
        hls: firstWorking.hls,
      };
    }

    throw new Error('No playable stream found in playlist');
  }
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
