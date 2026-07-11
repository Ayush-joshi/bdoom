import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { getConfig } from '../config';
import { validateRemoteUrl } from '../iptv/iptv-url';

let activeListenersCount = 0;

@Controller('radio')
@UseGuards(SessionGuard)
export class RadioRelayController {
  @Get('relay')
  async relay(
    @Query('url') url: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const config = getConfig();
    if (!config.radioRelayEnabled) {
      throw new BadRequestException('Radio relay is disabled.');
    }

    if (activeListenersCount >= config.radioRelayMaxListeners) {
      throw new ServiceUnavailableException('Relay capacity reached. Please try again later.');
    }

    const validatedUrl = await validateRemoteUrl(url);

    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 10000);

    try {
      const upstreamResponse = await fetch(validatedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 BDoom/1.0' },
        signal: controller.signal,
      });

      clearTimeout(connectTimeout);

      if (!upstreamResponse.ok) {
        throw new BadRequestException(`Upstream returned HTTP ${upstreamResponse.status}`);
      }

      const contentType = upstreamResponse.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const body = upstreamResponse.body;
      if (!body) {
        throw new BadRequestException('Empty upstream stream body.');
      }

      const reader = body.getReader();
      let active = true;
      activeListenersCount++;

      const cleanup = () => {
        if (active) {
          active = false;
          activeListenersCount = Math.max(0, activeListenersCount - 1);
          reader.cancel().catch(() => {});
        }
      };

      req.on('close', cleanup);
      req.on('end', cleanup);

      try {
        while (active) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value && active) {
            res.write(value);
          }
        }
      } catch {
        // Stream read/write interrupted
      } finally {
        cleanup();
        res.end();
      }
    } catch (error) {
      clearTimeout(connectTimeout);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to connect to upstream.',
      );
    }
  }
}
