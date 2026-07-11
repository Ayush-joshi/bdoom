import { Injectable, signal } from '@angular/core';
import { RadioStation } from '../models/radio-station.model';
import { RadioBrowserService } from './radio-browser.service';

type RadioHlsInstance = {
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  loadSource(source: string): void;
  on(event: string, handler: (_event: string, data: { details?: string; fatal?: boolean }) => void): void;
};

type RadioHlsConstructor = {
  new (): RadioHlsInstance;
  Events: { ERROR: string; MANIFEST_PARSED: string };
  isSupported(): boolean;
};

@Injectable({ providedIn: 'root' })
export class RadioPlayerService {
  readonly currentStation = signal<RadioStation | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly playing = signal(false);
  readonly volume = signal(0.8);
  readonly playbackMode = signal<'direct' | 'HLS' | 'relay' | 'offline' | 'unsupported'>('direct');

  private readonly audio = new Audio();
  private hls: RadioHlsInstance | null = null;
  private reported = false;

  constructor(private readonly browser: RadioBrowserService) {
    this.audio.preload = 'none';
    this.audio.volume = this.volume();
    
    this.audio.addEventListener('playing', () => {
      this.loading.set(false);
      this.playing.set(true);
      const station = this.currentStation();
      if (station && !this.reported) {
        this.reported = true;
        void this.browser.reportPlayback(station.stationuuid, true);
      }
    });

    this.audio.addEventListener('pause', () => this.playing.set(false));
    
    this.audio.addEventListener('waiting', () => this.loading.set(true));
    
    this.audio.addEventListener('error', () => {
      this.loading.set(false);
      this.playing.set(false);
      
      const err = this.audio.error;
      if (err) {
        if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
          this.playbackMode.set('unsupported');
        } else {
          this.playbackMode.set('offline');
        }
      } else {
        this.playbackMode.set('offline');
      }

      this.error.set(mediaErrorMessage(err));

      const station = this.currentStation();
      if (station && !this.reported) {
        this.reported = true;
        void this.browser.reportPlayback(station.stationuuid, false);
      }
    });
  }

  async play(station: RadioStation): Promise<void> {
    this.stopMedia();
    this.currentStation.set(station);
    this.error.set('');
    this.loading.set(true);
    this.reported = false;

    try {
      const originalUrl = station.url || station.streamUrl;
      let resolved;
      try {
        resolved = await this.browser.resolveStreamUrl(originalUrl);
      } catch {
        resolved = { streamUrl: originalUrl, alternatives: [], hls: station.hls };
      }

      const candidates: { url: string; hls: boolean; mode: 'direct' | 'HLS' | 'relay' }[] = [];

      candidates.push({
        url: resolved.streamUrl,
        hls: resolved.hls,
        mode: resolved.hls ? 'HLS' : 'direct',
      });

      if (resolved.alternatives) {
        for (const alt of resolved.alternatives) {
          candidates.push({
            url: alt,
            hls: alt.includes('.m3u8') || alt.includes('.m3u'),
            mode: (alt.includes('.m3u8') || alt.includes('.m3u')) ? 'HLS' : 'direct',
          });
        }
      }

      if (station.alternativeUrls) {
        for (const alt of station.alternativeUrls) {
          if (!candidates.some((c) => c.url === alt)) {
            candidates.push({
              url: alt,
              hls: alt.includes('.m3u8') || alt.includes('.m3u') || station.hls,
              mode: (alt.includes('.m3u8') || alt.includes('.m3u')) ? 'HLS' : 'direct',
            });
          }
        }
      }

      const uniqueUrls = Array.from(new Set(candidates.map((c) => c.url)));
      for (const rawUrl of uniqueUrls) {
        candidates.push({
          url: `/api/radio/relay?url=${encodeURIComponent(rawUrl)}`,
          hls: rawUrl.includes('.m3u8') || rawUrl.includes('.m3u') || station.hls,
          mode: 'relay',
        });
      }

      let lastError: Error | null = null;
      for (const cand of candidates) {
        try {
          this.error.set('');
          this.playbackMode.set(cand.mode);
          if (cand.hls) {
            await this.playHls(cand.url);
          } else {
            this.audio.src = cand.url;
            await this.audio.play();
          }
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          this.stopMedia();
        }
      }

      throw lastError || new Error('All stream candidates failed to play.');
    } catch (error) {
      this.loading.set(false);
      this.playing.set(false);
      this.playbackMode.set('offline');
      if (!this.reported) {
        this.reported = true;
        void this.browser.reportPlayback(station.stationuuid, false);
      }
      this.error.set(
        error instanceof Error
          ? `Could not play this station: ${error.message}`
          : 'Could not play this station. Try another stream.',
      );
    }
  }

  async toggle(): Promise<void> {
    if (!this.currentStation()) {
      return;
    }
    if (this.audio.paused) {
      this.loading.set(true);
      try {
        await this.audio.play();
      } catch (error) {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Playback could not resume.');
      }
    } else {
      this.audio.pause();
    }
  }

  stop(): void {
    this.stopMedia();
    this.currentStation.set(null);
    this.error.set('');
    this.loading.set(false);
    this.playing.set(false);
  }

  setVolume(value: number): void {
    const volume = Math.min(1, Math.max(0, value));
    this.volume.set(volume);
    this.audio.volume = volume;
  }

  private async playHls(source: string): Promise<void> {
    if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
      this.audio.src = source;
      await this.audio.play();
      return;
    }

    const Hls = await loadHls();
    if (!Hls?.isSupported()) {
      throw new Error('This browser cannot play the station HLS format.');
    }

    this.hls = new Hls();
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        this.loading.set(false);
        this.playing.set(false);
        this.error.set(`HLS playback failed${data.details ? `: ${data.details}` : ''}.`);
      }
    });
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void this.audio.play().catch((error: Error) => {
        this.loading.set(false);
        this.error.set(`Could not start playback: ${error.message}`);
      });
    });
    this.hls.loadSource(source);
    this.hls.attachMedia(this.audio);
  }

  private stopMedia(): void {
    this.audio.pause();
    this.hls?.destroy();
    this.hls = null;
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}

let hlsLoader: Promise<RadioHlsConstructor | null> | undefined;

function loadHls(): Promise<RadioHlsConstructor | null> {
  const loadedHls = radioHlsGlobal();
  if (loadedHls) {
    return Promise.resolve(loadedHls);
  }
  hlsLoader ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js';
    script.async = true;
    script.onload = () => resolve(radioHlsGlobal());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return hlsLoader;
}

function radioHlsGlobal(): RadioHlsConstructor | null {
  return (window as unknown as { Hls?: RadioHlsConstructor }).Hls ?? null;
}

function mediaErrorMessage(error: MediaError | null): string {
  if (!error) {
    return 'The station stream failed. Try another station.';
  }
  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return 'This station uses a stream format the browser does not support.';
  }
  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return 'The station stream could not be reached or was interrupted.';
  }
  return error.message ? `Playback failed: ${error.message}` : 'The station stream failed.';
}
