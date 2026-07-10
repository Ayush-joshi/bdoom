import assert from 'node:assert/strict';
import test from 'node:test';
import { RadioStation } from '../models/radio-station.model';
import {
  haversineDistanceKm,
  normalizeStation,
  preferredStreamUrl,
  stationsNearLocation,
} from './radio-station.utils';

test('calculates Haversine distance between London and Paris', () => {
  const distance = haversineDistanceKm(
    { latitude: 51.5074, longitude: -0.1278 },
    { latitude: 48.8566, longitude: 2.3522 },
  );
  assert.ok(distance > 340 && distance < 350);
});

test('sorts stations by distance and filters by radius', () => {
  const stations = [station('far', 2, 0), station('near', 0.1, 0), station('middle', 0.5, 0)];
  const result = stationsNearLocation(
    stations,
    { latitude: 0, longitude: 0 },
    100,
  );
  assert.deepEqual(result.stations.map((item) => item.stationuuid), ['near', 'middle']);
  assert.equal(result.usedNearestFallback, false);
});

test('returns nearest stations when none exist inside the radius', () => {
  const result = stationsNearLocation(
    [station('second', 4, 0), station('first', 3, 0)],
    { latitude: 0, longitude: 0 },
    25,
  );
  assert.deepEqual(result.stations.map((item) => item.stationuuid), ['first', 'second']);
  assert.equal(result.usedNearestFallback, true);
});

test('prefers a valid HTTPS resolved URL', () => {
  assert.equal(
    preferredStreamUrl('https://radio.example/live.mp3', 'http://legacy.example/live'),
    'https://radio.example/live.mp3',
  );
  assert.equal(preferredStreamUrl('not-a-url', 'http://legacy.example/live'), 'http://legacy.example/live');
});

test('filters failed and invalid Radio Browser stations', () => {
  assert.equal(
    normalizeStation({
      stationuuid: 'broken',
      name: 'Broken station',
      url: 'https://example.com/live',
      lastcheckok: 0,
      geo_lat: 10,
      geo_long: 10,
    }),
    null,
  );
  assert.equal(
    normalizeStation({
      stationuuid: 'missing-location',
      name: 'Missing location',
      url: 'https://example.com/live',
      lastcheckok: 1,
      geo_lat: null,
      geo_long: null,
    }),
    null,
  );
});

function station(id: string, latitude: number, longitude: number): RadioStation {
  return {
    stationuuid: id,
    name: id,
    url: 'https://example.com/live',
    url_resolved: 'https://example.com/live',
    homepage: '',
    favicon: '',
    country: '',
    countrycode: '',
    state: '',
    language: '',
    tags: '',
    codec: 'MP3',
    bitrate: 128,
    hls: false,
    lastcheckok: true,
    geo_lat: latitude,
    geo_long: longitude,
    streamUrl: 'https://example.com/live',
    isHttps: true,
  };
}
