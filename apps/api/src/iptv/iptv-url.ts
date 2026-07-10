import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import * as net from 'node:net';

export async function validateRemoteUrl(rawUrl: string | undefined): Promise<string> {
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
