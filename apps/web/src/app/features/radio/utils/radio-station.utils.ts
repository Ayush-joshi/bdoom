import {
  NearbyStation,
  RadioRadius,
  RadioStation,
  SelectedLocation,
} from '../models/radio-station.model';

const earthRadiusKm = 6371;

export interface RawRadioStation {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  tags?: string;
  codec?: string;
  bitrate?: number;
  hls?: number;
  lastcheckok?: number;
  geo_lat?: number | null;
  geo_long?: number | null;
}

export function haversineDistanceKm(
  from: SelectedLocation,
  to: SelectedLocation,
): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function stationsNearLocation(
  stations: RadioStation[],
  location: SelectedLocation,
  radius?: number,
  limit = 20,
): { stations: NearbyStation[]; usedNearestFallback: boolean } {
  const sorted = stations
    .map((station) => ({
      ...station,
      distanceKm: haversineDistanceKm(location, {
        latitude: station.geo_lat,
        longitude: station.geo_long,
      }),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm);

  if (radius === undefined || isNaN(radius)) {
    return { stations: sorted.slice(0, limit), usedNearestFallback: false };
  }

  const withinRadius = sorted.filter((station) => station.distanceKm <= radius).slice(0, limit);
  return withinRadius.length > 0
    ? { stations: withinRadius, usedNearestFallback: false }
    : { stations: sorted.slice(0, limit), usedNearestFallback: true };
}

export function preferredStreamUrl(
  resolvedUrl: string | undefined,
  fallbackUrl: string | undefined,
): string {
  const candidates = [resolvedUrl, fallbackUrl]
    .map((value) => value?.trim() ?? '')
    .filter(isValidStreamUrl);
  return candidates.find((url) => url.startsWith('https://')) ?? candidates[0] ?? '';
}

export function normalizeStation(source: RawRadioStation): RadioStation | null {
  const streamUrl = preferredStreamUrl(source.url_resolved, source.url);
  if (
    !source.stationuuid ||
    !source.name?.trim() ||
    source.lastcheckok !== 1 ||
    !Number.isFinite(source.geo_lat) ||
    !Number.isFinite(source.geo_long) ||
    !streamUrl
  ) {
    return null;
  }

  return {
    stationuuid: source.stationuuid,
    name: source.name.trim(),
    url: source.url ?? '',
    url_resolved: source.url_resolved ?? '',
    homepage: source.homepage ?? '',
    favicon: source.favicon ?? '',
    country: source.country ?? '',
    countrycode: source.countrycode ?? '',
    state: source.state ?? '',
    language: source.language ?? '',
    tags: source.tags ?? '',
    codec: source.codec ?? '',
    bitrate: Number(source.bitrate) || 0,
    hls: source.hls === 1,
    lastcheckok: true,
    geo_lat: Number(source.geo_lat),
    geo_long: Number(source.geo_long),
    streamUrl,
    isHttps: streamUrl.startsWith('https://'),
  };
}

function isValidStreamUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
