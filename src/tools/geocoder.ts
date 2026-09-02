import * as maplibregl from 'maplibre-gl';

export interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
  type?: string;
}

export class GeocoderTool {
  private map: maplibregl.Map;
  private marker: maplibregl.Marker | null = null;

  constructor(map: maplibregl.Map) {
    this.map = map;
  }

  public async search(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en'
        }
      });
      if (!res.ok) return [];
      const data: SearchResult[] = await res.json();
      return data;
    } catch (e) {
      console.error('Geocoder search error:', e);
      return [];
    }
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
