export interface NormalizedStation {
  stationuuid?: string; // populated after saving/merging
  source: string;
  sourceId: string;
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
}

export interface RadioSourceAdapter {
  name: string;
  fetchStations(): Promise<NormalizedStation[]>;
}
