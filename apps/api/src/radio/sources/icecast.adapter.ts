import { Logger } from '@nestjs/common';
import { NormalizedStation, RadioSourceAdapter } from './radio-source.interface';

export class IcecastAdapter implements RadioSourceAdapter {
  readonly name = 'icecast';
  private readonly logger = new Logger(IcecastAdapter.name);

  async fetchStations(): Promise<NormalizedStation[]> {
    try {
      this.logger.log('Fetching Icecast directory (yp.xml)...');
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('https://dir.xiph.org/yp.xml', {
        headers: { 'User-Agent': 'Mozilla/5.0 BDoom/1.0' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Icecast YP returned HTTP ${response.status}`);
      }

      // Read only first 2MB to prevent OOM / excessive memory usage on OCI Free Tier
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Could not get response stream reader');
      }

      let xmlContent = '';
      const maxBytes = 2 * 1024 * 1024; // 2MB limit
      let bytesRead = 0;

      while (bytesRead < maxBytes) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          xmlContent += new TextDecoder('utf-8').decode(value, { stream: true });
          bytesRead += value.byteLength;
        }
      }
      reader.cancel();

      this.logger.log(`Read ${bytesRead} bytes from Icecast YP. Parsing entries...`);

      // Use a lightweight regex parser to find entries instead of loading a heavy XML DOM
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      const stations: NormalizedStation[] = [];
      let match: RegExpExecArray | null;
      let count = 0;

      while ((match = entryRegex.exec(xmlContent)) !== null && count < 500) {
        const entryBlock = match[1];
        
        const serverNameMatch = entryBlock.match(/<server_name>(.*?)<\/server_name>/);
        const listenUrlMatch = entryBlock.match(/<listen_url>(.*?)<\/listen_url>/);
        
        if (!serverNameMatch || !listenUrlMatch) {
          continue;
        }

        const name = this.decodeXmlEntities(serverNameMatch[1].trim());
        const url = this.decodeXmlEntities(listenUrlMatch[1].trim());

        if (!name || !url) {
          continue;
        }

        const genreMatch = entryBlock.match(/<genre>(.*?)<\/genre>/);
        const bitrateMatch = entryBlock.match(/<bitrate>(.*?)<\/bitrate>/);
        const codecMatch = entryBlock.match(/<codec_format>(.*?)<\/codec_format>/);

        const genre = genreMatch ? this.decodeXmlEntities(genreMatch[1]) : '';
        const bitrate = bitrateMatch ? parseInt(bitrateMatch[1], 10) : 128;
        const codec = codecMatch ? this.decodeXmlEntities(codecMatch[1]) : 'mp3';

        // Icecast directory does not have coordinates, so we assign a default (0, 0)
        // or exclude them if they lack geo info. However, for map placement, we set them to (0,0)
        // or filter them out in map queries unless a location can be inferred.
        // We'll set a default of (0, 0) and tag them.
        stations.push({
          source: this.name,
          sourceId: `icecast-${count}`,
          name,
          url,
          url_resolved: url,
          homepage: 'https://dir.xiph.org',
          favicon: 'https://dir.xiph.org/favicon.ico',
          country: 'Global',
          countrycode: 'GL',
          state: '',
          language: 'English',
          tags: genre,
          codec,
          bitrate: isNaN(bitrate) ? 128 : bitrate,
          hls: url.includes('.m3u8'),
          lastcheckok: true,
          geo_lat: 0,
          geo_long: 0,
        });

        count++;
      }

      this.logger.log(`Parsed ${stations.length} Icecast stations.`);
      return stations;
    } catch (error) {
      this.logger.error('Failed to fetch/parse Icecast YP', error);
      return [];
    }
  }

  private decodeXmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
  }
}
