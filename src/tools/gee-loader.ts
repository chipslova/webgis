import * as maplibregl from 'maplibre-gl';

export class GEELoader {
  private map: maplibregl.Map;
  private popup: maplibregl.Popup;
  private htmlMarkers: maplibregl.Marker[] = [];
  
  // Cached GeoJSON Data
  private poiData: GeoJSON.FeatureCollection | null = null;
  private lstData: GeoJSON.FeatureCollection | null = null;
  private elvData: GeoJSON.FeatureCollection | null = null;
  private lcData: GeoJSON.FeatureCollection | null = null;

  // Layer Visibility State
  private lstVisible: boolean = true;
  private poiVisible: boolean = true;
  private elevationVisible: boolean = false;
  private landcoverVisible: boolean = false;

  private isEventsBound: boolean = false;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '320px'
    });

    // Re-attach GEE layers safely when a new basemap style finishes loading
    this.map.on('style.load', () => {
      this.reattachLayersIfNeeded();
    });
  }

  private async fetchJson(url: string) {
    const origin = window.location.origin;
    const fullUrl = url.startsWith('/') ? origin + url : url;
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error(`Failed fetching ${url}: HTTP ${res.status}`);
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      throw new Error(`Expected JSON from ${url} but got HTML.`);
    }
    return res.json();
  }

  public async loadGEEDatasets() {
    try {
      // 1. Fetch Datasets
      const [poiRes, lstRes, elvRes, lcRes] = await Promise.all([
        this.fetchJson('/data/gee_jakarta_poi.geojson'),
        this.fetchJson('/data/gee_lst_grid.geojson'),
        this.fetchJson('/data/gee_elevation_grid.geojson'),
        this.fetchJson('/data/gee_landcover.geojson')
      ]);

      this.poiData = poiRes;
      this.lstData = lstRes;
      this.elvData = elvRes;
      this.lcData = lcRes;

      // 2. Render Layers on Map
      this.renderAllLayers();

      // 3. Render HTML POI Markers
      this.renderHtmlMarkers();

      // 4. Bind Map Events
      if (!this.isEventsBound) {
        this.bindLayerEvents();
        this.isEventsBound = true;
      }

      // 5. Fly to Greater Jakarta Area
      this.flyToStudyArea();

    } catch (err) {
      console.error('Failed loading GEE datasets:', err);
    }
  }

  public renderAllLayers() {
    if (!this.map || !this.lstData || !this.elvData || !this.lcData || !this.poiData) return;

    if (typeof this.map.isStyleLoaded === 'function' && !this.map.isStyleLoaded()) {
      this.map.once('style.load', () => this.renderAllLayers());
      return;
    }

    try {
      // --- 1. ELEVATION LAYER ---
      if (!this.map.getSource('gee-elevation-source')) {
        this.map.addSource('gee-elevation-source', { type: 'geojson', data: this.elvData });
      }
      if (!this.map.getLayer('gee-elevation-fill')) {
        this.map.addLayer({
          id: 'gee-elevation-fill',
          type: 'fill',
          source: 'gee-elevation-source',
          layout: { visibility: this.elevationVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'elevation_m'],
              0, '#006633',
              50, '#84cc16',
              200, '#eab308',
              600, '#c2410c',
              1200, '#f5f5f5'
            ],
            'fill-opacity': 0.65
          }
        });
      }

      // --- 2. LAND COVER LAYER ---
      if (!this.map.getSource('gee-landcover-source')) {
        this.map.addSource('gee-landcover-source', { type: 'geojson', data: this.lcData });
      }
      if (!this.map.getLayer('gee-landcover-fill')) {
        this.map.addLayer({
          id: 'gee-landcover-fill',
          type: 'fill',
          source: 'gee-landcover-source',
          layout: { visibility: this.landcoverVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'match',
              ['get', 'lc_code'],
              17, '#0284c7', // Water
              13, '#e11d48', // Urban
              12, '#eab308', // Cropland
              1, '#15803d',  // Forest
              '#94a3b8'      // Other
            ],
            'fill-opacity': 0.65
          }
        });
      }

      // --- 3. LST HEATMAP LAYER ---
      if (!this.map.getSource('gee-lst-source')) {
        this.map.addSource('gee-lst-source', { type: 'geojson', data: this.lstData });
      }
      if (!this.map.getLayer('gee-lst-fill')) {
        this.map.addLayer({
          id: 'gee-lst-fill',
          type: 'fill',
          source: 'gee-lst-source',
          layout: { visibility: this.lstVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'lst_celsius'],
              18, '#1e40af', // Deep blue
              23, '#0284c7', // Sky blue
              27, '#10b981', // Green
              30, '#f59e0b', // Yellow / Warm
              33, '#ea580c', // Orange / Hot
              36, '#dc2626'  // Red / Extreme Heat
            ],
            'fill-opacity': 0.65
          }
        });
      }
      if (!this.map.getLayer('gee-lst-outline')) {
        this.map.addLayer({
          id: 'gee-lst-outline',
          type: 'line',
          source: 'gee-lst-source',
          layout: { visibility: this.lstVisible ? 'visible' : 'none' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 0.5,
            'line-opacity': 0.35
          }
        });
      }

      // --- 4. POI VECTOR CIRCLES ---
      if (!this.map.getSource('gee-poi-source')) {
        this.map.addSource('gee-poi-source', { type: 'geojson', data: this.poiData });
      }
      if (!this.map.getLayer('gee-poi-circles')) {
        this.map.addLayer({
          id: 'gee-poi-circles',
          type: 'circle',
          source: 'gee-poi-source',
          layout: { visibility: this.poiVisible ? 'visible' : 'none' },
          paint: {
            'circle-radius': 14,
            'circle-color': [
              'match',
              ['get', 'id'],
              'urban_poi', '#dc2626',
              'rural_poi', '#16a34a',
              '#3b82f6'
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff'
          }
        });
      }

      // Ensure layers are always on top of basemap raster layers
      const layerIds = [
        'gee-elevation-fill',
        'gee-landcover-fill',
        'gee-lst-fill',
        'gee-lst-outline',
        'gee-poi-circles'
      ];
      layerIds.forEach((id) => {
        if (this.map.getLayer(id)) {
          this.map.moveLayer(id);
        }
      });

      this.updateLayerVisibilities();

    } catch (e) {
      console.warn('Notice rendering GEE layers:', e);
    }
  }

  private renderHtmlMarkers() {
    // Remove old markers
    this.htmlMarkers.forEach(m => m.remove());
    this.htmlMarkers = [];

    if (!this.poiData) return;

    this.poiData.features.forEach((feat: any) => {
      const coords = feat.geometry.coordinates;
      const props = feat.properties;

      const el = document.createElement('div');
      el.className = `gee-map-marker ${props.id}`;
      el.innerHTML = `
        <div class="marker-pulse ${props.id}"></div>
        <div class="marker-pin ${props.id}">
          <span class="marker-icon">${props.id === 'urban_poi' ? '🏙️' : '🌲'}</span>
        </div>
        <div class="marker-label">${props.name.split(' (')[0]}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const html = `
          <div class="gee-popup-card">
            <div class="gee-popup-badge ${props.id}">${props.category}</div>
            <h4>${props.name}</h4>
            <table class="gee-popup-table">
              <tr><td><strong>Mean Daytime LST:</strong></td><td><span class="highlight-temp">${props.mean_lst_celsius} °C</span></td></tr>
              <tr><td><strong>Ground Elevation:</strong></td><td>${props.elevation_m} m</td></tr>
              <tr><td><strong>Land Cover:</strong></td><td>${props.land_cover_name}</td></tr>
              <tr><td><strong>Coordinates:</strong></td><td>${props.latitude.toFixed(4)}, ${props.longitude.toFixed(4)}</td></tr>
            </table>
          </div>
        `;
        this.popup.setLngLat(coords).setHTML(html).addTo(this.map);
      });

      if (!this.poiVisible) {
        el.style.display = 'none';
      }

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(this.map);

      this.htmlMarkers.push(marker);
    });
  }

  public updateLayerVisibilities() {
    if (!this.map) return;

    if (this.map.getLayer('gee-lst-fill')) {
      this.map.setLayoutProperty('gee-lst-fill', 'visibility', this.lstVisible ? 'visible' : 'none');
      if (this.lstVisible) this.map.moveLayer('gee-lst-fill');
    }
    if (this.map.getLayer('gee-lst-outline')) {
      this.map.setLayoutProperty('gee-lst-outline', 'visibility', this.lstVisible ? 'visible' : 'none');
      if (this.lstVisible) this.map.moveLayer('gee-lst-outline');
    }

    if (this.map.getLayer('gee-elevation-fill')) {
      this.map.setLayoutProperty('gee-elevation-fill', 'visibility', this.elevationVisible ? 'visible' : 'none');
      if (this.elevationVisible) this.map.moveLayer('gee-elevation-fill');
    }

    if (this.map.getLayer('gee-landcover-fill')) {
      this.map.setLayoutProperty('gee-landcover-fill', 'visibility', this.landcoverVisible ? 'visible' : 'none');
      if (this.landcoverVisible) this.map.moveLayer('gee-landcover-fill');
    }

    if (this.map.getLayer('gee-poi-circles')) {
      this.map.setLayoutProperty('gee-poi-circles', 'visibility', this.poiVisible ? 'visible' : 'none');
      if (this.poiVisible) this.map.moveLayer('gee-poi-circles');
    }

    // Toggle HTML markers visibility
    this.htmlMarkers.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.display = this.poiVisible ? 'flex' : 'none';
    });
  }

  private reattachLayersIfNeeded() {
    if (!this.lstData) return;
    this.renderAllLayers();
    this.renderHtmlMarkers();
  }

  private bindLayerEvents() {
    // Click POIs vector circle
    this.map.on('click', 'gee-poi-circles', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const props = feat.properties;
      const coords = (feat.geometry as any).coordinates.slice();

      const html = `
        <div class="gee-popup-card">
          <div class="gee-popup-badge ${props.id}">${props.category}</div>
          <h4>${props.name}</h4>
          <table class="gee-popup-table">
            <tr><td><strong>Mean Daytime LST:</strong></td><td><span class="highlight-temp">${props.mean_lst_celsius} °C</span></td></tr>
            <tr><td><strong>Ground Elevation:</strong></td><td>${props.elevation_m} m</td></tr>
            <tr><td><strong>Land Cover:</strong></td><td>${props.land_cover_name}</td></tr>
            <tr><td><strong>Coordinates:</strong></td><td>${props.latitude.toFixed(4)}, ${props.longitude.toFixed(4)}</td></tr>
          </table>
        </div>
      `;

      this.popup.setLngLat(coords).setHTML(html).addTo(this.map);
    });

    // Click LST grid cell
    this.map.on('click', 'gee-lst-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <h4>MODIS LST Sample Cell</h4>
            <p><strong>LST Day 1km:</strong> <span class="highlight-temp">${props.lst_celsius} °C</span> (${props.lst_kelvin} K)</p>
          </div>
        `)
        .addTo(this.map);
    });

    // Change cursor on hover
    ['gee-poi-circles', 'gee-lst-fill'].forEach((layerId) => {
      this.map.on('mouseenter', layerId, () => (this.map.getCanvas().style.cursor = 'pointer'));
      this.map.on('mouseleave', layerId, () => (this.map.getCanvas().style.cursor = ''));
    });
  }

  public flyToStudyArea() {
    this.map.flyTo({
      center: [106.9, -6.35],
      zoom: 9.5,
      pitch: 0,
      bearing: 0,
      duration: 2000
    });
  }

  public toggleLayer(layerId: string, visible: boolean) {
    if (layerId === 'lst') this.lstVisible = visible;
    if (layerId === 'elevation') this.elevationVisible = visible;
    if (layerId === 'landcover') this.landcoverVisible = visible;
    if (layerId === 'poi') this.poiVisible = visible;

    if (!this.map.getLayer('gee-lst-fill') && this.lstData) {
      this.renderAllLayers();
    } else {
      this.updateLayerVisibilities();
    }
  }
}
