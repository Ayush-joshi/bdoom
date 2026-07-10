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
  on(event: string, handler: (_event: string, data: HlsErrorData) => void): void;
};

type HlsConstructor = {
  new (config?: { maxBufferLength?: number; maxMaxBufferLength?: number }): HlsInstance;
  Events: {
    ERROR: string;
  };
  isSupported(): boolean;
};

type HlsErrorData = {
  details?: string;
  error?: Error;
  fatal?: boolean;
  networkDetails?: {
    status?: number;
    statusText?: string;
    responseURL?: string;
  };
  type?: string;
};

type DashPlayer = {
  initialize(video: HTMLVideoElement, source: string, autoplay: boolean): void;
  on(event: string, handler: (event: { error?: { message?: string }; event?: { message?: string } }) => void): void;
  reset(): void;
};

type DashConstructor = {
  MediaPlayer(): { create(): DashPlayer };
};

type MpegtsPlayer = {
  attachMediaElement(video: HTMLVideoElement): void;
  destroy(): void;
  load(): void;
  on(event: string, handler: (type: string, detail: string, info: unknown) => void): void;
};

type MpegtsConstructor = {
  createPlayer(config: { isLive: boolean; type: 'flv' | 'mpegts'; url: string }): MpegtsPlayer;
  Events: { ERROR: string };
  isSupported(): boolean;
};

type StreamKind = 'dash' | 'flv' | 'hls' | 'mpegts' | 'native';

