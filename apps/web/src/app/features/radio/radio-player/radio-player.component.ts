import { Component } from '@angular/core';
import { RadioPlayerService } from '../services/radio-player.service';

@Component({
  selector: 'app-radio-player',
  standalone: true,
  template: `
    @if (player.currentStation(); as station) {
      <section class="radio-player" aria-label="Radio player">
        <div class="radio-player-station">
          <span class="radio-live-dot" aria-hidden="true"></span>
          <div>
            <strong>{{ station.name }}</strong>
            <small>
              {{ station.country || 'World radio' }}
              · <span class="playback-mode-badge">{{ player.playbackMode() }}</span>
            </small>
          </div>
        </div>
        <div class="radio-player-controls">
          <button type="button" (click)="player.toggle()" [disabled]="player.loading()">
            {{ player.loading() ? 'Loading' : player.playing() ? 'Pause' : 'Play' }}
          </button>
          <button type="button" class="radio-stop" (click)="player.stop()">Stop</button>
          <label>
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              [value]="player.volume()"
              (input)="setVolume($event)"
              aria-label="Radio volume"
            />
          </label>
        </div>
        @if (player.error()) {
          <p class="radio-player-error">{{ player.error() }}</p>
        }
      </section>
    }
  `,
})
export class RadioPlayerComponent {
  constructor(readonly player: RadioPlayerService) {}

  setVolume(event: Event): void {
    this.player.setVolume(Number((event.target as HTMLInputElement).value));
  }
}
