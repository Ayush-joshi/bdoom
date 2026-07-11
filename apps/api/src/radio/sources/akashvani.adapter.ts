import { Logger } from '@nestjs/common';
import { NormalizedStation, RadioSourceAdapter } from './radio-source.interface';

const STATE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'NATIONAL': { lat: 28.6139, lng: 77.2090 }, // Delhi
  'DELHI': { lat: 28.6139, lng: 77.2090 },
  'ANDAMAN NICOBAR': { lat: 11.6234, lng: 92.7265 }, // Port Blair
  'ANDHRA PRADESH': { lat: 16.5062, lng: 80.6480 }, // Vijayawada
  'ARUNACHAL PRADESH': { lat: 27.0844, lng: 93.6053 }, // Itanagar
  'ASSAM': { lat: 26.1445, lng: 91.7362 }, // Guwahati
  'BIHAR': { lat: 25.5941, lng: 85.1376 }, // Patna
  'CHHATTISGARH': { lat: 21.2787, lng: 81.8661 }, // Raipur
  'GOA': { lat: 15.4909, lng: 73.8278 }, // Panaji
  'GUJARAT': { lat: 23.0225, lng: 72.5714 }, // Ahmedabad
  'HARYANA': { lat: 30.7333, lng: 76.7794 }, // Chandigarh
  'HIMACHAL PRADESH': { lat: 31.1048, lng: 77.1734 }, // Shimla
  'JAMMU KASHMIR': { lat: 34.0837, lng: 74.7973 }, // Srinagar
  'JHARKHAND': { lat: 23.3441, lng: 85.3096 }, // Ranchi
  'KARNATAKA': { lat: 12.9716, lng: 77.5946 }, // Bengaluru
  'KERALA': { lat: 8.5241, lng: 76.9366 }, // Thiruvananthapuram
  'LADAKH': { lat: 34.1526, lng: 77.5771 }, // Leh
  'LAKSHADWEEP': { lat: 10.5667, lng: 72.6369 }, // Kavaratti
  'MADHYA PRADESH': { lat: 23.2599, lng: 77.4126 }, // Bhopal
  'MAHARASHTRA': { lat: 18.9750, lng: 72.8258 }, // Mumbai
  'MANIPUR': { lat: 24.8170, lng: 93.9368 }, // Imphal
  'MEGHALAYA': { lat: 25.5788, lng: 91.8831 }, // Shillong
  'MIZORAM': { lat: 23.7307, lng: 92.7173 }, // Aizawl
  'NAGALAND': { lat: 25.6751, lng: 94.1086 }, // Kohima
  'ODISHA': { lat: 20.2961, lng: 85.8245 }, // Bhubaneswar
  'PUDUCHERRY': { lat: 11.9416, lng: 79.8083 }, // Puducherry
  'PUNJAB': { lat: 30.7333, lng: 76.7794 }, // Chandigarh
  'RAJASTHAN': { lat: 26.9124, lng: 75.7873 }, // Jaipur
  'SIKKIM': { lat: 27.3314, lng: 88.6138 }, // Gangtok
  'TAMIL NADU': { lat: 13.0827, lng: 80.2707 }, // Chennai
  'TELANGANA': { lat: 17.3850, lng: 78.4867 }, // Hyderabad
  'TRIPURA': { lat: 23.8315, lng: 91.2868 }, // Agartala
  'UTTAR PRADESH': { lat: 26.8467, lng: 80.9462 }, // Lucknow
  'UTTARAKHAND': { lat: 30.3165, lng: 78.0322 }, // Dehradun
  'WEST BENGAL': { lat: 22.5726, lng: 88.3639 }, // Kolkata
};

// Known city mappings in names to get more accurate coordinates
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'delhi': { lat: 28.6139, lng: 77.2090 },
  'mumbai': { lat: 18.9750, lng: 72.8258 },
  'bengaluru': { lat: 12.9716, lng: 77.5946 },
  'bangalore': { lat: 12.9716, lng: 77.5946 },
  'chennai': { lat: 13.0827, lng: 80.2707 },
  'kolkata': { lat: 22.5726, lng: 88.3639 },
  'hyderabad': { lat: 17.3850, lng: 78.4867 },
  'ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'pune': { lat: 18.5204, lng: 73.8567 },
  'jaipur': { lat: 26.9124, lng: 75.7873 },
  'lucknow': { lat: 26.8467, lng: 80.9462 },
  'patna': { lat: 25.5941, lng: 85.1376 },
  'bhopal': { lat: 23.2599, lng: 77.4126 },
  'coimbatore': { lat: 11.0168, lng: 76.9558 },
  'madurai': { lat: 9.9252, lng: 78.1198 },
  'kochi': { lat: 9.9312, lng: 76.2673 },
  'trivandrum': { lat: 8.5241, lng: 76.9366 },
  'visakhapatnam': { lat: 17.6868, lng: 83.2185 },
  'vijayawada': { lat: 16.5062, lng: 80.6480 },
  'guwahati': { lat: 26.1445, lng: 91.7362 },
  'shillong': { lat: 25.5788, lng: 91.8831 },
  'srinagar': { lat: 34.0837, lng: 74.7973 },
  'jammu': { lat: 32.7266, lng: 74.8570 },
  'panaji': { lat: 15.4909, lng: 73.8278 },
};

export class AkashvaniAdapter implements RadioSourceAdapter {
  readonly name = 'akashvani';
  private readonly logger = new Logger(AkashvaniAdapter.name);

  async fetchStations(): Promise<NormalizedStation[]> {
    try {
      this.logger.log('Fetching Akashvani stations...');
      const response = await fetch(
        'https://raw.githubusercontent.com/codito/akashvani/master/stations.json',
        {
          headers: { 'User-Agent': 'Mozilla/5.0 BDoom/1.0' },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch Akashvani stations: HTTP ${response.status}`);
      }

      const data = (await response.json()) as any[];
      const stations: NormalizedStation[] = [];

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item.name || !item.stream_url) {
          continue;
        }

        const stateName = (item.state ?? 'NATIONAL').trim().toUpperCase();
        let coords = STATE_COORDINATES[stateName] ?? STATE_COORDINATES['NATIONAL'];

        // Try to match specific cities in the station name for more accurate lat/lng
        const nameLower = item.name.toLowerCase();
        for (const [city, cityCoords] of Object.entries(CITY_COORDINATES)) {
          if (nameLower.includes(city)) {
            coords = cityCoords;
            break;
          }
        }

        stations.push({
          source: this.name,
          sourceId: `akashvani-${i}`,
          name: item.name.trim(),
          url: item.stream_url,
          url_resolved: item.stream_url,
          homepage: 'https://prasarbharati.gov.in',
          favicon: 'https://prasarbharati.gov.in/favicon.ico',
          country: 'India',
          countrycode: 'IN',
          state: item.state ?? 'National',
          language: item.language ?? 'Hindi, English',
          tags: 'national, news, culture, public',
          codec: 'mp3',
          bitrate: 128,
          hls: item.stream_url.includes('.m3u8') || item.stream_url.includes('Auto'),
          lastcheckok: true,
          geo_lat: coords.lat,
          geo_long: coords.lng,
        });
      }

      this.logger.log(`Fetched ${stations.length} Akashvani stations.`);
      return stations;
    } catch (error) {
      this.logger.error('Failed to fetch Akashvani stations', error);
      return [];
    }
  }
}
