import * as maplibregl from 'maplibre-gl';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export type GEEStatus = 'live' | 'computing' | 'fallback' | 'error';

export interface GEEQueryParams {
  satellite: 'terra' | 'aqua' | 'combined';
  mode: 'day' | 'night';
  start: string;
  end: string;
}

export class GEELoader {
  private map: maplibregl.Map;
  private popup: maplibregl.Popup;
  private htmlMarkers: maplibregl.Marker[] = [];

  // In-memory GeoJSON Datasets
  private stationsData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private gridData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private isDataLoaded: boolean = false;
  private dataLoadPromise: Promise<void> | null = null;

  // Live GEE Serverless state
  private liveTileUrlTemplate: string | null = null;
  private currentStatus: GEEStatus = 'fallback';
  private currentParams: GEEQueryParams = {
    satellite: 'combined',
    mode: 'day',
    start: '2025-08-01',
    end: '2025-08-31'
  };
  private onStatusChangeCallbacks: Array<(status: GEEStatus, metadata?: any) => void> = [];

  // Active layers in workspace
  private activeLayers: Set<string> = new Set<string>();
  // Visibility states
  private layerVisibilities: Map<string, boolean> = new Map([
    ['lst-day', true],
    ['lst-night', true],
    ['stations', true],
    // Aliases
    ['air-temp', true],
    ['surface-temp', true],
    ['lst', true],
    ['elevation', true],
    ['poi', true],
    ['landcover', true]
  ]);
  // Independent layer opacities
  private layerOpacities: Map<string, number> = new Map([
    ['lst-day', 0.85],
    ['lst-night', 0.85],
    ['air-temp', 0.85],
    ['surface-temp', 0.85],
    ['lst', 0.85],
    ['elevation', 0.85],
    ['landcover', 0.85]
  ]);

