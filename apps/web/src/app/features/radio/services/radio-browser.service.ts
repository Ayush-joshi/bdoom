import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RadioStation } from '../models/radio-station.model';
import { normalizeStation, RawRadioStation } from '../utils/radio-station.utils';

@Injectable({ providedIn: 'root' })
export class RadioBrowserService {
  private stationCache?: Promise<RadioStation[]>;

  constructor(private readonly http: HttpClient) {}

  loadStations(): Promise<RadioStation[]> {
    this.stationCache ??= this.fetchFromAvailableServer().catch((error) => {
      this.stationCache = undefined;
      throw error;
    });
    return this.stationCache;
  }

  private async fetchFromAvailableServer(): Promise<RadioStation[]> {
    let lastError: unknown;
    for (const server of environment.radioBrowserServers) {
      try {
        const params = new HttpParams()
          .set('has_geo_info', 'true')
          .set('hidebroken', 'true')
          .set('order', 'clickcount')
          .set('reverse', 'true')
          .set('limit', environment.radioStationFetchLimit);
        const response = await firstValueFrom(
          this.http.get<RawRadioStation[]>(`${server}/json/stations/search`, { params }),
        );
        return response.map(normalizeStation).filter((station): station is RadioStation => !!station);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('No Radio Browser server was available.');
  }
}
