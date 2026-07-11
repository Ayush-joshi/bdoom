import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { getConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { validateRemoteUrl } from '../iptv/iptv-url';
import { NormalizedStation, RadioSourceAdapter } from './sources/radio-source.interface';
import { RadioBrowserAdapter } from './sources/radio-browser.adapter';
import { AkashvaniAdapter } from './sources/akashvani.adapter';
import { CuratedJsonAdapter } from './sources/curated-json.adapter';
import { IcecastAdapter } from './sources/icecast.adapter';

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
  source: string;
  sourceReferences: any[];
  alternativeUrls: string[];
  recentSuccess: number;
  recentFailures: number;
  streamUrl: string;
  isHttps: boolean;
}

export interface NearbyStationEntity extends RadioStationEntity {
  distanceKm: number;
  score?: number;
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

  private readonly adapters: RadioSourceAdapter[] = [
    new CuratedJsonAdapter(),
    new AkashvaniAdapter(),
    new RadioBrowserAdapter(),
    new IcecastAdapter(),
  ];

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
    this.logger.log('Starting radio stations cache refresh across all adapters...');
    let allFetched: NormalizedStation[] = [];

    for (const adapter of this.adapters) {
      try {
        const stations = await adapter.fetchStations();
        allFetched = allFetched.concat(stations);
      } catch (err) {
        this.logger.error(`Adapter ${adapter.name} failed during cache refresh`, err);
      }
    }

    this.logger.log(`Fetched ${allFetched.length} raw stations. Deduplicating...`);
    const uniqueStations = this.deduplicateAndMerge(allFetched);
    this.logger.log(`Deduplicated to ${uniqueStations.length} unique stations. Caching in SQLite...`);

