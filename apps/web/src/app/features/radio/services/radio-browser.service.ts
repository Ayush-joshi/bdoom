import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NearbyStation } from '../models/radio-station.model';

@Injectable({ providedIn: 'root' })
export class RadioBrowserService {
  constructor(private readonly http: HttpClient) {}

  async getNearbyStations(
    latitude: number,
    longitude: number,
    radius?: number,
  ): Promise<{ stations: NearbyStation[]; usedNearestFallback: boolean }> {
    let params = new HttpParams()
      .set('lat', latitude.toString())
      .set('lng', longitude.toString());
    if (radius !== undefined) {
      params = params.set('radius', radius.toString());
    }

    return firstValueFrom(
      this.http.get<{ stations: NearbyStation[]; usedNearestFallback: boolean }>(
        '/api/radio/nearby',
        { params },
      ),
    );
  }

  async resolveStreamUrl(
    url: string,
  ): Promise<{ streamUrl: string; alternatives: string[]; hls: boolean }> {
    const params = new HttpParams().set('url', url);
    return firstValueFrom(
      this.http.get<{ streamUrl: string; alternatives: string[]; hls: boolean }>(
        '/api/radio/resolve',
        { params },
      ),
    );
  }
}
