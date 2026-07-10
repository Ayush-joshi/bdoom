import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import * as net from 'node:net';
import { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';

const textContentTypes = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
  'text/plain',
];

@Controller('iptv')
@UseGuards(SessionGuard)
export class IptvController {
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

    const body = Buffer.from(await upstream.arrayBuffer());
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    res.send(body);
  }
}

async function validateRemoteUrl(rawUrl: string | undefined): Promise<string> {
  if (!rawUrl) {
    throw new BadRequestException('Missing stream URL.');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid stream URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Unsupported stream URL.');
  }

  if (isPrivateHost(url.hostname)) {
    throw new BadRequestException('Private stream host is not allowed.');
  }

  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.some((item) => isPrivateHost(item.address))) {
    throw new BadRequestException('Private stream host is not allowed.');
  }

  return url.toString();
}

function isPrivateHost(host: string): boolean {
  const cleaned = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (cleaned === 'localhost') {
    return true;
  }

  const version = net.isIP(cleaned);
  if (version === 4) {
    const [a, b] = cleaned.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (version === 6) {
    return (
      cleaned === '::1' ||
      cleaned.startsWith('fc') ||
      cleaned.startsWith('fd') ||
      cleaned.startsWith('fe80:')
    );
  }

  return false;
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
