import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChildProcess, spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { validateRemoteUrl } from './iptv-url';

interface TranscodeSession {
  id: string;
  dir: string;
  process: ChildProcess;
  timer: NodeJS.Timeout;
}

const transcodeRoot = path.join(os.tmpdir(), 'bdoom-iptv-transcodes');
const sessionTtlMs = 30 * 60 * 1000;
const maxConcurrentSessions = 3;

@Injectable()
export class IptvTranscodeService implements OnModuleDestroy {
  private readonly sessions = new Map<string, TranscodeSession>();

  async start(rawUrl: string | undefined): Promise<{ id: string; playlistUrl: string }> {
    if (this.sessions.size >= maxConcurrentSessions) {
      throw new ServiceUnavailableException(
        'The server is already preparing the maximum number of compatible streams. Try again shortly.',
      );
    }

    const url = await validateRemoteUrl(rawUrl);
    const id = randomUUID();
    const dir = path.join(transcodeRoot, id);
    await mkdir(dir, { recursive: true });

    const process = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'warning',
        '-user_agent',
        'Mozilla/5.0 BDoom-IPTV/1.0',
        '-i',
        url,
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-tune',
        'zerolatency',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-f',
        'hls',
        '-hls_time',
        '4',
        '-hls_list_size',
        '8',
        '-hls_flags',
        'delete_segments+append_list+omit_endlist',
        '-hls_segment_filename',
        path.join(dir, 'segment-%05d.ts'),
        path.join(dir, 'index.m3u8'),
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    let stderr = '';
    process.once('error', (error) => {
      stderr = error.message;
    });
    process.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });

    const timer = setTimeout(() => {
      void this.stop(id);
    }, sessionTtlMs);

    this.sessions.set(id, { id, dir, process, timer });

    try {
      await waitForPlaylist(path.join(dir, 'index.m3u8'), process, () => stderr);
    } catch (error) {
      await this.stop(id);
      throw error;
    }

    return {
      id,
      playlistUrl: `/api/iptv/transcode/${id}/index.m3u8`,
    };
  }

  async stop(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    clearTimeout(session.timer);
    this.sessions.delete(id);
    session.process.kill('SIGTERM');
    setTimeout(() => {
      if (session.process.exitCode === null) {
        session.process.kill('SIGKILL');
      }
    }, 2500).unref();
    await rm(session.dir, { recursive: true, force: true });
  }

  async serve(id: string, file: string, res: Response): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || !/^(index\.m3u8|segment-\d+\.ts)$/.test(file)) {
      throw new NotFoundException('Transcode session was not found.');
    }

    const filePath = path.join(session.dir, file);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Transcode output is not ready yet.');
    }

    res.setHeader('cache-control', 'no-store');
    res.type(file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    createReadStream(filePath).pipe(res);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}

async function waitForPlaylist(
  playlistPath: string,
  process: ChildProcess,
  getStderr: () => string,
): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (existsSync(playlistPath)) {
      return;
    }
    if (process.exitCode !== null) {
      const detail = getStderr().trim();
      throw new BadGatewayException(
        detail ? `FFmpeg could not open this stream: ${detail}` : 'FFmpeg could not open this stream.',
      );
    }
    if (process.pid === undefined) {
      throw new ServiceUnavailableException('FFmpeg is not installed on this server.');
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new BadGatewayException('The stream did not produce playable video within 15 seconds.');
}
