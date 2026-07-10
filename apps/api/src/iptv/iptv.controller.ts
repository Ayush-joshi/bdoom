import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { IptvTranscodeService } from './iptv-transcode.service';
import { validateRemoteUrl } from './iptv-url';

const textContentTypes = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
];

@Controller('iptv')
@UseGuards(SessionGuard)
export class IptvController {
  constructor(private readonly transcode: IptvTranscodeService) {}

  @Get('proxy')
  async proxy(@Query('url') rawUrl: string | undefined, @Res() res: Response) {
    const url = await validateRemoteUrl(rawUrl);
    const upstream = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 BDoom-IPTV/1.0',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      const message =
        upstream.status === 403
          ? 'IPTV upstream refused access. This stream may be geo-blocked or require a specific player.'
          : `IPTV upstream request failed with HTTP ${upstream.status}.`;
      res.status(upstream.status).type('text/plain').send(message);
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin', '*');

    if (isPlaylist(url, contentType)) {
      const body = await upstream.text();
      res
        .type('application/vnd.apple.mpegurl')
        .send(rewritePlaylist(body, upstream.url));
      return;
    }

    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    if (!upstream.body) {
      res.status(502).send('IPTV upstream returned an empty response.');
      return;
    }
    Readable.fromWeb(upstream.body as never).pipe(res);
  }

  @Post('transcode')
  startTranscode(@Body('url') url: string | undefined) {
    return this.transcode.start(url);
  }

  @Get('transcode/:id/:file')
  serveTranscode(
    @Param('id') id: string,
    @Param('file') file: string,
    @Res() res: Response,
  ) {
    return this.transcode.serve(id, file, res);
  }

  @Delete('transcode/:id')
  async stopTranscode(@Param('id') id: string) {
    await this.transcode.stop(id);
    return { stopped: true };
  }
}

function isPlaylist(url: string, contentType: string): boolean {
  const normalizedType = contentType.split(';')[0].trim().toLowerCase();
  return url.includes('.m3u8') || textContentTypes.includes(normalizedType);
}

function rewritePlaylist(source: string, baseUrl: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => rewritePlaylistLine(line, baseUrl))
    .join('\n');
}

function rewritePlaylistLine(line: string, baseUrl: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return line;
  }

  if (trimmed.startsWith('#')) {
    return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
      return `URI="${proxyUrl(resolveUrl(uri, baseUrl))}"`;
    });
  }

  return proxyUrl(resolveUrl(trimmed, baseUrl));
}

function resolveUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function proxyUrl(url: string): string {
  return `/api/iptv/proxy?url=${encodeURIComponent(url)}`;
}
