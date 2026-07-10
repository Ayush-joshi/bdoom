import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChildProcess, spawn } from 'node:child_process';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
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

  async start(
    rawUrl: string | undefined,
    requestedBufferSeconds: number | undefined,
  ): Promise<{ id: string; playlistUrl: string }> {
    if (this.sessions.size >= maxConcurrentSessions) {
      throw new ServiceUnavailableException(
        'The server is already preparing the maximum number of compatible streams. Try again shortly.',
      );
    }

    const url = await validateRemoteUrl(rawUrl);
    const bufferSeconds = clampBufferSeconds(requestedBufferSeconds);
    const requiredSegments = Math.ceil(bufferSeconds / 2);
    const playlistSize = requiredSegments + 4;
    const id = randomUUID();
    const dir = path.join(transcodeRoot, id);
    await mkdir(dir, { recursive: true });

    const process = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'warning',
        '-fflags',
        '+genpts+discardcorrupt',
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
        '-profile:v',
        'main',
        '-pix_fmt',
        'yuv420p',
        '-force_key_frames',
        'expr:gte(t,n_forced*2)',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-af',
        'aresample=async=1:first_pts=0',
        '-avoid_negative_ts',
        'make_zero',
        '-f',
        'hls',
        '-hls_time',
        '2',
        '-hls_list_size',
        String(playlistSize),
        '-hls_segment_type',
        'fmp4',
        '-hls_fmp4_init_filename',
        'init.mp4',
        '-hls_flags',
        'delete_segments+omit_endlist+independent_segments+discont_start',
        '-hls_segment_filename',
        path.join(dir, 'segment-%05d.m4s'),
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
      await waitForBuffer(dir, process, requiredSegments, () => stderr);
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
    if (!session || !/^(index\.m3u8|init\.mp4|segment-\d+\.m4s)$/.test(file)) {
      throw new NotFoundException('Transcode session was not found.');
    }

    const filePath = path.join(session.dir, file);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Transcode output is not ready yet.');
    }

    res.setHeader('cache-control', 'no-store');
    res.type(file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4');
    createReadStream(filePath).pipe(res);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}

async function waitForBuffer(
  dir: string,
  process: ChildProcess,
  requiredSegments: number,
  getStderr: () => string,
): Promise<void> {
  const startupTimeoutMs = Math.max(30_000, requiredSegments * 2_000 + 15_000);
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    const files = existsSync(dir) ? readdirSync(dir) : [];
    if (
      files.includes('index.m3u8') &&
      files.filter((file) => file.endsWith('.m4s')).length >= requiredSegments
    ) {
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

  throw new BadGatewayException('The stream did not build the requested playback buffer in time.');
}

function clampBufferSeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 10;
  }
  return Math.min(30, Math.max(6, Math.round(Number(value) / 2) * 2));
}