  private isEventsBound: boolean = false;
  private onLayersChangeCallbacks: Array<() => void> = [];

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '380px'
    });
  }

  public getStatus(): GEEStatus {
    return this.currentStatus;
  }

  public getLiveTileUrlTemplate(): string | null {
    return this.liveTileUrlTemplate;
  }

  public getParams(): GEEQueryParams {
    return { ...this.currentParams };
  }

  public onStatusChange(callback: (status: GEEStatus, metadata?: any) => void) {
    this.onStatusChangeCallbacks.push(callback);
  }

  private notifyStatusChange(status: GEEStatus, metadata?: any) {
    this.currentStatus = status;
    this.onStatusChangeCallbacks.forEach(cb => {
      try { cb(status, metadata); } catch (e) { logger.warn('[GEELoader] Status callback error:', e); }
    });
  }

  private normalizeLayerId(layerId: string): string {
    if (layerId === 'lst' || layerId === 'air-temp') return 'lst-day';
    if (layerId === 'elevation' || layerId === 'surface-temp') return 'lst-night';
    if (layerId === 'poi') return 'stations';
    return layerId;
  }

  public async ensureDataLoaded(): Promise<void> {
    if (this.isDataLoaded) return;
    if (this.dataLoadPromise) return this.dataLoadPromise;

    this.dataLoadPromise = (async () => {
      try {
        const [stationsRes, gridRes] = await Promise.all([
          fetch('/data/gee_cfsv2_stations.geojson'),
          fetch('/data/gee_cfsv2_grid.geojson')
        ]);

        if (stationsRes.ok) this.stationsData = await stationsRes.json();
        if (gridRes.ok) this.gridData = await gridRes.json();
        this.isDataLoaded = true;
      } catch (e) {
        this.dataLoadPromise = null;
        this.isDataLoaded = false;
        ErrorHandler.getInstance().showThrottledError('Failed to load MODIS LST GEE dataset. Please check your internet connection.');
        logger.warn('[GEELoader] Failed to load MODIS LST dataset:', e);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gee-load-error'));
        }
      }
    })();

    return this.dataLoadPromise;
  }

  public onLayersChange(callback: () => void) {
    this.onLayersChangeCallbacks.push(callback);
  }

  private notifyLayersChange() {
    this.onLayersChangeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        logger.warn('[GEELoader] Error in layersChange callback:', e);
      }
    });
  }

  public getAllMapLayerIds(): string[] {
    return [
      'gee-modis-live-raster-layer',
      'gee-modis-lst-day-fill',
      'gee-modis-lst-night-fill',
      'gee-modis-stations-circles',
      // Legacy compatibility IDs
      'gee-cfsv2-air-fill',
      'gee-cfsv2-surface-fill',
      'gee-cfsv2-stations-circles',
      'gee-lst-fill', 'gee-lst-outline',
      'gee-elevation-fill', 'gee-elevation-outline',
      'gee-landcover-fill', 'gee-landcover-outline',
      'gee-poi-circles'
    ];
  }

  public async computeLiveGEE(params?: Partial<GEEQueryParams>): Promise<any> {
    if (params) {
      this.currentParams = { ...this.currentParams, ...params };
    }

    this.notifyStatusChange('computing');

    try {
      const qs = new URLSearchParams({
        satellite: this.currentParams.satellite,
        mode: this.currentParams.mode,
        start: this.currentParams.start,
        end: this.currentParams.end
      });

      const res = await fetch(`/api/gee-lst-tiles?${qs.toString()}`);
      if (!res.ok) {
        throw new Error(`GEE API returned status ${res.status}`);
      }

      const data = await res.json();

      if (data.status === 'live' && data.tileUrlTemplate) {
        this.liveTileUrlTemplate = data.tileUrlTemplate;
        this.applyLiveRasterLayer(data.tileUrlTemplate);
        this.notifyStatusChange('live', data);
        return data;
      } else {
        this.liveTileUrlTemplate = null;
        this.removeLiveRasterLayer();
        this.notifyStatusChange('fallback', data);
        return data;
      }
    } catch (err: any) {
      logger.warn('[GEELoader] Error calling live GEE endpoint:', err);
      this.notifyStatusChange('fallback', { message: err.message });
      return { status: 'fallback', error: err.message };
    }
  }

  private applyLiveRasterLayer(tileUrlTemplate: string) {
    if (!this.map || !this.map.getStyle()) return;

    const sourceId = 'gee-modis-live-raster-source';
    const layerId = 'gee-modis-live-raster-layer';

    const existingSource = this.map.getSource(sourceId) as maplibregl.RasterTileSource;
    if (existingSource) {
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
      this.map.removeSource(sourceId);
    }

    this.map.addSource(sourceId, {
      type: 'raster',
      tiles: [tileUrlTemplate],
      tileSize: 256
    });

    const beforeLayerId = this.map.getLayer('gee-modis-stations-circles') ? 'gee-modis-stations-circles' : undefined;

    this.map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': this.getOpacity(),
        'raster-fade-duration': 300
      }
    }, beforeLayerId);
  }

  private removeLiveRasterLayer() {
    if (!this.map || !this.map.getStyle()) return;
    const layerId = 'gee-modis-live-raster-layer';
    const sourceId = 'gee-modis-live-raster-source';

    if (this.map.getLayer(layerId)) {
      this.map.removeLayer(layerId);
    }
    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId);
    }
  }

  public isLayerActive(layerId: string): boolean {
    const key = this.normalizeLayerId(layerId);
    return this.activeLayers.has(key) || this.activeLayers.has(layerId);
  }

  public isLayerVisible(layerId: string): boolean {
    const key = this.normalizeLayerId(layerId);
    return (this.activeLayers.has(key) || this.activeLayers.has(layerId)) &&
      (this.layerVisibilities.get(key) ?? this.layerVisibilities.get(layerId) ?? true);
  }

  public setLayerVisible(layerId: string, visible: boolean) {
    const key = this.normalizeLayerId(layerId);
    this.layerVisibilities.set(key, visible);
    this.layerVisibilities.set(layerId, visible);
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  public async toggleLayer(layerId: string, active: boolean) {
    const key = this.normalizeLayerId(layerId);
    if (active) {
      await this.ensureDataLoaded();
      this.activeLayers.add(key);
      this.activeLayers.add(layerId);
      this.layerVisibilities.set(key, true);
      this.layerVisibilities.set(layerId, true);
    } else {
      this.activeLayers.delete(key);
      this.activeLayers.delete(layerId);
    }

    this.renderAllLayers();
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  public setLayerOpacity(layerId: string, opacity: number) {
    const key = this.normalizeLayerId(layerId);
    this.layerOpacities.set(key, opacity);
    this.layerOpacities.set(layerId, opacity);
    if (!this.map) return;

    if (this.map.getLayer('gee-modis-live-raster-layer')) {
      this.map.setPaintProperty('gee-modis-live-raster-layer', 'raster-opacity', opacity);
    }
    if (this.map.getLayer('gee-modis-lst-day-fill')) {
      this.map.setPaintProperty('gee-modis-lst-day-fill', 'fill-opacity', opacity);
    }
    if (this.map.getLayer('gee-modis-lst-night-fill')) {
      this.map.setPaintProperty('gee-modis-lst-night-fill', 'fill-opacity', opacity);
    }
    this.notifyLayersChange();
  }

  public getLayerOpacity(layerId: string): number {
    const key = this.normalizeLayerId(layerId);
    return this.layerOpacities.get(key) ?? this.layerOpacities.get(layerId) ?? 0.85;
  }

  public setOpacity(opacity: number) {
    ['lst-day', 'lst-night', 'air-temp', 'surface-temp', 'lst', 'elevation', 'landcover'].forEach((id) => this.setLayerOpacity(id, opacity));
  }

  public getOpacity(): number {
    return this.layerOpacities.get('lst-day') ?? 0.85;
  }

  public clearAllLayers() {
    this.activeLayers.clear();
    this.updateLayerVisibilities();
    if (this.popup.isOpen()) {
      this.popup.remove();
    }
    this.notifyLayersChange();
  }

  public async loadGEEDatasets() {
    await this.ensureDataLoaded();
    this.renderAllLayers();
    this.renderHtmlMarkers();

    if (!this.isEventsBound) {
      this.bindLayerEvents();
      this.isEventsBound = true;
    }
  }

  public renderAllLayers() {
    if (!this.map) return;

    if (!this.isDataLoaded) {
      this.ensureDataLoaded().then(() => {
        this.renderAllLayers();
        this.renderHtmlMarkers();
      });
      return;
    }

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.renderAllLayers());
      return;
    }

    const isDayActive = this.isLayerActive('lst-day') || this.isLayerActive('air-temp') || this.isLayerActive('lst');
    const isNightActive = this.isLayerActive('lst-night') || this.isLayerActive('surface-temp') || this.isLayerActive('elevation');
    const isStationsActive = this.isLayerActive('stations') || this.isLayerActive('poi');

    const isDayVis = isDayActive && (this.layerVisibilities.get('lst-day') ?? true);
    const isNightVis = isNightActive && (this.layerVisibilities.get('lst-night') ?? true);
    const isStationsVis = isStationsActive && (this.layerVisibilities.get('stations') ?? true);

    // --- 1. CRISP GPU-RENDERED MODIS DAYTIME LST (1 KM) ---
    try {
      if (isDayActive) {
        const gridSrc = this.map.getSource('gee-modis-grid-source') as maplibregl.GeoJSONSource;
        if (!gridSrc) {
          this.map.addSource('gee-modis-grid-source', {
            type: 'geojson',
            data: this.gridData
          });
        } else if (typeof gridSrc.setData === 'function') {
          gridSrc.setData(this.gridData);
        }

        if (!this.map.getLayer('gee-modis-lst-day-fill')) {
          this.map.addLayer({
            id: 'gee-modis-lst-day-fill',
            type: 'fill',
            source: 'gee-modis-grid-source',
            layout: { visibility: isDayVis ? 'visible' : 'none' },
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'lst_day_c']], 30],
                4, '#000080',  // Alpine Glacial (<5°C Puncak Jaya)
                10, '#0000d9', // High Alpine (10°C)
                16, '#0080ff', // Highland Alpine (16°C)
                22, '#00ffff', // Mild Highlands (Bandung, Dieng ~22°C)
                26, '#00ff80', // Forest / Plateau (26°C)
                29, '#ffff00', // Lowland Plains (29°C)
                32, '#ffb000', // Warm Lowlands (32°C)
                35, '#ff4100', // Hot Urban Lowlands (Jakarta, Surabaya ~35°C)
                38, '#d40000', // Extreme Urban Pavement Heat (38°C)
                42, '#380000'  // Peak Thermal Hotspot (42°C+)
              ],
              'fill-opacity': this.getLayerOpacity('lst-day'),
              'fill-antialias': true
            }
          });
        } else {
          this.map.setLayoutProperty('gee-modis-lst-day-fill', 'visibility', isDayVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-modis-lst-day-fill')) {
          this.map.setLayoutProperty('gee-modis-lst-day-fill', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding MODIS Daytime LST layer:', e);
    }

    // --- 2. CRISP GPU-RENDERED MODIS NIGHTTIME LST (1 KM) ---
    try {
      if (isNightActive) {
        const gridSrc = this.map.getSource('gee-modis-grid-source') as maplibregl.GeoJSONSource;
        if (!gridSrc) {
          this.map.addSource('gee-modis-grid-source', {
            type: 'geojson',
            data: this.gridData
          });
        }

        if (!this.map.getLayer('gee-modis-lst-night-fill')) {
          this.map.addLayer({
            id: 'gee-modis-lst-night-fill',
            type: 'fill',
            source: 'gee-modis-grid-source',
            layout: { visibility: isNightVis ? 'visible' : 'none' },
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'lst_night_c']], 22],
                -6, '#000040', // Alpine Subzero (Puncak Jaya Night)
                0, '#0000b0',  // Freezing Peak
                8, '#0080ff',  // Mountain Cold Pool (8°C)
                14, '#00ffff', // Highland Night (Bandung ~14°C)
                19, '#00ff80', // Forest Night (19°C)
                22, '#ffff00', // Coastal / Rural Night (22°C)
                25, '#ff7400', // Urban Night Heat Island (Jakarta ~25°C)
                28, '#fe0100'  // Warm Tropical Urban Night (28°C)
              ],
              'fill-opacity': this.getLayerOpacity('lst-night'),
              'fill-antialias': true
            }
          });
        } else {
          this.map.setLayoutProperty('gee-modis-lst-night-fill', 'visibility', isNightVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-modis-lst-night-fill')) {
          this.map.setLayoutProperty('gee-modis-lst-night-fill', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding MODIS Nighttime LST layer:', e);
    }

    // --- 3. MODIS LST MONITORING STATIONS (18 NODES) ---
    try {
      if (isStationsActive) {
        const stationsSrc = this.map.getSource('gee-modis-stations-source') as maplibregl.GeoJSONSource;
        if (!stationsSrc) {
          this.map.addSource('gee-modis-stations-source', {
            type: 'geojson',
            data: this.stationsData
          });
        } else if (typeof stationsSrc.setData === 'function') {
          stationsSrc.setData(this.stationsData);
        }

        if (!this.map.getLayer('gee-modis-stations-circles')) {
          this.map.addLayer({
            id: 'gee-modis-stations-circles',
            type: 'circle',
            source: 'gee-modis-stations-source',
            layout: { visibility: isStationsVis ? 'visible' : 'none' },
            paint: {
              'circle-radius': 12,
              'circle-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'lst_day_c']], 30],
                10, '#0080ff',
                22, '#00ffff',
                28, '#00ff80',
                32, '#ffff00',
                36, '#fe0100'
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff'
            }
          });
        } else {
          this.map.setLayoutProperty('gee-modis-stations-circles', 'visibility', isStationsVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-modis-stations-circles')) {
          this.map.setLayoutProperty('gee-modis-stations-circles', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding MODIS Stations layer:', e);
    }
  }

  public renderHtmlMarkers() {
    if (!this.map) return;

    this.htmlMarkers.forEach((m) => m.remove());
    this.htmlMarkers = [];

    const isStationsVis = this.isLayerVisible('stations') || this.isLayerVisible('poi');

    this.stationsData.features.forEach((feat: any) => {
      const coords = feat.geometry.coordinates as [number, number];
      const props = feat.properties;

      const el = document.createElement('div');
      el.className = `gee-map-marker station-${props.id}`;
      el.innerHTML = `
        <div class="marker-pulse"></div>
        <div class="marker-pin">
          <span class="marker-icon">🌡️</span>
        </div>
        <div class="marker-label">${props.name.split(' (')[0]}: ${props.lst_day_c ?? props.temp_air_c}°C</div>
      `;

      el.addEventListener('click', () => {
        const html = `
          <div class="gee-popup-card">
            <div class="gee-popup-badge live-badge">● MODIS TERRA & AQUA LST</div>
            <h4>${props.name}</h4>
            <div class="gee-popup-sub">${props.province} · ${props.station_type}</div>
            <table class="gee-popup-table">
              <tr><td><strong>Daytime LST (1km):</strong></td><td><span class="highlight-temp">${props.lst_day_c} °C</span> (${props.lst_day_k} K)</td></tr>
              <tr><td><strong>Nighttime LST (1km):</strong></td><td><strong>${props.lst_night_c} °C</strong> (${props.lst_night_k} K)</td></tr>
              <tr><td><strong>24h Mean LST:</strong></td><td>${props.lst_mean_c} °C</td></tr>
              <tr><td><strong>Diurnal ΔT (Day-Night):</strong></td><td><span style="color: #f97316; font-weight: 600;">+${props.diurnal_delta_c} °C</span></td></tr>
              <tr><td><strong>QA Validation:</strong></td><td><span style="color: #10b981;">✓ ${props.qa_quality_score}</span></td></tr>
              <tr><td><strong>Ground Elevation:</strong></td><td>${props.elevation_m} meters</td></tr>
              <tr><td><strong>Dataset DOI:</strong></td><td><code>MODIS/061/MOD11A1+MYD11A1</code></td></tr>
            </table>
          </div>
        `;
        this.popup.setLngLat(coords).setHTML(html).addTo(this.map);
      });

      if (!isStationsVis) {
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

    const isDayVis = this.isLayerVisible('lst-day') || this.isLayerVisible('air-temp') || this.isLayerVisible('lst');
    const isNightVis = this.isLayerVisible('lst-night') || this.isLayerVisible('surface-temp') || this.isLayerVisible('elevation');
    const isStationsVis = this.isLayerVisible('stations') || this.isLayerVisible('poi');

    if (this.map.getLayer('gee-modis-lst-day-fill')) {
      this.map.setLayoutProperty('gee-modis-lst-day-fill', 'visibility', isDayVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-lst-night-fill')) {
      this.map.setLayoutProperty('gee-modis-lst-night-fill', 'visibility', isNightVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-stations-circles')) {
      this.map.setLayoutProperty('gee-modis-stations-circles', 'visibility', isStationsVis ? 'visible' : 'none');
    }

    this.htmlMarkers.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.display = isStationsVis ? 'flex' : 'none';
    });
  }

  private bindLayerEvents() {
    // Click on thermal surface for point inspector
    this.map.on('click', 'gee-modis-lst-day-fill', async (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const lngLat = e.lngLat;

      const html = `
        <div class="gee-popup-card">
          <div class="gee-popup-badge live-badge">● MODIS LST (1 KM)</div>
          <h4>🌡️ Land Surface Temperature</h4>
          <div class="gee-popup-sub">Location: ${lngLat.lat.toFixed(4)}°, ${lngLat.lng.toFixed(4)}°</div>
          <table class="gee-popup-table">
            <tr><td><strong>Daytime LST:</strong></td><td><span class="highlight-temp">${props.lst_day_c ?? props.temp_air_c} °C</span> (${round((props.lst_day_c ?? props.temp_air_c) + 273.15, 2)} K)</td></tr>
            <tr><td><strong>Nighttime LST:</strong></td><td><strong>${props.lst_night_c ?? props.temp_surface_c} °C</strong></td></tr>
            <tr><td><strong>24h Mean LST:</strong></td><td>${props.lst_mean_c ?? '28.0'} °C</td></tr>
            <tr><td><strong>Diurnal ΔT (UHI):</strong></td><td><span style="color: #f97316; font-weight: 600;">+${props.delta_uhi_c ?? '9.5'} °C</span></td></tr>
            <tr><td><strong>Elevation ASL:</strong></td><td>${props.elevation_m} meters</td></tr>
            <tr><td><strong>Dataset Source:</strong></td><td><code>MODIS/061/MOD11A1+MYD11A1 (1km)</code></td></tr>
          </table>
        </div>
      `;

      this.popup
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(this.map);
    });

    ['gee-modis-lst-day-fill', 'gee-modis-lst-night-fill', 'gee-modis-stations-circles'].forEach((layerId) => {
      this.map.on('mouseenter', layerId, () => (this.map.getCanvas().style.cursor = 'pointer'));
      this.map.on('mouseleave', layerId, () => (this.map.getCanvas().style.cursor = ''));
    });
  }

  public flyToStudyArea() {
    this.map.flyTo({
      center: [108.5, -6.8],
      zoom: 7.2,
      pitch: 0,
      bearing: 0,
      duration: 1500
    });
  }

  public flyToIndonesia() {
    this.map.flyTo({
      center: [117.5, -2.5],
      zoom: 4.8,
      pitch: 0,
      bearing: 0,
      duration: 1800
    });
  }

  public restoreAfterStyleChange() {
    this.renderAllLayers();
    this.renderHtmlMarkers();
  }

  public getMap(): maplibregl.Map {
    return this.map;
  }
}

function round(val: number, decimals: number): number {
  return Number(Math.round(Number(val + 'e' + decimals)) + 'e-' + decimals);
}