    await this.databaseService.exec('BEGIN TRANSACTION');
    try {
      await this.databaseService.run('DELETE FROM radio_stations');
      const insertSql = `
        INSERT OR REPLACE INTO radio_stations (
          stationuuid, name, url, url_resolved, homepage, favicon, 
          country, countrycode, state, language, tags, codec, 
          bitrate, hls, lastcheckok, geo_lat, geo_long, source,
          source_references, alternative_urls, recent_success, recent_failures
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      for (const s of uniqueStations) {
        await this.databaseService.run(insertSql, [
          s.stationuuid,
          s.name,
          s.url,
          s.url_resolved,
          s.homepage,
          s.favicon,
          s.country,
          s.countrycode,
          s.state,
          s.language,
          s.tags,
          s.codec,
          s.bitrate,
          s.hls ? 1 : 0,
          s.lastcheckok ? 1 : 0,
          s.geo_lat,
          s.geo_long,
          s.source,
          JSON.stringify(s.source_references),
          JSON.stringify(s.alternative_urls),
          s.recent_success,
          s.recent_failures,
        ]);
      }
      await this.databaseService.exec('COMMIT');
      this.logger.log('Radio stations cache update complete.');
    } catch (dbError) {
      await this.databaseService.exec('ROLLBACK');
      throw dbError;
    }
  }

  private deduplicateAndMerge(stations: NormalizedStation[]): any[] {
    const uniqueMap = new Map<string, any>();

    for (const station of stations) {
      const normUrl = this.normalizeUrl(station.url_resolved || station.url);
      
      let existing = uniqueMap.get(normUrl);

      // 2. Lookup by source-specific ID
      if (!existing) {
        for (const item of uniqueMap.values()) {
          const hasRef = item.source_references.some(
            (ref: any) => ref.source === station.source && ref.id === station.sourceId
          );
          if (hasRef) {
            existing = item;
            break;
          }
        }
      }

      // 3. Lookup by name proximity
      if (!existing) {
        const normName = this.normalizeName(station.name);
        for (const item of uniqueMap.values()) {
          if (
            item.country === station.country &&
            this.normalizeName(item.name) === normName
          ) {
            const dist = haversineDistanceKm(
              item.geo_lat,
              item.geo_long,
              station.geo_lat,
              station.geo_long
            );
            if (dist < 5.0) {
              existing = item;
              break;
            }
          }
        }
      }

      if (existing) {
        // Merge metadata
        // Keep best coordinates (favor non-zero)
        if ((existing.geo_lat === 0 && existing.geo_long === 0) && (station.geo_lat !== 0 || station.geo_long !== 0)) {
          existing.geo_lat = station.geo_lat;
          existing.geo_long = station.geo_long;
        }
        // Favicon: keep best
        if (!existing.favicon && station.favicon) {
          existing.favicon = station.favicon;
        }
        // Retain alternative stream URLs
        if (station.url_resolved && station.url_resolved !== existing.url_resolved) {
          if (!existing.alternative_urls.includes(station.url_resolved)) {
            existing.alternative_urls.push(station.url_resolved);
          }
        }
        if (station.url && station.url !== existing.url) {
          if (!existing.alternative_urls.includes(station.url)) {
            existing.alternative_urls.push(station.url);
          }
        }
        // Preserve source reference
        const hasRef = existing.source_references.some(
          (ref: any) => ref.source === station.source && ref.id === station.sourceId
        );
        if (!hasRef) {
          existing.source_references.push({ source: station.source, id: station.sourceId });
        }
      } else {
        const stationUuid = station.source === 'radio-browser' 
          ? station.sourceId 
          : `gen-${Math.random().toString(36).substring(2, 15)}`;
        
        uniqueMap.set(normUrl, {
          stationuuid: stationUuid,
          name: station.name,
          url: station.url,
          url_resolved: station.url_resolved,
          homepage: station.homepage,
          favicon: station.favicon,
          country: station.country,
          countrycode: station.countrycode,
          state: station.state,
          language: station.language,
          tags: station.tags,
          codec: station.codec,
          bitrate: station.bitrate,
          hls: station.hls,
          lastcheckok: station.lastcheckok,
          geo_lat: station.geo_lat,
          geo_long: station.geo_long,
          source: station.source,
          source_references: [{ source: station.source, id: station.sourceId }],
          alternative_urls: [],
          recent_success: 0,
          recent_failures: 0,
        });
      }
    }

    return Array.from(uniqueMap.values());
  }

  private normalizeUrl(urlStr: string): string {
    try {
      const url = new URL(urlStr.trim().toLowerCase());
      let cleaned = url.host + url.pathname;
      if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
      }
      return cleaned;
    } catch {
      return urlStr.trim().toLowerCase();
    }
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async getNearbyStations(
    lat: number,
    lng: number,
    radiusKm?: number,
    limit = 20,
    nameQuery?: string,
    sourceFilter?: string,
  ): Promise<{ stations: NearbyStationEntity[]; usedNearestFallback: boolean }> {
    let sql = 'SELECT * FROM radio_stations';
    const params: any[] = [];
    const clauses: string[] = [];

    if (nameQuery && nameQuery.trim()) {
      clauses.push('name LIKE ?');
      params.push(`%${nameQuery.trim()}%`);
    }

    if (sourceFilter && sourceFilter.trim()) {
      clauses.push('source = ?');
      params.push(sourceFilter.trim());
    }

    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }

    const stations = await this.databaseService.all<any>(sql, params);
    const mapped: NearbyStationEntity[] = stations.map((s) => {
      const dist = haversineDistanceKm(lat, lng, s.geo_lat, s.geo_long);
      const streamUrl = s.url_resolved?.trim() || s.url?.trim() || '';

      let sourceReferences = [];
      let alternativeUrls = [];
      try {
        sourceReferences = JSON.parse(s.source_references);
      } catch {}
      try {
        alternativeUrls = JSON.parse(s.alternative_urls);
      } catch {}

      // Calculate ranking score
      let score = 0;
      // 1. Distance penalty
      score -= dist * 10;
      // 2. HTTPS bonus
      if (streamUrl.startsWith('https://')) {
        score += 200;
      }
      // 3. Bitrate bonus
      const bitrate = s.bitrate || 0;
      score += (bitrate / 32) * 5;
      // 4. Metadata completeness bonus
      if (s.favicon) score += 20;
      if (s.tags) score += 10;
      if (s.language) score += 10;
      if (s.state) score += 10;
      // 5. Playback reliability bonus
      const success = s.recent_success || 0;
      const failures = s.recent_failures || 0;
      score += (success - failures) * 50;

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
        source: s.source,
        sourceReferences,
        alternativeUrls,
        recentSuccess: s.recent_success,
        recentFailures: s.recent_failures,
        streamUrl,
        isHttps: streamUrl.startsWith('https://'),
        distanceKm: dist,
        score,
      };
    });

    mapped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    let candidates = mapped;
    let usedNearestFallback = false;

    if (radiusKm !== undefined && !isNaN(radiusKm)) {
      const filtered = mapped.filter((s) => s.distanceKm <= radiusKm);
      if (filtered.length > 0) {
        candidates = filtered;
      } else {
        usedNearestFallback = true;
      }
    }

    // Pick top candidates avoiding single source dominance
    const finalPicked: NearbyStationEntity[] = [];
    const sourceCounts: Record<string, number> = {};

    for (const station of candidates) {
      if (finalPicked.length >= limit) {
        break;
      }
      const source = station.source;
      const count = sourceCounts[source] || 0;

      const hasOtherSourcesLeft = candidates.some(
        (s) => !finalPicked.includes(s) && s.source !== source,
      );
      // Cap a single source at 50% of the limit if other sources are available
      if (count >= limit / 2 && hasOtherSourcesLeft) {
        continue;
      }

      finalPicked.push(station);
      sourceCounts[source] = count + 1;
    }

    return {
      stations: finalPicked,
      usedNearestFallback,
    };
  }

  async reportPlaybackStatus(stationuuid: string, success: boolean): Promise<void> {
    if (success) {
      await this.databaseService.run(
        'UPDATE radio_stations SET recent_success = recent_success + 1 WHERE stationuuid = ?',
        [stationuuid],
      );
    } else {
      await this.databaseService.run(
        'UPDATE radio_stations SET recent_failures = recent_failures + 1 WHERE stationuuid = ?',
        [stationuuid],
      );
    }
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
