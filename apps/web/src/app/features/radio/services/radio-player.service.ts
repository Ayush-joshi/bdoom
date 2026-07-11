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

  private readonly audio = new Audio();
  private hls: RadioHlsInstance | null = null;

  constructor(private readonly browser: RadioBrowserService) {
    this.audio.preload = 'none';
    this.audio.volume = this.volume();
    this.audio.addEventListener('playing', () => {
      this.loading.set(false);
      this.playing.set(true);
    });
    this.audio.addEventListener('pause', () => this.playing.set(false));
    this.audio.addEventListener('waiting', () => this.loading.set(true));
    this.audio.addEventListener('error', () => {
      this.loading.set(false);
      this.playing.set(false);
      this.error.set(mediaErrorMessage(this.audio.error));
    });
  }

  async play(station: RadioStation): Promise<void> {
    this.stopMedia();
    this.currentStation.set(station);
    this.error.set('');
    this.loading.set(true);

    try {
      const resolved = await this.browser.resolveStreamUrl(station.url || station.streamUrl);
      const candidates = [
        { url: resolved.streamUrl, hls: resolved.hls },
        ...(resolved.alternatives || []).map((alt) => ({
          url: alt,
          hls: alt.includes('.m3u8') || alt.includes('.m3u'),
        })),
      ];

      let lastError: Error | null = null;
      for (const cand of candidates) {
        try {
          this.error.set('');
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

function isHlsStation(station: RadioStation): boolean {
  return station.hls || /\.m3u8(?:$|\?)/i.test(station.streamUrl);
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
