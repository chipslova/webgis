import * as maplibregl from 'maplibre-gl';
import { logger } from '../utils/logger';
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
  private gridData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private isDataLoaded: boolean = false;

  // Live GEE Serverless state
  private liveTileUrlTemplate: string | null = null;
  private livePrecipTileUrlTemplate: string | null = null;
  private liveLandcoverTileUrlTemplate: string | null = null;
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
    ['precipitation', false],
    // Aliases
    ['air-temp', false],
    ['surface-temp', false],
    ['lst', false],
    ['elevation', false],
    ['poi', false],
    ['landcover', false],
    ['rainfall', false],
    ['curah-hujan', false],
    ['chirps', false],
    ['gpm', false]
  ]);
  // Independent layer opacities
  private layerOpacities: Map<string, number> = new Map([
    ['lst-day', 0.85],
    ['lst-night', 0.85],
    ['air-temp', 0.85],
    ['surface-temp', 0.85],
    ['lst', 0.85],
    ['elevation', 0.85],
    ['landcover', 0.85],
    ['precipitation', 0.85],
    ['rainfall', 0.85],
    ['curah-hujan', 0.85],
    ['chirps', 0.85],
    ['gpm', 0.85]
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
    if (this.isLayerVisible('precipitation')) {
      this.computeLivePrecipitation().catch(() => {});
    }
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
    if (layerId === 'precipitation' || layerId === 'rainfall' || layerId === 'curah-hujan' || layerId === 'chirps' || layerId === 'gpm') return 'precipitation';
    return layerId;
  }

  public async ensureDataLoaded(): Promise<void> {
    this.isDataLoaded = true;
    return Promise.resolve();
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
      'gee-precipitation-wms-layer',
      'gee-modis-live-raster-layer'
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

  public async computeLivePrecipitation(date?: string): Promise<any> {
    const d = date || this.currentParams.start || '2024-08-01';
    try {
      const res = await fetch(`/api/gee-precipitation-tiles?start=${d}&end=${d}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if ((data.status === 'live' || data.status === 'fallback') && data.tileUrlTemplate) {
          this.livePrecipTileUrlTemplate = data.tileUrlTemplate;
          this.renderAllLayers();
          return data;
        }
      }
    } catch (e) {
      logger.warn('[GEELoader] GEE precipitation serverless check note:', e);
    }
    this.livePrecipTileUrlTemplate = null;
    return null;
  }

  public async computeLiveLandcover(year: string = '2021'): Promise<any> {
    try {
      const res = await fetch(`/api/gee-landcover-tiles?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'live' && data.tileUrlTemplate) {
          this.liveLandcoverTileUrlTemplate = data.tileUrlTemplate;
          this.renderAllLayers();
          return data;
        }
      }
    } catch (e) {
      logger.warn('[GEELoader] GEE landcover serverless check note:', e);
    }
    this.liveLandcoverTileUrlTemplate = null;
    return null;
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
      layout: {
        'visibility': (this.isLayerVisible('lst-day') || this.isLayerVisible('lst-night')) ? 'visible' : 'none'
      },
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
      if (key === 'precipitation') {
        this.computeLivePrecipitation().catch(() => {});
      } else if (key === 'lst-day' || key === 'lst-night') {
        this.computeLiveGEE().catch(() => {});
      } else if (key === 'landcover') {
        this.computeLiveLandcover().catch(() => {});
      }
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
      } else if (key === 'precipitation') {
        this.activeLayers.delete('rainfall');
        this.activeLayers.delete('curah-hujan');
        this.activeLayers.delete('chirps');
        this.activeLayers.delete('gpm');
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
    if (this.map.getLayer('gee-precipitation-wms-layer') && (key === 'precipitation' || layerId === 'precipitation')) {
      this.map.setPaintProperty('gee-precipitation-wms-layer', 'raster-opacity', opacity);
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
      this.notifyLayersChange();
    }
  }

  public getLayerOpacity(layerId: string): number {
    const key = this.normalizeLayerId(layerId);
    return this.layerOpacities.get(key) ?? this.layerOpacities.get(layerId) ?? 0.85;
  }

  public setOpacity(opacity: number) {
    ['lst-day', 'lst-night', 'air-temp', 'surface-temp', 'lst', 'elevation', 'landcover', 'precipitation'].forEach((id) => this.setLayerOpacity(id, opacity));
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
    const isPrecipVis = this.isLayerVisible('precipitation');

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

    // --- 1. OFFICIAL NASA GIBS OGC WMS: DAYTIME LST RASTER LAYER (FALLBACK) ---
    const dayWmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_L3_Land_Surface_Temp_Day_8Day&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&HEIGHT=256&WIDTH=256&TIME=2024-05-01&BBOX={bbox-epsg-3857}`;
    const daySourceId = 'gee-modis-day-wms-source';
    const dayLayerId = 'gee-modis-day-wms-layer';
    
    const beforeStationLayerId = this.map.getLayer('gee-modis-stations-circles')
      ? 'gee-modis-stations-circles'
      : undefined;

    if (!this.map.getSource(daySourceId)) {
      this.map.addSource(daySourceId, {
        type: 'raster',
        tiles: [dayWmsUrl],
        tileSize: 256
      });
      this.map.addLayer({
        id: dayLayerId,
        type: 'raster',
        source: daySourceId,
        layout: { visibility: isDayVis && !this.liveTileUrlTemplate ? 'visible' : 'none' },
        paint: {
          'raster-opacity': this.getLayerOpacity('lst-day'),
          'raster-resampling': 'nearest'
        }
      }, beforeStationLayerId);
    }

    // --- 2. OFFICIAL NASA GIBS OGC WMS: NIGHTTIME LST RASTER LAYER (FALLBACK) ---
    const nightWmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_L3_Land_Surface_Temp_Night_8Day&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&HEIGHT=256&WIDTH=256&TIME=2024-05-01&BBOX={bbox-epsg-3857}`;
    const nightSourceId = 'gee-modis-night-wms-source';
    const nightLayerId = 'gee-modis-night-wms-layer';
    
    if (!this.map.getSource(nightSourceId)) {
      this.map.addSource(nightSourceId, {
        type: 'raster',
        tiles: [nightWmsUrl],
        tileSize: 256
      });
      this.map.addLayer({
        id: nightLayerId,
        type: 'raster',
        source: nightSourceId,
        layout: { visibility: isNightVis && !this.liveTileUrlTemplate ? 'visible' : 'none' },
        paint: {
          'raster-opacity': this.getLayerOpacity('lst-night'),
          'raster-resampling': 'nearest'
        }
      }, beforeStationLayerId);
    }

    // --- 3. GEE ESA WORLDCOVER (LIVE RASTER) ---
    try {
      if (this.liveLandcoverTileUrlTemplate) {
        const lcWmsUrl = this.liveLandcoverTileUrlTemplate;
        const lcSourceId = 'gee-modis-landcover-source';
        const lcLayerId = 'gee-modis-landcover-layer';

        // Insert Land Cover below Day/Night LST if they exist, otherwise below stations circles
        const beforeLayerId = this.map.getLayer('gee-modis-day-wms-layer')
          ? 'gee-modis-day-wms-layer'
          : (this.map.getLayer('gee-modis-night-wms-layer')
            ? 'gee-modis-night-wms-layer'
            : beforeStationLayerId);

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
      }
    } catch (e) {
      logger.warn('[GEELoader] Notice adding Sentinel-2 10m Land Cover raster layer:', e);
    }

    // --- 3b. GEE CHIRPS & NASA GPM DAILY PRECIPITATION RATE (LIVE RADAR RASTER) ---
    try {
      const selectedDate = this.currentParams.start || '2024-08-01';
      // Official weather radar overlay: 100% transparent non-rain pixels, basemap completely clear
      const fallbackGibsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=IMERG_Precipitation_Rate&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${selectedDate}&BBOX={bbox-epsg-3857}`;
      const precipWmsUrl = this.livePrecipTileUrlTemplate || fallbackGibsUrl;
      const precipSourceId = 'gee-precipitation-wms-source';
      const precipLayerId = 'gee-precipitation-wms-layer';

      const existingPrecipSource = this.map.getSource(precipSourceId) as any;
      if (existingPrecipSource) {
        if (existingPrecipSource.tiles && existingPrecipSource.tiles[0] !== precipWmsUrl) {
          if (this.map.getLayer(precipLayerId)) {
            this.map.removeLayer(precipLayerId);
          }
          this.map.removeSource(precipSourceId);

          this.map.addSource(precipSourceId, {
            type: 'raster',
            tiles: [precipWmsUrl],
            tileSize: 256,
            maxzoom: 12
          });
          this.map.addLayer({
            id: precipLayerId,
            type: 'raster',
            source: precipSourceId,
            layout: { visibility: isPrecipVis ? 'visible' : 'none' },
            paint: {
              'raster-opacity': this.getLayerOpacity('precipitation'),
              'raster-resampling': 'linear',
              'raster-fade-duration': 150
            }
          }, beforeStationLayerId);
        } else {
          if (typeof existingPrecipSource.setTiles === 'function') {
            existingPrecipSource.setTiles([precipWmsUrl]);
          }
          if (this.map.getLayer(precipLayerId)) {
            this.map.setLayoutProperty(precipLayerId, 'visibility', isPrecipVis ? 'visible' : 'none');
            this.map.setPaintProperty(precipLayerId, 'raster-opacity', this.getLayerOpacity('precipitation'));
            this.map.setPaintProperty(precipLayerId, 'raster-resampling', 'linear');
          } else {
            this.map.addLayer({
              id: precipLayerId,
              type: 'raster',
              source: precipSourceId,
              layout: { visibility: isPrecipVis ? 'visible' : 'none' },
              paint: {
                'raster-opacity': this.getLayerOpacity('precipitation'),
                'raster-resampling': 'linear',
                'raster-fade-duration': 150
              }
            }, beforeStationLayerId);
          }
        }
      } else {
        this.map.addSource(precipSourceId, {
          type: 'raster',
          tiles: [precipWmsUrl],
          tileSize: 256,
          maxzoom: 12
        });

        this.map.addLayer({
          id: precipLayerId,
          type: 'raster',
          source: precipSourceId,
          layout: { visibility: isPrecipVis ? 'visible' : 'none' },
          paint: {
            'raster-opacity': this.getLayerOpacity('precipitation'),
            'raster-resampling': 'linear',
            'raster-fade-duration': 150
          }
        }, beforeStationLayerId);
      }
    } catch (e) {
      logger.warn('[GEELoader] Notice adding Precipitation layer:', e);
    }

    // Removed synthetic stations and interceptors

    this.notifyLayersChange();
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
    const isPrecipVis = this.isLayerVisible('precipitation');
    if (this.map.getLayer('gee-modis-day-wms-layer')) {
      this.map.setLayoutProperty('gee-modis-day-wms-layer', 'visibility', (isDayVis && !this.liveTileUrlTemplate) ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-modis-night-wms-layer')) {
      this.map.setLayoutProperty('gee-modis-night-wms-layer', 'visibility', (isNightVis && !this.liveTileUrlTemplate) ? 'visible' : 'none');
    }
    // GEE Live Layer (Replaces NASA GIBS)
    if (this.map.getLayer('gee-modis-live-raster-layer')) {
      this.map.setLayoutProperty('gee-modis-live-raster-layer', 'visibility', (isDayVis || isNightVis) ? 'visible' : 'none');
    }
    
    if (this.map.getLayer('gee-modis-landcover-layer')) {
      this.map.setLayoutProperty('gee-modis-landcover-layer', 'visibility', isLcVis ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-precipitation-wms-layer')) {
      this.map.setLayoutProperty('gee-precipitation-wms-layer', 'visibility', isPrecipVis ? 'visible' : 'none');
    }

    this.notifyLayersChange();
  }

  private bindLayerEvents() {
    // Removed synthetic click handlers that relied on fake data
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
