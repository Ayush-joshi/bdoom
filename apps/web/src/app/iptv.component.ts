import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IptvCatalog, IptvChannel, IptvService } from './iptv.service';

type HlsInstance = {
  attachMedia(video: HTMLVideoElement): void;
  destroy(): void;
  loadSource(source: string): void;
};

type HlsConstructor = {
  new (): HlsInstance;
  isSupported(): boolean;
};

declare global {
  interface Window {
    Hls?: HlsConstructor;
  }
}

@Component({
  selector: 'app-iptv',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="dashboard-shell iptv-shell">
      <a class="back-link" routerLink="/">Back</a>

      <header class="iptv-header">
        <div>
          <p class="eyebrow">BDoom IPTV</p>
          <h1>Live Channels</h1>
        </div>
        <button type="button" class="secondary-button" (click)="load()" [disabled]="loading()">
          Refresh
        </button>
      </header>

      <section class="iptv-layout">
        <aside class="iptv-browser">
          <div class="iptv-controls">
            <label>
              Search
              <input
                name="channelSearch"
                autocomplete="off"
                placeholder="Channel, category, country"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
              />
            </label>

            <div class="iptv-filter-grid">
              <label>
                Category
                <select
                  name="channelGroup"
                  [ngModel]="selectedGroup()"
                  (ngModelChange)="selectedGroup.set($event)"
                >
                  <option value="">All categories</option>
                  @for (group of catalog()?.groups ?? []; track group) {
                    <option [value]="group">{{ group }}</option>
                  }
                </select>
              </label>

              <label>
                Country
                <select
                  name="channelCountry"
                  [ngModel]="selectedCountry()"
                  (ngModelChange)="selectedCountry.set($event)"
                >
                  <option value="">All countries</option>
                  @for (country of catalog()?.countries ?? []; track country) {
                    <option [value]="country">{{ country }}</option>
                  }
                </select>
              </label>
            </div>
          </div>

          @if (loading()) {
            <p class="notice">Loading the public IPTV directory...</p>
          } @else if (error()) {
            <p class="notice error">{{ error() }}</p>
          } @else {
            <div class="channel-summary">
              <strong>{{ filteredChannels().length }}</strong>
              <span>channels</span>
            </div>

            <div class="channel-list" aria-label="IPTV channels">
              @for (channel of filteredChannels(); track channel.id + channel.url) {
                <button
                  type="button"
                  class="channel-row"
                  [class.active]="selectedChannel()?.url === channel.url"
                  (click)="selectChannel(channel)"
                >
                  <span class="channel-logo">
                    @if (channel.logo) {
                      <img [src]="channel.logo" [alt]="channel.name + ' logo'" loading="lazy" />
                    } @else {
                      {{ channel.name.slice(0, 1) }}
                    }
                  </span>
                  <span class="channel-info">
                    <strong>{{ channel.name }}</strong>
                    <small>{{ channel.group }} - {{ channel.country }}</small>
                  </span>
                </button>
              } @empty {
                <p class="notice">No channels match those filters.</p>
              }
            </div>
          }
        </aside>

        <section class="iptv-player">
          <div class="video-frame">
            <video
              #videoPlayer
              controls
              playsinline
              preload="metadata"
              [poster]="selectedChannel()?.logo || ''"
            ></video>
          </div>

          <div class="player-meta">
            <div>
              <p class="eyebrow">{{ selectedChannel()?.group || 'Select a channel' }}</p>
              <h2>{{ selectedChannel()?.name || 'Choose something to watch' }}</h2>
              @if (selectedChannel()) {
                <p>{{ selectedChannel()?.country }} - Public IPTV-org stream</p>
              }
            </div>
            @if (playerMessage()) {
              <p class="notice">{{ playerMessage() }}</p>
            }
          </div>
        </section>
      </section>
    </main>
  `,
})
export class IptvComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoPlayer') private readonly videoRef?: ElementRef<HTMLVideoElement>;

  readonly catalog = signal<IptvCatalog | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly playerMessage = signal('');
  readonly query = signal('');
  readonly selectedChannel = signal<IptvChannel | null>(null);
  readonly selectedCountry = signal('');
  readonly selectedGroup = signal('');

  readonly filteredChannels = computed(() => {
    const catalog = this.catalog();
    if (!catalog) {
      return [];
    }

    const query = this.query().trim().toLowerCase();
    const group = this.selectedGroup();
    const country = this.selectedCountry();

    return catalog.channels
      .filter((channel) => !group || channel.group === group)
      .filter((channel) => !country || channel.country === country)
      .filter((channel) => {
        if (!query) {
          return true;
        }
        return [channel.name, channel.group, channel.country]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 400);
  });

  private hls: HlsInstance | null = null;
  private playerReady = false;

  constructor(private readonly iptv: IptvService) {}

  ngAfterViewInit(): void {
    this.playerReady = true;
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyHls();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const catalog = await this.iptv.loadCatalog();
      this.catalog.set(catalog);

      if (!this.selectedChannel() && catalog.channels.length > 0) {
        this.selectChannel(catalog.channels[0]);
      }
    } catch {
      this.error.set('Could not load the IPTV directory. Check network access and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  selectChannel(channel: IptvChannel): void {
    this.selectedChannel.set(channel);
    void this.configurePlayer(channel);
  }

  private async configurePlayer(channel: IptvChannel): Promise<void> {
    if (!this.playerReady || !this.videoRef) {
      return;
    }

    const video = this.videoRef.nativeElement;
    const source = proxiedStreamUrl(channel.url);
    this.destroyHls();
    video.pause();
    video.removeAttribute('src');
    video.load();
    this.playerMessage.set('');

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      return;
    }

    const Hls = await loadHls();
    if (Hls?.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(source);
      this.hls.attachMedia(video);
      return;
    }

    video.src = source;
    this.playerMessage.set('This browser may not support the selected stream format.');
  }

  private destroyHls(): void {
    this.hls?.destroy();
    this.hls = null;
  }
}

let hlsLoader: Promise<HlsConstructor | null> | undefined;

function loadHls(): Promise<HlsConstructor | null> {
  if (window.Hls) {
    return Promise.resolve(window.Hls);
  }

  hlsLoader ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js';
    script.async = true;
    script.onload = () => resolve(window.Hls ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return hlsLoader;
}

function proxiedStreamUrl(url: string): string {
  return `/api/iptv/proxy?url=${encodeURIComponent(url)}`;
}