declare global {
  interface Window {
    Hls?: HlsConstructor;
    dashjs?: DashConstructor;
    mpegts?: MpegtsConstructor;
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
        <div class="iptv-controls">
          <label class="search-field">
            Search
            <input
              name="channelSearch"
              autocomplete="off"
              placeholder="Channel, category, country"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
              (keydown.escape)="query.set('')"
              role="combobox"
              [attr.aria-expanded]="!!query().trim()"
            />
            @if (query().trim()) {
              <div class="search-results" role="list" aria-label="Channel search results">
                @for (channel of searchSuggestions(); track channel.id + channel.url) {
                  <button type="button" (click)="selectSearchResult(channel)">
                    <span class="search-result-logo">
                      @if (channel.logo) {
                        <img [src]="channel.logo" [alt]="" loading="lazy" />
                      } @else {
                        {{ channel.name.slice(0, 1) }}
                      }
                    </span>
                    <span>
                      <strong>{{ channel.name }}</strong>
                      <small>{{ channel.group }} - {{ channel.country }}</small>
                    </span>
                  </button>
                } @empty {
                  <p>No matching channels</p>
                }
              </div>
            }
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

        <aside class="iptv-browser">

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
              (error)="handleVideoError()"
              (progress)="updateBuffer()"
              (timeupdate)="updateBuffer()"
            ></video>
            @if (transcoding()) {
              <div class="buffer-overlay">Building compatible buffer...</div>
            }
          </div>

          <div class="player-meta">
            <div>
              <p class="eyebrow">{{ selectedChannel()?.group || 'Select a channel' }}</p>
              <h2>{{ selectedChannel()?.name || 'Choose something to watch' }}</h2>
              @if (selectedChannel()) {
                <p>{{ selectedChannel()?.country }} - Public IPTV-org stream</p>
              }
            </div>
            @if (selectedChannel()) {
              <div class="player-actions">
                <span class="engine-status">Engine: {{ playerEngine() }}</span>
                <div class="mode-switch" aria-label="Playback mode">
                  <button
                    type="button"
                    class="mode-button"
                    [class.active]="playbackMode() === 'original'"
                    [attr.aria-pressed]="playbackMode() === 'original'"
                    (click)="useOriginalMode()"
                    [disabled]="playbackMode() === 'original' && !transcoding()"
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    class="mode-button"
                    [class.active]="playbackMode() === 'compatible'"
                    [attr.aria-pressed]="playbackMode() === 'compatible'"
                    (click)="useCompatibleMode()"
                    [disabled]="transcoding() || playbackMode() === 'compatible'"
                  >
                    {{ transcoding() ? 'Preparing...' : 'Compatible' }}
                  </button>
                </div>
              </div>
              <div class="buffer-readout">
                <div class="buffer-track" aria-hidden="true">
                  <span [style.width.%]="bufferPercent()"></span>
                </div>
                <small>
                  {{ transcoding() ? 'Buffer: preparing' : 'Buffer: ' + bufferAhead().toFixed(1) + 's ahead' }}
                </small>
              </div>
              <label class="buffer-setting">
                <span>
                  <strong>Compatible startup buffer</strong>
                  <output>{{ startupBufferSeconds() }}s</output>
                </span>
                <input
                  type="range"
                  min="6"
                  max="30"
                  step="2"
                  [ngModel]="startupBufferSeconds()"
                  (ngModelChange)="startupBufferSeconds.set(+$event)"
                  [disabled]="transcoding() || playbackMode() === 'compatible'"
                  aria-label="Compatible mode startup buffer seconds"
                />
              </label>
            }
            @if (playerMessage()) {
              <p class="notice">{{ playerMessage() }}</p>
            }
            @if (playerError()) {
              <p class="notice error">{{ playerError() }}</p>
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
  readonly bufferAhead = signal(0);
  readonly bufferPercent = computed(() =>
    Math.min(100, (this.bufferAhead() / this.startupBufferSeconds()) * 100),
  );
  readonly error = signal('');
  readonly loading = signal(false);
  readonly playerError = signal('');
  readonly playerEngine = signal('Waiting');
  readonly playerMessage = signal('');
  readonly playbackMode = signal<'compatible' | 'original'>('original');
  readonly query = signal('');
  readonly selectedChannel = signal<IptvChannel | null>(null);
  readonly selectedCountry = signal('');
  readonly selectedGroup = signal('');
  readonly startupBufferSeconds = signal(10);
  readonly transcoding = signal(false);

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

  readonly searchSuggestions = computed(() => this.filteredChannels().slice(0, 8));

  private hls: HlsInstance | null = null;
  private dash: DashPlayer | null = null;
  private mpegts: MpegtsPlayer | null = null;
  private playerReady = false;
  private playerRequestId = 0;
  private transcodeId: string | null = null;

  constructor(private readonly iptv: IptvService) {}

  ngAfterViewInit(): void {
    this.playerReady = true;
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyPlayers();
    void this.stopTranscode();
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
    this.playerRequestId += 1;
    this.selectedChannel.set(channel);
    this.playbackMode.set('original');
    void this.stopTranscode();
    void this.configurePlayer(channel);
  }

  selectSearchResult(channel: IptvChannel): void {
    this.query.set('');
    this.selectChannel(channel);
  }

  async useOriginalMode(): Promise<void> {
    const channel = this.selectedChannel();
    if (!channel || (this.playbackMode() === 'original' && !this.transcoding())) {
      return;
    }
    this.playerRequestId += 1;
    this.transcoding.set(false);
    this.playbackMode.set('original');
    await this.stopTranscode();
    await this.configurePlayer(channel);
  }

  async useCompatibleMode(): Promise<void> {
    const channel = this.selectedChannel();
    if (!channel || this.transcoding()) {
      return;
    }

    const requestId = ++this.playerRequestId;
    this.transcoding.set(true);
    this.playerError.set('');
    this.playerMessage.set(
      `Preparing a browser-compatible stream with ${this.startupBufferSeconds()}s of startup buffer...`,
    );
    try {
      await this.stopTranscode();
      const session = await this.iptv.startTranscode(
        channel.url,
        this.startupBufferSeconds(),
      );
      if (requestId !== this.playerRequestId) {
        await this.iptv.stopTranscode(session.id).catch(() => undefined);
        return;
      }
      this.transcodeId = session.id;
      await this.configureSource(session.playlistUrl, 'hls', 'FFmpeg (H.264/AAC)');
      this.playbackMode.set('compatible');
      this.playerMessage.set(
        `Compatible mode is active with a ${this.startupBufferSeconds()}s startup buffer.`,
      );
    } catch (error) {
      this.playbackMode.set('original');
      this.playerError.set(httpErrorMessage(error));
      this.playerMessage.set('');
    } finally {
      if (requestId === this.playerRequestId) {
        this.transcoding.set(false);
      }
    }
  }

  handleVideoError(): void {
    const video = this.videoRef?.nativeElement;
    const code = video?.error?.code;
    const message = video?.error?.message;
    this.playerError.set(videoErrorMessage(code, message));
  }

  updateBuffer(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || video.buffered.length === 0) {
      this.bufferAhead.set(0);
      return;
    }

    const currentTime = video.currentTime;
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (currentTime >= video.buffered.start(index) && currentTime <= video.buffered.end(index)) {
        this.bufferAhead.set(Math.max(0, video.buffered.end(index) - currentTime));
        return;
      }
    }
    this.bufferAhead.set(0);
  }

  private async configurePlayer(channel: IptvChannel): Promise<void> {
    if (!this.playerReady || !this.videoRef) {
      return;
    }

    const source = proxiedStreamUrl(channel.url);
    await this.configureSource(source, detectStreamKind(channel.url));
  }

  private async configureSource(
    source: string,
    kind: StreamKind,
    engineLabel?: string,
  ): Promise<void> {
    if (!this.videoRef) {
      return;
    }

    const video = this.videoRef.nativeElement;
    this.destroyPlayers();
    video.pause();
    video.removeAttribute('src');
    video.load();
    this.bufferAhead.set(0);
    this.playerError.set('');
    this.playerMessage.set('');

    if (kind === 'dash') {
      const Dash = await loadDash();
      if (Dash) {
        this.dash = Dash.MediaPlayer().create();
        this.dash.on('error', (event) => {
          const message = event.error?.message || event.event?.message;
          this.playerError.set(`DASH playback failed${message ? `: ${message}` : ''}. Try compatible mode.`);
        });
        this.dash.initialize(video, source, true);
        this.playerEngine.set(engineLabel ?? 'DASH');
        return;
      }
    }

    if (kind === 'flv' || kind === 'mpegts') {
      const Mpegts = await loadMpegts();
      if (Mpegts?.isSupported()) {
        this.mpegts = Mpegts.createPlayer({
          type: kind === 'flv' ? 'flv' : 'mpegts',
          isLive: true,
          url: source,
        });
        this.mpegts.on(Mpegts.Events.ERROR, (type, detail) => {
          this.playerError.set(`MPEG stream playback failed: ${type}${detail ? ` (${detail})` : ''}. Try compatible mode.`);
        });
        this.mpegts.attachMediaElement(video);
        this.mpegts.load();
        this.playerEngine.set(engineLabel ?? (kind === 'flv' ? 'FLV' : 'MPEG-TS'));
        return;
      }
    }

    if (kind === 'native' || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      this.playerEngine.set(engineLabel ?? 'Browser native');
      return;
    }

    const Hls = await loadHls();
    if (Hls?.isSupported()) {
      const targetBuffer = this.startupBufferSeconds();
      this.hls = new Hls({
        maxBufferLength: targetBuffer,
        maxMaxBufferLength: targetBuffer * 2,
      });
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        this.playerError.set(hlsErrorMessage(data));
      });
      this.hls.loadSource(source);
      this.hls.attachMedia(video);
      this.playerEngine.set(engineLabel ?? 'HLS');
      return;
    }

    video.src = source;
    this.playerEngine.set(engineLabel ?? 'Browser fallback');
    this.playerMessage.set('This browser may not support the selected stream format. Try compatible mode.');
  }

  private destroyPlayers(): void {
    this.hls?.destroy();
    this.hls = null;
    this.dash?.reset();
    this.dash = null;
    this.mpegts?.destroy();
    this.mpegts = null;
  }

  private async stopTranscode(): Promise<void> {
    const id = this.transcodeId;
    this.transcodeId = null;
    if (id) {
      await this.iptv.stopTranscode(id).catch(() => undefined);
    }
  }
}

