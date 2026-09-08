import * as maplibregl from 'maplibre-gl';
import { logger } from '../utils/logger';

export interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
  type?: string;
}

const LOCAL_INDONESIA_LANDMARKS: SearchResult[] = [
  {
    display_name: 'Gunung Bromo, Taman Nasional Bromo Tengger Semeru, Jawa Timur',
    lat: '-7.9425',
    lon: '112.9530',
    type: 'volcano',
    boundingbox: ['-8.02', '-7.86', '112.87', '113.03']
  },
  {
    display_name: 'IKN Nusantara (Ibu Kota Nusantara), Penajam Paser Utara, Kalimantan Timur',
    lat: '-0.9744',
    lon: '116.7031',
    type: 'administrative',
    boundingbox: ['-1.15', '-0.80', '116.55', '116.85']
  },
  {
    display_name: 'Jakarta (Monas, Daerah Khusus Ibukota Jakarta)',
    lat: '-6.1754',
    lon: '106.8272',
    type: 'city',
    boundingbox: ['-6.37', '-6.08', '106.68', '106.97']
  },
  {
    display_name: 'Bandung, Jawa Barat',
    lat: '-6.9175',
    lon: '107.6191',
    type: 'city',
    boundingbox: ['-6.97', '-6.84', '107.54', '107.72']
  },
  {
    display_name: 'Surabaya, Jawa Timur',
    lat: '-7.2575',
    lon: '112.7521',
    type: 'city',
    boundingbox: ['-7.36', '-7.18', '112.60', '112.83']
  },
  {
    display_name: 'Yogyakarta (Kota Yogyakarta, D.I. Yogyakarta)',
    lat: '-7.7956',
    lon: '110.3695',
    type: 'city',
    boundingbox: ['-7.83', '-7.76', '110.34', '110.41']
  },
  {
    display_name: 'Bali (Denpasar, Provinsi Bali)',
    lat: '-8.4095',
    lon: '115.1889',
    type: 'island',
    boundingbox: ['-8.88', '-8.06', '114.43', '115.71']
  },
  {
    display_name: 'Medan, Sumatera Utara',
    lat: '3.5952',
    lon: '98.6722',
    type: 'city',
    boundingbox: ['3.49', '3.76', '98.57', '98.75']
  },
  {
    display_name: 'Makassar, Sulawesi Selatan',
    lat: '-5.1477',
    lon: '119.4327',
    type: 'city',
    boundingbox: ['-5.23', '-5.05', '119.37', '119.52']
  },
  {
    display_name: 'Semarang, Jawa Tengah',
    lat: '-6.9667',
    lon: '110.4167',
    type: 'city',
    boundingbox: ['-7.10', '-6.93', '110.30', '110.50']
  },
  {
    display_name: 'Danau Toba, Sumatera Utara',
    lat: '2.6845',
    lon: '98.8756',
    type: 'water',
    boundingbox: ['2.35', '2.95', '98.50', '99.15']
  },
  {
    display_name: 'Raja Ampat, Papua Barat Daya',
    lat: '-0.2333',
    lon: '130.5167',
    type: 'archipelago',
    boundingbox: ['-1.50', '0.50', '129.50', '131.50']
  },
  {
    display_name: 'Labuan Bajo (Taman Nasional Komodo), NTT',
    lat: '-8.4964',
    lon: '119.8877',
    type: 'tourism',
    boundingbox: ['-8.60', '-8.40', '119.80', '120.00']
  },
  {
    display_name: 'Danau Sentani, Jayapura, Papua',
    lat: '-2.6000',
    lon: '140.5000',
    type: 'water',
    boundingbox: ['-2.70', '-2.50', '140.35', '140.65']
  }
];

export class GeocoderTool {
  private map: maplibregl.Map;
  private marker: maplibregl.Marker | null = null;

  constructor(map: maplibregl.Map) {
    this.map = map;
  }

  public async search(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    const cleanQuery = query.trim().toLowerCase();

    // 1. Instant local matching
    const localMatches = LOCAL_INDONESIA_LANDMARKS.filter(lm =>
      lm.display_name.toLowerCase().includes(cleanQuery)
    );

    // 2. Fetch remote Nominatim with graceful fallback
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=id&q=${encodeURIComponent(query)}&limit=6`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'id,en'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data: SearchResult[] = await res.json();
        // Merge local matches with remote API results, avoiding duplicates
        const seenNames = new Set(localMatches.map(m => m.display_name.toLowerCase()));
        const merged = [...localMatches];
        data.forEach(item => {
          if (!seenNames.has(item.display_name.toLowerCase())) {
            seenNames.add(item.display_name.toLowerCase());
            merged.push(item);
          }
        });
        return merged.slice(0, 7);
      }
    } catch (e) {
      logger.warn('Remote geocoder notice (using local index):', e);
    }

    return localMatches;
  }

  public flyToResult(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lon)) return;

    if (this.marker) {
      this.marker.remove();
    }

    // Create marker at search result location
    const el = document.createElement('div');
    el.className = 'geocoder-marker-pin';
    el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

    this.marker = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .setPopup(
        new maplibregl.Popup({ offset: 25 }).setHTML(
          `<div style="font-weight: 600; font-size: 13px; color: var(--text-main, #f1f5f9); background: var(--bg-surface, #1e293b); padding: 4px 6px; border-radius: 4px;">${result.display_name}</div>`
        )
      )
      .addTo(this.map);

    // If result has a bounding box (e.g. islands, provinces, countries, cities), fit to bounds
    if (result.boundingbox && result.boundingbox.length === 4) {
      const south = parseFloat(result.boundingbox[0]);
      const north = parseFloat(result.boundingbox[1]);
      const west = parseFloat(result.boundingbox[2]);
      const east = parseFloat(result.boundingbox[3]);

      if (!isNaN(south) && !isNaN(north) && !isNaN(west) && !isNaN(east)) {
        this.map.fitBounds(
          [
            [west, south],
            [east, north]
          ],
          {
            padding: 60,
            maxZoom: 15,
            duration: 1800,
            essential: true
          }
        );
        return;
      }
    }

    // Default fallback to flyTo
    this.map.flyTo({
      center: [lon, lat],
      zoom: 13,
      essential: true,
      duration: 1800
    });
  }

  public clear() {
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }
}
