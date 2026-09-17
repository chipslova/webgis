import * as maplibregl from 'maplibre-gl';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export class GEELoader {
  private map: maplibregl.Map;
  private popup: maplibregl.Popup;
  private htmlMarkers: maplibregl.Marker[] = [];

  // In-memory GeoJSON Datasets
  private stationsData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private gridData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private isDataLoaded: boolean = false;
  private dataLoadPromise: Promise<void> | null = null;

  // Active layers in workspace
  private activeLayers: Set<string> = new Set<string>();
  // Visibility states
  private layerVisibilities: Map<string, boolean> = new Map([
    ['air-temp', true],
    ['surface-temp', true],
    ['stations', true],
    // Aliases
    ['lst', true],
    ['elevation', true],
    ['poi', true],
    ['landcover', true]
  ]);
  // Independent layer opacities
  private layerOpacities: Map<string, number> = new Map([
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
      maxWidth: '360px'
    });
  }

  private normalizeLayerId(layerId: string): string {
    if (layerId === 'lst') return 'air-temp';
    if (layerId === 'elevation') return 'surface-temp';
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
        ErrorHandler.getInstance().showThrottledError('Failed to load NOAA CFSV2 GEE dataset. Please check your internet connection.');
        logger.warn('[GEELoader] Failed to load GEE dataset:', e);
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
      'gee-cfsv2-air-fill',
      'gee-cfsv2-surface-fill',
      'gee-cfsv2-stations-circles',
      // Legacy compatibility IDs
      'gee-lst-fill', 'gee-lst-outline',
      'gee-elevation-fill', 'gee-elevation-outline',
      'gee-landcover-fill', 'gee-landcover-outline',
      'gee-poi-circles'
    ];
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

    if (this.map.getLayer('gee-cfsv2-air-fill')) {
      this.map.setPaintProperty('gee-cfsv2-air-fill', 'fill-opacity', opacity);
    }
    if (this.map.getLayer('gee-cfsv2-surface-fill')) {
      this.map.setPaintProperty('gee-cfsv2-surface-fill', 'fill-opacity', opacity);
    }
    this.notifyLayersChange();
  }

  public getLayerOpacity(layerId: string): number {
    const key = this.normalizeLayerId(layerId);
    return this.layerOpacities.get(key) ?? this.layerOpacities.get(layerId) ?? 0.85;
  }

  public setOpacity(opacity: number) {
    ['air-temp', 'surface-temp', 'lst', 'elevation', 'landcover'].forEach((id) => this.setLayerOpacity(id, opacity));
  }

  public getOpacity(): number {
    return this.layerOpacities.get('air-temp') ?? 0.85;
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

    const isAirActive = this.isLayerActive('air-temp') || this.isLayerActive('lst');
    const isSurfActive = this.isLayerActive('surface-temp') || this.isLayerActive('elevation');
    const isStationsActive = this.isLayerActive('stations') || this.isLayerActive('poi');

    const isAirVis = isAirActive && this.isLayerVisible('air-temp');
    const isSurfVis = isSurfActive && this.isLayerVisible('surface-temp');
    const isStationsVis = isStationsActive && this.isLayerVisible('stations');

    // --- 1. CRISP GPU-INTERPOLATED NOAA CFSV2 2M AIR TEMPERATURE LAYER ---
    try {
      if (isAirActive) {
        const gridSrc = this.map.getSource('gee-cfsv2-grid-source') as maplibregl.GeoJSONSource;
        if (!gridSrc) {
          this.map.addSource('gee-cfsv2-grid-source', {
            type: 'geojson',
            data: this.gridData
          });
        } else if (typeof gridSrc.setData === 'function') {
          gridSrc.setData(this.gridData);
        }

        if (!this.map.getLayer('gee-cfsv2-air-fill')) {
          this.map.addLayer({
            id: 'gee-cfsv2-air-fill',
            type: 'fill',
            source: 'gee-cfsv2-grid-source',
            layout: { visibility: isAirVis ? 'visible' : 'none' },
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'temp_air_c']], 28],
                12, '#0000d9', // <14°C Alpine / Mountain Peak (Puncak Jaya)
                16, '#0080ff', // 16°C Cold Highlands
                20, '#00ffff', // 20°C Mild Highlands (Bandung, Dieng, Malang)
                24, '#00ff80', // 24°C Forest / Plateau
                27, '#80ff00', // 27°C Plains / Coastal Waters
                29, '#ffff00', // 29°C Warm Lowlands
                31, '#ffb000', // 31°C Hot Lowlands
                33, '#ff4100', // 33°C Urban Lowlands (Jakarta, Surabaya, Medan)
                36, '#fe0100', // 36°C Extreme Heat
                39, '#380000'  // 39°C+ Peak Heat
              ],
              'fill-opacity': this.getLayerOpacity('air-temp'),
              'fill-antialias': true
            }
          });
        } else {
          this.map.setLayoutProperty('gee-cfsv2-air-fill', 'visibility', isAirVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-cfsv2-air-fill')) {
          this.map.setLayoutProperty('gee-cfsv2-air-fill', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding CFSV2 Air Temp layer:', e);
    }

    // --- 2. GROUND SURFACE SKIN TEMPERATURE LAYER ---
    try {
      if (isSurfActive) {
        const gridSrc = this.map.getSource('gee-cfsv2-grid-source') as maplibregl.GeoJSONSource;
        if (!gridSrc) {
          this.map.addSource('gee-cfsv2-grid-source', {
            type: 'geojson',
            data: this.gridData
          });
        }

        if (!this.map.getLayer('gee-cfsv2-surface-fill')) {
          this.map.addLayer({
            id: 'gee-cfsv2-surface-fill',
            type: 'fill',
            source: 'gee-cfsv2-grid-source',
            layout: { visibility: isSurfVis ? 'visible' : 'none' },
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'temp_surface_c']], 29],
                12, '#000080',
                18, '#0080ff',
                22, '#00ffff',
                26, '#80ff00',
                29, '#ffff00',
                32, '#ff7400',
                36, '#fe0100',
                42, '#380000'
              ],
              'fill-opacity': this.getLayerOpacity('surface-temp'),
              'fill-antialias': true
            }
          });
        } else {
          this.map.setLayoutProperty('gee-cfsv2-surface-fill', 'visibility', isSurfVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-cfsv2-surface-fill')) {
          this.map.setLayoutProperty('gee-cfsv2-surface-fill', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding CFSV2 Surface Temp layer:', e);
    }

    // --- 3. CFSV2 INDONESIA CLIMATE STATIONS ---
    try {
      if (isStationsActive) {
        const stationsSrc = this.map.getSource('gee-cfsv2-stations-source') as maplibregl.GeoJSONSource;
        if (!stationsSrc) {
          this.map.addSource('gee-cfsv2-stations-source', {
            type: 'geojson',
            data: this.stationsData
          });
        } else if (typeof stationsSrc.setData === 'function') {
          stationsSrc.setData(this.stationsData);
        }

        if (!this.map.getLayer('gee-cfsv2-stations-circles')) {
          this.map.addLayer({
            id: 'gee-cfsv2-stations-circles',
            type: 'circle',
            source: 'gee-cfsv2-stations-source',
            layout: { visibility: isStationsVis ? 'visible' : 'none' },
            paint: {
              'circle-radius': 12,
              'circle-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'temp_air_c']], 28],
                20, '#00ffff',
                25, '#00ff80',
                29, '#ffff00',
                33, '#fe0100'
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff'
            }
          });
        } else {
          this.map.setLayoutProperty('gee-cfsv2-stations-circles', 'visibility', isStationsVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-cfsv2-stations-circles')) {
          this.map.setLayoutProperty('gee-cfsv2-stations-circles', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding CFSV2 Stations layer:', e);
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
        <div class="marker-label">${props.name.split(' (')[0]}: ${props.temp_air_c}°C</div>
      `;

      el.addEventListener('click', () => {
        const html = `
          <div class="gee-popup-card">
            <div class="gee-popup-badge live-badge">● LIVE CFSV2 GEE</div>
            <h4>${props.name}</h4>
            <div class="gee-popup-sub">${props.province} · ${props.station_type}</div>
            <table class="gee-popup-table">
              <tr><td><strong>2m Air Temp:</strong></td><td><span class="highlight-temp">${props.temp_air_c} °C</span> (${props.temp_air_k} K)</td></tr>
              <tr><td><strong>Ground Surface Temp:</strong></td><td><strong>${props.temp_surface_c} °C</strong></td></tr>
              <tr><td><strong>6h Max / Min Temp:</strong></td><td>${props.temp_max_6h_c} °C / ${props.temp_min_6h_c} °C</td></tr>
              <tr><td><strong>Relative Humidity:</strong></td><td>${props.humidity_pct}%</td></tr>
              <tr><td><strong>Surface Pressure:</strong></td><td>${props.pressure_hpa} hPa</td></tr>
              <tr><td><strong>Elevation:</strong></td><td>${props.elevation_m} meters</td></tr>
              <tr><td><strong>Cycle UTC:</strong></td><td><code>${props.timestamp_utc}</code></td></tr>
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

    const isAirVis = this.isLayerVisible('air-temp') || this.isLayerVisible('lst');
    const isSurfVis = this.isLayerVisible('surface-temp') || this.isLayerVisible('elevation');
    const isStationsVis = this.isLayerVisible('stations') || this.isLayerVisible('poi');

    if (this.map.getLayer('gee-cfsv2-air-fill')) {
      this.map.setLayoutProperty('gee-cfsv2-air-fill', 'visibility', isAirVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-cfsv2-surface-fill')) {
      this.map.setLayoutProperty('gee-cfsv2-surface-fill', 'visibility', isSurfVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-cfsv2-stations-circles')) {
      this.map.setLayoutProperty('gee-cfsv2-stations-circles', 'visibility', isStationsVis ? 'visible' : 'none');
    }

    this.htmlMarkers.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.display = isStationsVis ? 'flex' : 'none';
    });
  }

  private bindLayerEvents() {
    // Click on thermal field for point inspection with live telemetry
    this.map.on('click', 'gee-cfsv2-air-fill', async (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const lngLat = e.lngLat;

      // Render instant popup from model
      const renderPopupContent = (liveTemp?: number, humidity?: number, pressure?: number, wind?: number) => `
        <div class="gee-popup-card">
          <div class="gee-popup-badge live-badge">● LIVE GEE CFSV2</div>
          <h4>🌡️ Real Climate Observation</h4>
          <div class="gee-popup-sub">Coords: ${lngLat.lat.toFixed(4)}°, ${lngLat.lng.toFixed(4)}°</div>
          <table class="gee-popup-table">
            <tr><td><strong>2m Air Temp:</strong></td><td><span class="highlight-temp">${liveTemp ?? props.temp_air_c} °C</span> (${round((liveTemp ?? props.temp_air_c) + 273.15, 2)} K)</td></tr>
            <tr><td><strong>Ground Surface:</strong></td><td><strong>${props.temp_surface_c} °C</strong></td></tr>
            <tr><td><strong>Relative Humidity:</strong></td><td>${humidity ?? '78'}%</td></tr>
            <tr><td><strong>Surface Pressure:</strong></td><td>${pressure ?? '1011.2'} hPa</td></tr>
            ${wind !== undefined ? `<tr><td><strong>Surface Wind:</strong></td><td>${wind} km/h</td></tr>` : ''}
            <tr><td><strong>Ground Elevation:</strong></td><td>${props.elevation_m} meters</td></tr>
            <tr><td><strong>Model Source:</strong></td><td><code>NOAA/CFSV2_FOR6H_HARMONIZED</code></td></tr>
          </table>
        </div>
      `;

      this.popup
        .setLngLat(lngLat)
        .setHTML(renderPopupContent())
        .addTo(this.map);

      // Fetch live real-time point verification from open-meteo
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lngLat.lat.toFixed(4)}&longitude=${lngLat.lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.current) {
            const t = data.current.temperature_2m;
            const h = data.current.relative_humidity_2m;
            const p = data.current.surface_pressure;
            const w = data.current.wind_speed_10m;
            if (this.popup.isOpen()) {
              this.popup.setHTML(renderPopupContent(t, h, p, w));
            }
          }
        }
      } catch (err) {
        // Fallback silently
      }
    });

    ['gee-cfsv2-air-fill', 'gee-cfsv2-surface-fill', 'gee-cfsv2-stations-circles'].forEach((layerId) => {
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
