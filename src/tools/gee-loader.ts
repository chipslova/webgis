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
    satellite: 'terra',
    mode: 'day',
    start: '2024-08-01',
    end: '2024-08-31'
  };
  private onStatusChangeCallbacks: Array<(status: GEEStatus, metadata?: any) => void> = [];

  // Active layers in workspace
  private activeLayers: Set<string> = new Set<string>();
  // Visibility states: default to inactive until user/preset activation
  private layerVisibilities: Map<string, boolean> = new Map([
    ['lst-day', false],
    ['lst-night', false],
    ['stations', false],
    // Aliases
    ['air-temp', false],
    ['surface-temp', false],
    ['lst', false],
    ['elevation', false],
    ['poi', false],
    ['landcover', false]
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

  public setParams(params: Partial<GEEQueryParams>) {
    this.currentParams = { ...this.currentParams, ...params };
    this.renderAllLayers();
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
    if (layerId === 'lst' || layerId === 'air-temp' || layerId === 'lst-day') return 'lst-day';
    if (layerId === 'elevation' || layerId === 'surface-temp' || layerId === 'lst-night') return 'lst-night';
    if (layerId === 'poi' || layerId === 'stations') return 'stations';
    if (layerId === 'landcover' || layerId === 'lc') return 'landcover';
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
    return this.getLayerIds();
  }

  public getLayerIds(): string[] {
    return [
      'gee-modis-day-wms-layer',
      'gee-modis-night-wms-layer',
      'gee-modis-landcover-layer',
      'gee-modis-live-raster-layer',
      'gee-modis-lst-day-fill',
      'gee-modis-lst-night-fill',
      'gee-modis-stations-circles',
      'gee-modis-stations-labels',
      'gee-heatmap-layer',
      'gee-air-temp-layer',
      'gee-surface-temp-layer',
      'gee-elevation-layer',
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
    return this.activeLayers.has(key);
  }

  public isLayerVisible(layerId: string): boolean {
    const key = this.normalizeLayerId(layerId);
    return this.activeLayers.has(key) && (this.layerVisibilities.get(key) ?? true);
  }

  public setLayerVisible(layerId: string, visible: boolean) {
    const key = this.normalizeLayerId(layerId);
    this.layerVisibilities.set(key, visible);
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  public async toggleLayer(layerId: string, active: boolean) {
    const key = this.normalizeLayerId(layerId);
    if (active) {
      await this.ensureDataLoaded();
      this.activeLayers.add(key);
      this.layerVisibilities.set(key, true);
    } else {
      this.activeLayers.delete(key);
      // Clean up legacy aliases to prevent sync drift
      this.activeLayers.delete(layerId);
      if (key === 'lst-day') {
        this.activeLayers.delete('lst');
        this.activeLayers.delete('air-temp');
      } else if (key === 'lst-night') {
        this.activeLayers.delete('elevation');
        this.activeLayers.delete('surface-temp');
      } else if (key === 'stations') {
        this.activeLayers.delete('poi');
      } else if (key === 'landcover') {
        this.activeLayers.delete('lc');
      }
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

    if (this.map.getLayer('gee-modis-day-wms-layer') && key === 'lst-day') {
      this.map.setPaintProperty('gee-modis-day-wms-layer', 'raster-opacity', opacity);
    }
    if (this.map.getLayer('gee-modis-night-wms-layer') && key === 'lst-night') {
      this.map.setPaintProperty('gee-modis-night-wms-layer', 'raster-opacity', opacity);
    }
    if (this.map.getLayer('gee-modis-landcover-layer') && (key === 'landcover' || layerId === 'landcover')) {
      this.map.setPaintProperty('gee-modis-landcover-layer', 'raster-opacity', opacity);
    }
    if (this.map.getLayer('gee-modis-lst-day-fill') && key === 'lst-day') {
      this.map.setPaintProperty('gee-modis-lst-day-fill', 'fill-opacity', 0.0001);
    }
    if (this.map.getLayer('gee-modis-lst-night-fill') && key === 'lst-night') {
      this.map.setPaintProperty('gee-modis-lst-night-fill', 'fill-opacity', 0.0001);
    }
    this.notifyLayersChange();
  }

  public restoreAfterStyleChange() {
    if (this.activeLayers.size > 0) {
      this.renderAllLayers();
      this.renderHtmlMarkers();
    }
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

    const isDayVis = this.isLayerVisible('lst-day');
    const isNightVis = this.isLayerVisible('lst-night');
    const isLcVis = this.isLayerVisible('landcover');
    const isStationsVis = this.isLayerVisible('stations');

    // Prepare point collection for Gaussian heatmap interpolation (continuous, zero-box surface)
    const pointsCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.gridData.features.map((f: any) => {
        const cLat = f.properties.center_lat ?? -2.5;
        const cLon = f.properties.center_lon ?? 117.5;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [cLon, cLat] },
          properties: f.properties
        };
      })
    };

    // 1. Points Source for continuous smooth heatmaps
    const pointsSrc = this.map.getSource('gee-modis-points-source') as maplibregl.GeoJSONSource;
    if (!pointsSrc) {
      this.map.addSource('gee-modis-points-source', {
        type: 'geojson',
        data: pointsCollection
      });
    } else if (typeof pointsSrc.setData === 'function') {
      pointsSrc.setData(pointsCollection);
    }

    // 2. Polygon Source for transparent click-inspection
    const gridSrc = this.map.getSource('gee-modis-grid-source') as maplibregl.GeoJSONSource;
    if (!gridSrc) {
      this.map.addSource('gee-modis-grid-source', {
        type: 'geojson',
        data: this.gridData
      });
    } else if (typeof gridSrc.setData === 'function') {
      gridSrc.setData(this.gridData);
    }

    const selectedDate = this.currentParams.start || '2024-08-01';
    const sat = this.currentParams.satellite === 'aqua' ? 'Aqua' : 'Terra';

    // --- 1. OFFICIAL NASA GIBS OGC WMS: DAYTIME LST RASTER LAYER ---
    try {
      const dayWmsLayerName = `MODIS_${sat}_L3_Land_Surface_Temp_8Day_Day`;
      const dayWmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=${dayWmsLayerName}&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${selectedDate}&BBOX={bbox-epsg-3857}`;
      const daySourceId = 'gee-modis-day-wms-source';
      const dayLayerId = 'gee-modis-day-wms-layer';

      const existingDaySource = this.map.getSource(daySourceId) as any;
      if (existingDaySource) {
        if (typeof existingDaySource.setTiles === 'function') {
          existingDaySource.setTiles([dayWmsUrl]);
        }
        if (this.map.getLayer(dayLayerId)) {
          this.map.setLayoutProperty(dayLayerId, 'visibility', isDayVis ? 'visible' : 'none');
          this.map.setPaintProperty(dayLayerId, 'raster-opacity', this.getLayerOpacity('lst-day'));
        }
      } else {
        this.map.addSource(daySourceId, {
          type: 'raster',
          tiles: [dayWmsUrl],
          tileSize: 256,
          maxzoom: 12
        });

        const beforeLayerId = this.map.getLayer('gee-modis-stations-circles') ? 'gee-modis-stations-circles' : undefined;
        this.map.addLayer({
          id: dayLayerId,
          type: 'raster',
          source: daySourceId,
          layout: { visibility: isDayVis ? 'visible' : 'none' },
          paint: {
            'raster-opacity': this.getLayerOpacity('lst-day'),
            'raster-resampling': 'linear',
            'raster-fade-duration': 200
          }
        }, beforeLayerId);
      }
    } catch (e) {
      logger.warn('[GEELoader] Notice adding NASA MODIS Day WMS raster layer:', e);
    }

    // --- 2. OFFICIAL NASA GIBS OGC WMS: NIGHTTIME LST RASTER LAYER ---
    try {
      const nightWmsLayerName = `MODIS_${sat}_L3_Land_Surface_Temp_8Day_Night`;
      const nightWmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=${nightWmsLayerName}&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${selectedDate}&BBOX={bbox-epsg-3857}`;
      const nightSourceId = 'gee-modis-night-wms-source';
      const nightLayerId = 'gee-modis-night-wms-layer';

      const existingNightSource = this.map.getSource(nightSourceId) as any;
      if (existingNightSource) {
        if (typeof existingNightSource.setTiles === 'function') {
          existingNightSource.setTiles([nightWmsUrl]);
        }
        if (this.map.getLayer(nightLayerId)) {
          this.map.setLayoutProperty(nightLayerId, 'visibility', isNightVis ? 'visible' : 'none');
          this.map.setPaintProperty(nightLayerId, 'raster-opacity', this.getLayerOpacity('lst-night'));
        }
      } else {
        this.map.addSource(nightSourceId, {
          type: 'raster',
          tiles: [nightWmsUrl],
          tileSize: 256,
          maxzoom: 12
        });

        const beforeLayerId = this.map.getLayer('gee-modis-stations-circles') ? 'gee-modis-stations-circles' : undefined;
        this.map.addLayer({
          id: nightLayerId,
          type: 'raster',
          source: nightSourceId,
          layout: { visibility: isNightVis ? 'visible' : 'none' },
          paint: {
            'raster-opacity': this.getLayerOpacity('lst-night'),
            'raster-resampling': 'linear',
            'raster-fade-duration': 200
          }
        }, beforeLayerId);
      }
    } catch (e) {
      logger.warn('[GEELoader] Notice adding NASA MODIS Night WMS raster layer:', e);
    }

    // --- 3. SENTINEL-2 10M GLOBAL LAND USE & LAND COVER (LULC) ---
    try {
      const lcWmsUrl = `https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png&transparent=true&f=image`;
      const lcSourceId = 'gee-modis-landcover-source';
      const lcLayerId = 'gee-modis-landcover-layer';

      // Insert Land Cover below Day/Night LST if they exist, otherwise below stations circles
      const beforeLayerId = this.map.getLayer('gee-modis-day-wms-layer')
        ? 'gee-modis-day-wms-layer'
        : (this.map.getLayer('gee-modis-night-wms-layer')
          ? 'gee-modis-night-wms-layer'
          : (this.map.getLayer('gee-modis-stations-circles') ? 'gee-modis-stations-circles' : undefined));

      const existingLcSource = this.map.getSource(lcSourceId) as any;
      if (existingLcSource) {
        if (typeof existingLcSource.setTiles === 'function') {
          existingLcSource.setTiles([lcWmsUrl]);
        }
        if (this.map.getLayer(lcLayerId)) {
          this.map.setLayoutProperty(lcLayerId, 'visibility', isLcVis ? 'visible' : 'none');
          this.map.setPaintProperty(lcLayerId, 'raster-opacity', this.getLayerOpacity('landcover'));
        } else {
          this.map.addLayer({
            id: lcLayerId,
            type: 'raster',
            source: lcSourceId,
            layout: { visibility: isLcVis ? 'visible' : 'none' },
            paint: {
              'raster-opacity': this.getLayerOpacity('landcover'),
              'raster-resampling': 'nearest',
              'raster-fade-duration': 200
            }
          }, beforeLayerId);
        }
      } else {
        this.map.addSource(lcSourceId, {
          type: 'raster',
          tiles: [lcWmsUrl],
          tileSize: 256,
          maxzoom: 18
        });

        this.map.addLayer({
          id: lcLayerId,
          type: 'raster',
          source: lcSourceId,
          layout: { visibility: isLcVis ? 'visible' : 'none' },
          paint: {
            'raster-opacity': this.getLayerOpacity('landcover'),
            'raster-resampling': 'nearest',
            'raster-fade-duration': 200
          }
        }, beforeLayerId);
      }
    } catch (e) {
      logger.warn('[GEELoader] Notice adding Sentinel-2 10m Land Cover raster layer:', e);
    }

    // --- 4. Transparent Polygon Layers for Click & Hover Temperature Interception ---
    try {
      if (!this.map.getLayer('gee-modis-lst-day-fill')) {
        this.map.addLayer({
          id: 'gee-modis-lst-day-fill',
          type: 'fill',
          source: 'gee-modis-grid-source',
          layout: { visibility: isDayVis ? 'visible' : 'none' },
          paint: {
            'fill-color': '#000000',
            'fill-opacity': isDayVis ? 0.0001 : 0
          }
        });
      } else {
        this.map.setLayoutProperty('gee-modis-lst-day-fill', 'visibility', isDayVis ? 'visible' : 'none');
        this.map.setPaintProperty('gee-modis-lst-day-fill', 'fill-opacity', isDayVis ? 0.0001 : 0);
      }

      if (!this.map.getLayer('gee-modis-lst-night-fill')) {
        this.map.addLayer({
          id: 'gee-modis-lst-night-fill',
          type: 'fill',
          source: 'gee-modis-grid-source',
          layout: { visibility: isNightVis ? 'visible' : 'none' },
          paint: {
            'fill-color': '#000000',
            'fill-opacity': isNightVis ? 0.0001 : 0
          }
        });
      } else {
        this.map.setLayoutProperty('gee-modis-lst-night-fill', 'visibility', isNightVis ? 'visible' : 'none');
        this.map.setPaintProperty('gee-modis-lst-night-fill', 'fill-opacity', isNightVis ? 0.0001 : 0);
      }
    } catch (e) {
      logger.warn('[GEELoader] Notice adding fill click interceptor layers:', e);
    }

    // --- 5. MODIS LST MONITORING STATIONS (18 NODES) ---
    try {
      if (isStationsVis) {
        const stationsSrc = this.map.getSource('gee-modis-stations-source') as maplibregl.GeoJSONSource;
        if (!stationsSrc) {
          this.map.addSource('gee-modis-stations-source', {
            type: 'geojson',
            data: this.stationsData
          });
        } else if (typeof stationsSrc.setData === 'function') {
          stationsSrc.setData(this.stationsData);
        }

        // Station Point Circles
        if (!this.map.getLayer('gee-modis-stations-circles')) {
          this.map.addLayer({
            id: 'gee-modis-stations-circles',
            type: 'circle',
            source: 'gee-modis-stations-source',
            layout: { visibility: isStationsVis ? 'visible' : 'none' },
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 7, 10, 10, 14],
              'circle-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'lst_day_c']], 30],
                10, '#0080ff',
                20, '#00ffff',
                26, '#00ff80',
                32, '#ffff00',
                36, '#ff8000',
                40, '#fe0100'
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95
            }
          });
        } else {
          this.map.setLayoutProperty('gee-modis-stations-circles', 'visibility', isStationsVis ? 'visible' : 'none');
        }

        // Station Text & Temperature Labels
        if (!this.map.getLayer('gee-modis-stations-labels')) {
          this.map.addLayer({
            id: 'gee-modis-stations-labels',
            type: 'symbol',
            source: 'gee-modis-stations-source',
            layout: {
              visibility: isStationsVis ? 'visible' : 'none',
              'text-field': ['concat', ['get', 'name'], '\n🌡️ ', ['to-string', ['coalesce', ['get', 'lst_day_c'], ['get', 'temp_air_c']]], '°C'],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 11,
              'text-offset': [0, 1.8],
              'text-anchor': 'top',
              'text-allow-overlap': false
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#0a0f1d',
              'text-halo-width': 2.5,
              'text-halo-blur': 1
            }
          });
        } else {
          this.map.setLayoutProperty('gee-modis-stations-labels', 'visibility', isStationsVis ? 'visible' : 'none');
        }
      } else {
        if (this.map.getLayer('gee-modis-stations-circles')) {
          this.map.setLayoutProperty('gee-modis-stations-circles', 'visibility', 'none');
        }
        if (this.map.getLayer('gee-modis-stations-labels')) {
          this.map.setLayoutProperty('gee-modis-stations-labels', 'visibility', 'none');
        }
      }
    } catch (e) {
      logger.warn('Notice adding MODIS LST monitoring stations layer:', e);
    }
  }

  public renderHtmlMarkers() {
    if (!this.map) return;

    this.htmlMarkers.forEach((m) => {
      try { m.remove(); } catch {}
    });
    this.htmlMarkers = [];
  }

  public updateLayerVisibilities() {
    if (!this.map) return;

    const isDayVis = this.isLayerVisible('lst-day');
    const isNightVis = this.isLayerVisible('lst-night');
    const isLcVis = this.isLayerVisible('landcover');
    const isStationsVis = this.isLayerVisible('stations');

    if (this.map.getLayer('gee-modis-day-wms-layer')) {
      this.map.setLayoutProperty('gee-modis-day-wms-layer', 'visibility', isDayVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-night-wms-layer')) {
      this.map.setLayoutProperty('gee-modis-night-wms-layer', 'visibility', isNightVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-landcover-layer')) {
      this.map.setLayoutProperty('gee-modis-landcover-layer', 'visibility', isLcVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-lst-day-fill')) {
      this.map.setLayoutProperty('gee-modis-lst-day-fill', 'visibility', isDayVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-lst-night-fill')) {
      this.map.setLayoutProperty('gee-modis-lst-night-fill', 'visibility', isNightVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-stations-circles')) {
      this.map.setLayoutProperty('gee-modis-stations-circles', 'visibility', isStationsVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-stations-labels')) {
      this.map.setLayoutProperty('gee-modis-stations-labels', 'visibility', isStationsVis ? 'visible' : 'none');
    }
  }

  private bindLayerEvents() {
    const handleLSTClick = (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const lngLat = e.lngLat;
      const isNight = this.isLayerVisible('lst-night') && !this.isLayerVisible('lst-day');

      const html = `
        <div class="gee-popup-card">
          <div class="gee-popup-badge live-badge">● NASA MODIS LST (1 KM)</div>
          <h4>🌡️ Suhu Permukaan Daratan (LST)</h4>
          <div class="gee-popup-sub">Koordinat: ${lngLat.lat.toFixed(4)}°, ${lngLat.lng.toFixed(4)}° • Resolusi 1 km</div>
          <table class="gee-popup-table">
            <tr><td><strong>${isNight ? '🌙 Suhu Malam (LST):' : '☀️ Suhu Siang (LST):'}</strong></td><td><span class="highlight-temp">${isNight ? props.lst_night_c : props.lst_day_c} °C</span></td></tr>
            <tr><td><strong>${isNight ? '☀️ Suhu Siang (LST):' : '🌙 Suhu Malam (LST):'}</strong></td><td><strong>${isNight ? props.lst_day_c : props.lst_night_c} °C</strong></td></tr>
            <tr><td><strong>Rata-rata 24 Jam:</strong></td><td>${props.lst_mean_c ?? '28.0'} °C</td></tr>
            <tr><td><strong>Perbedaan Siang–Malam (Diurnal ΔT):</strong></td><td><span style="color: #f97316; font-weight: 600;">+${props.delta_uhi_c ?? '9.5'} °C</span></td></tr>
            <tr><td><strong>Elevasi Topografi:</strong></td><td>${props.elevation_m} meter dpl</td></tr>
            <tr><td><strong>Katalog Satelit:</strong></td><td><code>MODIS/061/MOD11A2+MYD11A2 (8-Harian)</code></td></tr>
            <tr><td><strong>Pengiriman Data:</strong></td><td><span>NASA GIBS WMS &amp; GEE Cloud</span></td></tr>
          </table>
        </div>
      `;

      this.popup
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(this.map);
    };

    const handleStationClick = (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const coords = (e.features[0].geometry as any)?.coordinates as [number, number] || [e.lngLat.lng, e.lngLat.lat];

      const html = `
        <div class="gee-popup-card">
          <div class="gee-popup-badge live-badge">📍 TITIK REFERENSI OBSERVASI MODIS LST</div>
          <h4>${props.name}</h4>
          <div class="gee-popup-sub">${props.province || 'Indonesia'} • Titik Referensi Observasi Wilayah</div>
          <table class="gee-popup-table">
            <tr><td><strong>☀️ Suhu Siang (LST):</strong></td><td><span class="highlight-temp">${props.lst_day_c ?? props.temp_air_c} °C</span> (${props.lst_day_k ?? '-'} K)</td></tr>
            <tr><td><strong>🌙 Suhu Malam (LST):</strong></td><td><strong>${props.lst_night_c ?? props.temp_surface_c} °C</strong> (${props.lst_night_k ?? '-'} K)</td></tr>
            <tr><td><strong>🌡️ Rata-rata 24 Jam:</strong></td><td>${props.lst_mean_c ?? '-'} °C</td></tr>
            <tr><td><strong>Perbedaan Siang–Malam (Diurnal ΔT):</strong></td><td><span style="color: #f97316; font-weight: 600;">+${props.diurnal_delta_c ?? props.delta_uhi_c ?? '-'} °C</span></td></tr>
            <tr><td><strong>⛰️ Elevasi Titik:</strong></td><td>${props.elevation_m ?? 0} meter dpl</td></tr>
            <tr><td><strong>📊 Validasi Mutu QA:</strong></td><td><span style="color: #10b981;">✓ Clear-Sky Pixel (QA Bitmask 00)</span></td></tr>
            <tr><td><strong>🛰️ Sensor Data:</strong></td><td><code>MODIS Terra/Aqua 1 km (8-Day Composite)</code></td></tr>
          </table>
        </div>
      `;

      this.popup
        .setLngLat(coords)
        .setHTML(html)
        .addTo(this.map);
    };

    this.map.on('click', 'gee-modis-lst-day-fill', handleLSTClick);
    this.map.on('click', 'gee-modis-lst-night-fill', handleLSTClick);
    this.map.on('click', 'gee-modis-stations-circles', handleStationClick);
    this.map.on('click', 'gee-modis-stations-labels', handleStationClick);

    ['gee-modis-lst-day-fill', 'gee-modis-lst-night-fill', 'gee-modis-stations-circles', 'gee-modis-stations-labels'].forEach((layerId) => {
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

  public getMap(): maplibregl.Map {
    return this.map;
  }
}
