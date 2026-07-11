import { Component, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, from } from 'rxjs';
import { NearbyStation, RadioRadius, SelectedLocation } from '../models/radio-station.model';
import { RadioMapComponent } from '../radio-map/radio-map.component';
import { RadioPlayerComponent } from '../radio-player/radio-player.component';
import { RadioBrowserService } from '../services/radio-browser.service';
import { RadioPlayerService } from '../services/radio-player.service';
import { StationListComponent } from '../station-list/station-list.component';

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
        <div class="radio-controls-wrapper">
          <div class="radio-radius-control">
            <label>Search radius</label>
            <div class="radius-inputs">
              <input
                type="range"
                min="10"
                max="1000"
                step="10"
                [ngModel]="radius()"
                (ngModelChange)="changeRadius($event, true)"
                aria-label="Search radius slider"
              />
              <input
                type="number"
                min="10"
                max="1000"
                step="1"
                [ngModel]="radius()"
                (ngModelChange)="changeRadius($event, true)"
                aria-label="Search radius numeric value"
                class="radius-number-input"
              />
              <span class="radius-unit">km</span>
            </div>
          </div>

          <div class="radio-radius-control">
            <label>Max results</label>
            <div class="radius-inputs">
              <input
                type="range"
                min="10"
                max="250"
                step="5"
                [ngModel]="limit()"
                (ngModelChange)="changeLimit($event)"
                aria-label="Max results slider"
              />
              <input
                type="number"
                min="10"
                max="250"
                step="1"
                [ngModel]="limit()"
                (ngModelChange)="changeLimit($event)"
                aria-label="Max results numeric value"
                class="radius-number-input"
              />
            </div>
          </div>
        </div>
      </header>

      <section class="radio-workspace">
        <div class="radio-map-panel">
          <app-radio-map
            [location]="selectedLocation()"
            [radius]="radius()"
            (locationSelected)="selectLocation($event)"
          />
          <div class="radio-map-hint">
            @if (selectedLocation(); as location) {
              {{ location.latitude.toFixed(3) }}, {{ location.longitude.toFixed(3) }}
            } @else {
              Click anywhere on the map to find nearby stations
            }
          </div>
          <div class="radio-search-controls">
            <input
              type="text"
              [ngModel]="searchTerm()"
              (ngModelChange)="changeSearchTerm($event)"
              placeholder="Search by station name..."
              aria-label="Search by station name"
            />
            <select
              [ngModel]="sourceFilter()"
              (ngModelChange)="changeSourceFilter($event)"
              aria-label="Filter by source"
            >
              <option value="">All Sources</option>
              <option value="curated">Official Broadcasters</option>
              <option value="akashvani">Akashvani</option>
              <option value="icecast">Icecast</option>
              <option value="radio-browser">Radio Browser</option>
            </select>
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

          @switch (state()) {
            @case ('idle') {
              <p class="radio-state">Choose a place on the map to begin.</p>
            }
            @case ('loading') {
              <p class="radio-state">Finding stations around this point...</p>
            }
            @case ('error') {
              <p class="radio-state error">{{ error() }}</p>
              <button type="button" class="secondary-button" (click)="retry()">Try again</button>
            }
            @case ('empty') {
              <div class="radio-state empty-state">
                <p>No playable stations were found inside this radius.</p>
                <button type="button" class="secondary-button" (click)="expandToNearest()">
                  Show nearest available stations
                </button>
              </div>
            }
            @case ('success') {
              @if (usedNearestFallback()) {
                <p class="radio-fallback">No stations were found inside this radius. Showing the nearest available.</p>
              }
              <app-station-list [stations]="nearbyStations()" (play)="playStation($event)" />
            }
          }
        </aside>
      </section>

      <app-radio-player />
    </main>
  `,
})
export class RadioPageComponent implements OnDestroy {
  readonly state = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  readonly error = signal('');
  readonly nearbyStations = signal<NearbyStation[]>([]);
  readonly radius = signal<RadioRadius>(100);
  readonly limit = signal(100);
  readonly selectedLocation = signal<SelectedLocation | null>(null);
  readonly usedNearestFallback = signal(false);
  readonly searchTerm = signal('');
  readonly sourceFilter = signal('');
  readonly resultTitle = computed(() => {
    if (!this.selectedLocation()) {
      return 'Pick a location';
    }
    return `Within ${this.radius()} km`;
  });

  private isManualRadius = false;
  private debounceTimeout: any;
  private searchSubscription?: Subscription;

  constructor(
    private readonly browser: RadioBrowserService,
    readonly player: RadioPlayerService,
  ) {}

  ngOnDestroy(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    this.searchSubscription?.unsubscribe();
    this.player.stop();
  }

  selectLocation(event: { location: SelectedLocation; zoom: number }): void {
    this.selectedLocation.set(event.location);
    if (!this.isManualRadius) {
      const initRadius = this.zoomToRadius(event.zoom);
      this.radius.set(initRadius);
    }
    this.search(false);
  }

  changeRadius(newRadius: number, manual: boolean): void {
    if (manual) {
      this.isManualRadius = true;
    }
    const val = Math.min(1000, Math.max(10, Number(newRadius) || 10));
    this.radius.set(val);
    if (this.selectedLocation()) {
      this.search(true);
    }
  }

  retry(): void {
    this.search(false);
  }

  playStation(station: NearbyStation): void {
    void this.player.play(station);
  }

  expandToNearest(): void {
    const location = this.selectedLocation();
    if (!location) {
      return;
    }

    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }

    this.state.set('loading');
    this.error.set('');

    this.searchSubscription = from(
      this.browser.getNearbyStations(
        location.latitude,
        location.longitude,
        undefined,
        this.searchTerm(),
        this.sourceFilter(),
        this.limit(),
      )
    ).subscribe({
      next: (result) => {
        this.nearbyStations.set(result.stations);
        this.usedNearestFallback.set(true);
        if (result.stations.length === 0) {
          this.state.set('empty');
        } else {
          this.state.set('success');
        }
      },
      error: (err) => {
        this.nearbyStations.set([]);
        this.error.set('Radio Browser could not be reached. Check your connection and try again.');
        this.state.set('error');
      },
    });
  }

  private search(debounce: boolean): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    if (debounce) {
      this.debounceTimeout = setTimeout(() => this.executeSearch(), 300);
    } else {
      this.executeSearch();
    }
  }

  private executeSearch(): void {
    const location = this.selectedLocation();
    if (!location) {
      return;
    }

    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }

    this.state.set('loading');
    this.error.set('');

    this.searchSubscription = from(
      this.browser.getNearbyStations(
        location.latitude,
        location.longitude,
        this.radius(),
        this.searchTerm(),
        this.sourceFilter(),
        this.limit(),
      )
    ).subscribe({
      next: (result) => {
        this.nearbyStations.set(result.stations);
        this.usedNearestFallback.set(result.usedNearestFallback);
        if (result.stations.length === 0) {
          this.state.set('empty');
        } else {
          this.state.set('success');
        }
      },
      error: (err) => {
        this.nearbyStations.set([]);
        this.error.set('Radio Browser could not be reached. Check your connection and try again.');
        this.state.set('error');
      },
    });
  }

  private zoomToRadius(zoom: number): number {
    if (zoom <= 2) return 1000;
    if (zoom <= 3) return 500;
    if (zoom <= 4) return 250;
    if (zoom <= 5) return 150;
    if (zoom <= 6) return 100;
    if (zoom <= 7) return 50;
    if (zoom <= 8) return 30;
    return 10;
  }

  changeSearchTerm(term: string): void {
    this.searchTerm.set(term);
    if (this.selectedLocation()) {
      this.search(true);
    }
  }

  changeSourceFilter(source: string): void {
    this.sourceFilter.set(source);
    if (this.selectedLocation()) {
      this.search(false);
    }
  }

  changeLimit(newLimit: number): void {
    const val = Math.min(250, Math.max(10, Number(newLimit) || 10));
    this.limit.set(val);
    if (this.selectedLocation()) {
      this.search(true);
    }
  }
}
