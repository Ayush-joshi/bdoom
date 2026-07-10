import { Component, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NearbyStation, RadioRadius, SelectedLocation } from '../models/radio-station.model';
import { RadioMapComponent } from '../radio-map/radio-map.component';
import { RadioPlayerComponent } from '../radio-player/radio-player.component';
import { RadioBrowserService } from '../services/radio-browser.service';
import { RadioPlayerService } from '../services/radio-player.service';
import { StationListComponent } from '../station-list/station-list.component';
import { stationsNearLocation } from '../utils/radio-station.utils';

@Component({
  selector: 'app-radio-page',
  standalone: true,
  imports: [FormsModule, RadioMapComponent, RadioPlayerComponent, RouterLink, StationListComponent],
  template: `
    <main class="dashboard-shell radio-shell" [class.has-radio-player]="!!player.currentStation()">
      <header class="radio-header">
        <div>
          <a class="back-link" routerLink="/">Back</a>
          <p class="eyebrow">BDoom IP Radio</p>
          <h1>World Radio Map</h1>
        </div>
        <label class="radio-radius">
          Search radius
          <select [ngModel]="radius()" (ngModelChange)="changeRadius($event)">
            <option [ngValue]="25">25 km</option>
            <option [ngValue]="50">50 km</option>
            <option [ngValue]="100">100 km</option>
            <option [ngValue]="250">250 km</option>
            <option value="nearest">Nearest available</option>
          </select>
        </label>
      </header>

      <section class="radio-workspace">
        <div class="radio-map-panel">
          <app-radio-map (locationSelected)="selectLocation($event)" />
          <div class="radio-map-hint">
            @if (selectedLocation(); as location) {
              {{ location.latitude.toFixed(3) }}, {{ location.longitude.toFixed(3) }}
            } @else {
              Click anywhere on the map to find nearby stations
            }
          </div>
        </div>

        <aside class="radio-results">
          <div class="radio-results-heading">
            <div>
              <p class="eyebrow">Nearby stations</p>
              <h2>{{ resultTitle() }}</h2>
            </div>
            @if (nearbyStations().length) {
              <span>{{ nearbyStations().length }}</span>
            }
          </div>

          @if (loading()) {
            <p class="radio-state">Finding stations around this point...</p>
          } @else if (error()) {
            <p class="radio-state error">{{ error() }}</p>
            <button type="button" class="secondary-button" (click)="retry()">Try again</button>
          } @else if (!selectedLocation()) {
            <p class="radio-state">Choose a place on the map to begin.</p>
          } @else if (nearbyStations().length === 0) {
            <p class="radio-state">No playable stations were found for this location.</p>
          } @else {
            @if (usedNearestFallback()) {
              <p class="radio-fallback">No stations were found inside this radius. Showing the nearest available.</p>
            }
            <app-station-list [stations]="nearbyStations()" (play)="playStation($event)" />
          }
        </aside>
      </section>

      <app-radio-player />
    </main>
  `,
})
export class RadioPageComponent implements OnDestroy {
  readonly error = signal('');
  readonly loading = signal(false);
  readonly nearbyStations = signal<NearbyStation[]>([]);
  readonly radius = signal<RadioRadius>(100);
  readonly selectedLocation = signal<SelectedLocation | null>(null);
  readonly usedNearestFallback = signal(false);
  readonly resultTitle = computed(() => {
    if (!this.selectedLocation()) {
      return 'Pick a location';
    }
    return this.radius() === 'nearest' ? 'Closest signals' : `Within ${this.radius()} km`;
  });
  private searchRequestId = 0;

  constructor(
    private readonly browser: RadioBrowserService,
    readonly player: RadioPlayerService,
  ) {}

  ngOnDestroy(): void {
    this.player.stop();
  }

  selectLocation(location: SelectedLocation): void {
    this.selectedLocation.set(location);
    void this.search();
  }

  changeRadius(radius: RadioRadius): void {
    this.radius.set(radius);
    if (this.selectedLocation()) {
      void this.search();
    }
  }

  retry(): void {
    void this.search();
  }

  playStation(station: NearbyStation): void {
    void this.player.play(station);
  }

  private async search(): Promise<void> {
    const location = this.selectedLocation();
    if (!location) {
      return;
    }
    const requestId = ++this.searchRequestId;
    this.loading.set(true);
    this.error.set('');
    try {
      const stations = await this.browser.loadStations();
      const result = stationsNearLocation(stations, location, this.radius());
      if (requestId !== this.searchRequestId) {
        return;
      }
      this.nearbyStations.set(result.stations);
      this.usedNearestFallback.set(result.usedNearestFallback);
    } catch {
      if (requestId === this.searchRequestId) {
        this.nearbyStations.set([]);
        this.error.set('Radio Browser could not be reached. Check your connection and try again.');
      }
    } finally {
      if (requestId === this.searchRequestId) {
        this.loading.set(false);
      }
    }
  }
}
