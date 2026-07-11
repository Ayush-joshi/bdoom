export interface RadioStation {
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
  source: string;
  sourceReferences?: { source: string; id: string }[];
  alternativeUrls?: string[];
  recentSuccess?: number;
  recentFailures?: number;
}

export interface NearbyStation extends RadioStation {
  distanceKm: number;
}

export interface SelectedLocation {
  latitude: number;
  longitude: number;
}

export type RadioRadius = number;