let hlsLoader: Promise<HlsConstructor | null> | undefined;
let dashLoader: Promise<DashConstructor | null> | undefined;
let mpegtsLoader: Promise<MpegtsConstructor | null> | undefined;

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

function loadDash(): Promise<DashConstructor | null> {
  if (window.dashjs) {
    return Promise.resolve(window.dashjs);
  }
  dashLoader ??= loadScript(
    'https://cdn.jsdelivr.net/npm/dashjs@5.0.3/dist/modern/umd/dash.all.min.js',
    () => window.dashjs ?? null,
  );
  return dashLoader;
}

function loadMpegts(): Promise<MpegtsConstructor | null> {
  if (window.mpegts) {
    return Promise.resolve(window.mpegts);
  }
  mpegtsLoader ??= loadScript(
    'https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js',
    () => window.mpegts ?? null,
  );
  return mpegtsLoader;
}

function loadScript<T>(src: string, resolveValue: () => T): Promise<T | null> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(resolveValue());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function detectStreamKind(url: string): StreamKind {
  const pathname = new URL(url, window.location.href).pathname.toLowerCase();
  if (pathname.endsWith('.mpd')) {
    return 'dash';
  }
  if (pathname.endsWith('.flv')) {
    return 'flv';
  }
  if (pathname.endsWith('.ts') || pathname.endsWith('.m2ts')) {
    return 'mpegts';
  }
  if (pathname.endsWith('.mp4') || pathname.endsWith('.webm')) {
    return 'native';
  }
  return 'hls';
}

function proxiedStreamUrl(url: string): string {
  return `/api/iptv/proxy?url=${encodeURIComponent(url)}`;
}

function hlsErrorMessage(data: HlsErrorData): string {
  const status = data.networkDetails?.status;
  const statusText = data.networkDetails?.statusText;

  if (status) {
    return `Stream request failed with HTTP ${status}${statusText ? ` ${statusText}` : ''}. This channel may be offline, geo-blocked, or refusing proxy playback.`;
  }

  if (data.type === 'networkError') {
    return `Network error while loading this stream${data.details ? `: ${data.details}` : ''}.`;
  }

  if (data.type === 'mediaError') {
    return `Media error while decoding this stream${data.details ? `: ${data.details}` : ''}. The channel may use an unsupported format.`;
  }

  return `Stream playback failed${data.details ? `: ${data.details}` : ''}.`;
}

function videoErrorMessage(code: number | undefined, message: string | undefined): string {
  if (message) {
    return `Video playback failed: ${message}`;
  }

  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Video playback was aborted.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Video playback failed because the stream network request failed.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'Video playback failed because the stream could not be decoded.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Video playback failed because this stream format is not supported.';
    default:
      return 'Video playback failed for this channel.';
  }
}

function httpErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = (error as { error?: { message?: string } | string }).error;
    const message = typeof body === 'string' ? body : body?.message;
    if (message) {
      return `Compatible mode failed: ${message}`;
    }
  }
  return 'Compatible mode could not start. The stream may be offline or FFmpeg may be unavailable.';
}
