import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NearbyStation } from '../models/radio-station.model';

@Component({
  selector: 'app-station-list',
  standalone: true,
  template: `
    <div class="radio-station-list" aria-label="Nearby radio stations">
      @for (station of stations; track station.stationuuid) {
        <article class="radio-station">
          <div class="radio-station-logo">
            @if (station.favicon) {
              <img
                [src]="station.favicon"
                [alt]="station.name + ' logo'"
                loading="lazy"
                (error)="handleLogoError(station)"
              />
            } @else {
              <span aria-hidden="true">R</span>
            }
          </div>
          <div class="radio-station-copy">
            <strong>{{ station.name }}</strong>
            <span>{{ locationLabel(station) }}</span>
            <small>
              {{ station.distanceKm.toFixed(0) }} km
              @if (station.language) { · {{ station.language }} }
              · <span class="station-source">{{ formatSource(station.source) }}</span>
            </small>
            <small>
              {{ station.tags || 'General' }}
              @if (station.codec) { · {{ station.codec }} }
              @if (station.bitrate) { {{ station.bitrate }} kbps }
            </small>
            @if (!station.isHttps) {
              <em>HTTP stream may be blocked by the browser</em>
            }
          </div>
          <button type="button" (click)="play.emit(station)" [attr.aria-label]="'Play ' + station.name">
            Play
          </button>
        </article>
      }
    </div>
  `,
})
export class StationListComponent {
  @Input({ required: true }) stations: NearbyStation[] = [];
  @Output() readonly play = new EventEmitter<NearbyStation>();

  locationLabel(station: NearbyStation): string {
    return [station.state, station.country].filter(Boolean).join(', ') || 'Unknown location';
  }

  handleLogoError(station: NearbyStation): void {
    station.favicon = '';
  }

  formatSource(source: string): string {
    if (!source) return '';
    if (source === 'curated') return 'Official Broadcasters';
    if (source === 'akashvani') return 'Akashvani';
    if (source === 'icecast') return 'Icecast';
    if (source === 'radio-browser') return 'Radio Browser';
    return source;
  }
}
