import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface IptvChannel {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  country: string;
}

interface IptvApiChannel {
  id: string;
  name: string;
  country: string;
  categories: string[];
}

interface IptvApiCategory {
  id: string;
  name: string;
}

interface IptvApiCountry {
  code: string;
  name: string;
}

export interface IptvCatalog {
  channels: IptvChannel[];
  groups: string[];
  countries: string[];
}

const playlistUrl = 'https://iptv-org.github.io/iptv/index.m3u';
const channelsUrl = 'https://iptv-org.github.io/api/channels.json';
const categoriesUrl = 'https://iptv-org.github.io/api/categories.json';
const countriesUrl = 'https://iptv-org.github.io/api/countries.json';

@Injectable({ providedIn: 'root' })
export class IptvService {
  private catalog: Promise<IptvCatalog> | undefined;

  constructor(private readonly http: HttpClient) {}

  loadCatalog(): Promise<IptvCatalog> {
    this.catalog ??= Promise.all([
      firstValueFrom(this.http.get(playlistUrl, { responseType: 'text' })),
      firstValueFrom(this.http.get<IptvApiChannel[]>(channelsUrl)),
      firstValueFrom(this.http.get<IptvApiCategory[]>(categoriesUrl)),
      firstValueFrom(this.http.get<IptvApiCountry[]>(countriesUrl)),
    ]).then(([playlist, apiChannels, apiCategories, apiCountries]) =>
      parsePlaylist(playlist, apiChannels, apiCategories, apiCountries),
    );
    return this.catalog;
  }

  startTranscode(url: string): Promise<{ id: string; playlistUrl: string }> {
    return firstValueFrom(
      this.http.post<{ id: string; playlistUrl: string }>('/api/iptv/transcode', { url }),
    );
  }

  stopTranscode(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/iptv/transcode/${encodeURIComponent(id)}`));
  }
}

function parsePlaylist(
  source: string,
  apiChannels: IptvApiChannel[],
  apiCategories: IptvApiCategory[],
  apiCountries: IptvApiCountry[],
): IptvCatalog {
  const channels: IptvChannel[] = [];
  const channelMap = new Map(apiChannels.map((channel) => [channel.id, channel]));
  const categoryMap = new Map(
    apiCategories.map((category) => [category.id, category.name]),
  );
  const countryMap = new Map(
    apiCountries.map((country) => [country.code, country.name]),
  );
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const info = lines[index];
    if (!info.startsWith('#EXTINF')) {
      continue;
    }

    const url = lines[index + 1] ?? '';
    if (!url || url.startsWith('#')) {
      continue;
    }

    const attrs = parseAttributes(info);
    const meta = channelMap.get(attrs['tvg-id']);
    const fallbackName = info.slice(info.lastIndexOf(',') + 1).trim();
    const name =
      meta?.name || attrs['tvg-name'] || fallbackName || 'Untitled channel';
    const group = formatCategory(meta?.categories[0], categoryMap, attrs['group-title']);
    const country = meta?.country ? countryMap.get(meta.country) || meta.country : 'Global';

    channels.push({
      id: attrs['tvg-id'] || `${name}-${channels.length}`,
      name,
      url,
      logo: attrs['tvg-logo'] || '',
      group,
      country,
    });
  }

  return {
    channels,
    groups: uniqueSorted(channels.map((channel) => channel.group)),
    countries: uniqueSorted(channels.map((channel) => channel.country)),
  };
}

function parseAttributes(info: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(info))) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function formatCategory(
  category: string | undefined,
  categoryMap: Map<string, string>,
  fallback: string | undefined,
): string {
  if (category) {
    return categoryMap.get(category) ?? titleCase(category);
  }
  return fallback || 'Other';
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
