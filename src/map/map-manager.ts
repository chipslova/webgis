import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config/basemaps';

setWorkerUrl(workerUrl);

export class MapManager {
  private map: maplibregl.Map | null = null;
  private containerId: string;
  private currentBasemapId: string = DEFAULT_BASEMAP_ID;
  private currentProjection: 'globe' | 'mercator' = 'mercator';
  private onMoveCallback?: (info: { lat: number; lng: number; zoom: number; pitch: number; bearing: number }) => void;
  private onFeatureClickCallback?: (properties: Record<string, any>, layerName: string, coordinates: [number, number]) => void;

  constructor(containerId: string) {
    this.containerId = containerId;
    this.initProtocol();
  }

  private initProtocol() {
    try {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
    } catch (e) {
      console.warn('PMTiles protocol notice:', e);
    }
  }

  /**
   * Dynamically transforms relative sprite/glyph/source URLs, normalizes endpoints,
   * and strictly deduplicates all layer IDs to prevent MapLibre validation rejections.
   */
  private normalizeStyleSpecification(style: maplibregl.StyleSpecification, baseUrl?: string): maplibregl.StyleSpecification {
    const origin = window.location.origin;

    // 1. Resolve relative or local sprite URLs
    if (style && style.sprite) {
      if (typeof style.sprite === 'string') {
        if (style.sprite.startsWith('http://') || style.sprite.startsWith('https://')) {
          // absolute already
        } else if (style.sprite.startsWith('/')) {
          style.sprite = origin + style.sprite;
        } else if (baseUrl && baseUrl.startsWith('http')) {
          style.sprite = new URL(style.sprite, baseUrl).href;
        }
      }
    }

    // 2. Resolve relative glyphs URLs and preserve literal {fontstack} and {range} tokens
    if (style) {
      if (style.glyphs && typeof style.glyphs === 'string') {
        if (style.glyphs.startsWith('http://') || style.glyphs.startsWith('https://')) {
          style.glyphs = decodeURI(style.glyphs);
        } else if (style.glyphs.startsWith('/')) {
          style.glyphs = origin + style.glyphs;
        } else if (baseUrl && baseUrl.startsWith('http')) {
          style.glyphs = decodeURI(new URL(style.glyphs, baseUrl).href);
        } else {
          style.glyphs = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
        }
      } else {
        style.glyphs = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
      }

      // Guarantee literal tokens are present for MapLibre validation
      if (!style.glyphs.includes('{fontstack}') || !style.glyphs.includes('{range}')) {
        style.glyphs = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
      }
    }

    // 3. Strictly deduplicate layer IDs (Fixes ArcGIS export duplicate layer ID bugs)
    if (style && Array.isArray(style.layers)) {
      const seenIds = new Map<string, number>();
      style.layers.forEach((layer: any, idx: number) => {
        if (layer && layer.id) {
          const count = (seenIds.get(layer.id) || 0) + 1;
          seenIds.set(layer.id, count);
          if (count > 1) {
            layer.id = `${layer.id}_${idx}_${count}`;
          }
        }
      });
    }

    // 4. Resolve relative or local source URLs and direct tiles
    if (style && style.sources) {
      for (const sourceId of Object.keys(style.sources)) {
        const src = style.sources[sourceId] as any;
        if (!src) continue;

        // Resolve relative source URLs first
        if (src.url && typeof src.url === 'string') {
          if (src.url.startsWith('../') || src.url.startsWith('./')) {
            if (baseUrl && baseUrl.startsWith('http')) {
              src.url = new URL(src.url, baseUrl).href;
            }
          } else if (src.url.startsWith('/')) {
            src.url = origin + src.url;
          }
        }

        // Convert ArcGIS VectorTileServer REST endpoint to direct PBF tiles array
        // (Prevents MapLibre from fetching ArcGIS HTML pages and throwing "Unexpected token '<'")
        if (
          src.type === 'vector' &&
          typeof src.url === 'string' &&
          src.url.includes('VectorTileServer')
        ) {
          const sBase = src.url.split('?')[0].replace(/\/$/, '');
          src.tiles = [`${sBase}/tile/{z}/{y}/{x}.pbf`];
          delete src.url;
        }

        // Normalize existing tile URLs
        if (src.tiles && Array.isArray(src.tiles)) {
          src.tiles = src.tiles.map((t: string) => {
            if (t.startsWith('/')) return origin + t;
            return t;
          });
        }
      }
    }

    return style;
  }

  public async initMap(): Promise<maplibregl.Map> {
    const defaultBasemap = BASEMAPS.find(b => b.id === this.currentBasemapId) || BASEMAPS[0];

    const initialCenter = defaultBasemap.initialBounds?.center || [117.89, -2.55];
    const initialZoom = defaultBasemap.initialBounds?.zoom || 3;

    let initialStyle: string | maplibregl.StyleSpecification = defaultBasemap.styleUrl;
    try {
      const res = await fetch(defaultBasemap.styleUrl);
      if (res.ok) {
        const json = await res.json();
        initialStyle = this.normalizeStyleSpecification(json, defaultBasemap.styleUrl);
      }
    } catch (e) {
      console.warn('Initial style fetch notice:', e);
    }

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: initialStyle,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    // Add standard controls
    this.map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true
      }),
      'top-right'
    );

    this.map.addControl(
      new maplibregl.FullscreenControl(),
      'top-right'
    );

    this.map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'top-right'
    );

    this.map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 150,
        unit: 'metric'
      }),
      'bottom-right'
    );

    this.map.addControl(
      new maplibregl.AttributionControl({
        compact: true
      }),
      'bottom-right'
    );

    // Track mouse position and map view state
    this.map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      if (this.onMoveCallback && this.map) {
        this.onMoveCallback({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          zoom: this.map.getZoom(),
          pitch: this.map.getPitch(),
          bearing: this.map.getBearing()
        });
      }
    });

    this.map.on('move', () => {
      if (this.onMoveCallback && this.map) {
        const center = this.map.getCenter();
        this.onMoveCallback({
          lat: center.lat,
          lng: center.lng,
          zoom: this.map.getZoom(),
          pitch: this.map.getPitch(),
          bearing: this.map.getBearing()
        });
      }
    });

    // Click event for feature identification
    this.map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (!this.map) return;
      
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 5, e.point.y - 5],
        [e.point.x + 5, e.point.y + 5]
      ];
      
      const features = this.map.queryRenderedFeatures(bbox);
      if (features && features.length > 0) {
        const topFeature = features[0];
        if (topFeature.properties && Object.keys(topFeature.properties).length > 0) {
          if (this.onFeatureClickCallback) {
            this.onFeatureClickCallback(
              topFeature.properties,
              topFeature.layer.id,
              [e.lngLat.lng, e.lngLat.lat]
            );
          }
        }
      }
    });

    // Handle map style loading error gracefully
    this.map.on('error', (e: any) => {
      console.warn('MapLibre style/resource notice:', e.error?.message || e);
    });

    // Centralized style.load listener for all basemap transitions
    this.map.on('style.load', () => {
      this.fireStyleReadyCallbacks();
    });

    return new Promise<maplibregl.Map>((resolve) => {
      if (this.map!.isStyleLoaded()) {
        resolve(this.map!);
      } else {
        this.map!.once('load', () => resolve(this.map!));
      }
    });
  }

  public getMap(): maplibregl.Map | null {
    return this.map;
  }

  // Registry for centralized style.load lifecycle
  private styleReadyCallbacks: Array<() => void> = [];
  private geojsonLoaderRef?: { getAllMapLayerIds(): string[] };
  private pikselLoaderRef?: { getAllMapLayerIds(): string[] };
  private geeLoaderRef?: { getAllMapLayerIds?(): string[] };
  private measureToolRef?: { getAllMapLayerIds?(): string[] };

  public onStyleReady(callback: () => void) {
    this.styleReadyCallbacks.push(callback);
  }

  public setGeoJsonLoader(loader: { getAllMapLayerIds(): string[] }) {
    this.geojsonLoaderRef = loader;
  }

  public setPikselLoader(loader: { getAllMapLayerIds(): string[] }) {
    this.pikselLoaderRef = loader;
  }

  public setGeeLoader(loader: { getAllMapLayerIds?(): string[] }) {
    this.geeLoaderRef = loader;
  }

  public setMeasureTool(tool: { getAllMapLayerIds?(): string[] }) {
    this.measureToolRef = tool;
  }

  private fireStyleReadyCallbacks() {
    this.styleReadyCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn('[MapManager] Error in styleReady callback:', e);
      }
    });
    this.enforceLayerOrder();
  }

  /**
   * Deterministically orders all custom layers above the basemap in a single pass:
   * Basemap (Bottom)
   * -> Piksel WMS Raster Layers (Bottommost Analytical Layer)
   * -> GEE Raster Analysis (MODIS LST, SRTM Elevation, Landcover)
   * -> Piksel Grid Boundaries (Fill & Dashed Line)
   * -> GEE POI Vector Circles & Labels
   * -> Custom Vector GeoJSON Layers (Major Cities, User GeoJSON)
   * -> Measurement / Drawing (Fill, Casing, DashLine, Vertices) (Topmost)
   */
  public enforceLayerOrder() {
    if (!this.map || !this.map.getStyle()) return;

    // 1. Piksel WMS Raster Layers (bottom of analytical stack)
    const pikselRasterLayerIds = (this.pikselLoaderRef?.getAllMapLayerIds() || []).filter(
      (id) => !id.includes('grid')
    );

    // 2. GEE Analytical Rasters (above Piksel imagery)
    const geeRasterLayerIds = [
      'gee-elevation-fill',
      'gee-elevation-outline',
      'gee-landcover-fill',
      'gee-landcover-outline',
      'gee-lst-fill',
      'gee-lst-outline'
    ];

    // 3. Piksel Grid Boundaries (above GEE/Piksel rasters)
    const pikselGridLayerIds = ['piksel-grid-fill', 'piksel-grid-line'];

    // 4. GEE POI Vector Circles & Observations
    const geeVectorLayerIds = ['gee-poi-circles'];

    // 5. Custom Vector GeoJSON Layers (Major Cities, Uploaded GeoJSON)
    const geojsonLayerIds = this.geojsonLoaderRef?.getAllMapLayerIds() || [];

    // 6. Measurement Layers (Always topmost interactive overlay)
    const measureLayerIds = [
      'measure-fill',
      'measure-line-casing',
      'measure-line',
      'measure-points'
    ];

    const orderedLayerStack = [
      ...pikselRasterLayerIds,
      ...geeRasterLayerIds,
      ...pikselGridLayerIds,
      ...geeVectorLayerIds,
      ...geojsonLayerIds,
      ...measureLayerIds
    ];

    orderedLayerStack.forEach((id) => {
      if (this.map?.getLayer(id)) {
        try {
          this.map.moveLayer(id);
        } catch (_) {}
      }
    });
  }

  public bringCustomLayersToTop() {
    this.enforceLayerOrder();
  }

  public async setBasemap(basemapId: string): Promise<boolean> {
    if (!this.map) return false;
    const target = BASEMAPS.find(b => b.id === basemapId);
    if (!target) return false;

    this.currentBasemapId = basemapId;

    // Retain view parameters
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const pitch = this.map.getPitch();
    const bearing = this.map.getBearing();

    try {
      const res = await fetch(target.styleUrl);
      const styleJson: maplibregl.StyleSpecification = await res.json();
      const normalizedStyle = this.normalizeStyleSpecification(styleJson, target.styleUrl);
      this.map.setStyle(normalizedStyle, { diff: false });
    } catch (err) {
      console.warn('Failed to load style JSON directly, fallback to URL:', err);
      this.map.setStyle(target.styleUrl, { diff: false });
    }

    this.map.once('style.load', () => {
      if (!this.map) return;
      this.map.setCenter(center);
      this.map.setZoom(zoom);
      this.map.setPitch(pitch);
      this.map.setBearing(bearing);
    });

    return true;
  }

  public setProjection(type: 'globe' | 'mercator') {
    this.currentProjection = type;
    if (this.map && typeof (this.map as any).setProjection === 'function') {
      try {
        this.map.setProjection({ type });
      } catch (e) {
        console.warn('setProjection error:', e);
      }
    }
  }

  public getProjection(): 'globe' | 'mercator' {
    return this.currentProjection;
  }

  public toggleProjection(): 'globe' | 'mercator' {
    const next = this.currentProjection === 'globe' ? 'mercator' : 'globe';
    this.setProjection(next);
    return next;
  }

  public getCurrentBasemapId(): string {
    return this.currentBasemapId;
  }

  public onMouseMove(callback: (info: { lat: number; lng: number; zoom: number; pitch: number; bearing: number }) => void) {
    this.onMoveCallback = callback;
  }

  public onFeatureClick(callback: (properties: Record<string, any>, layerName: string, coordinates: [number, number]) => void) {
    this.onFeatureClickCallback = callback;
  }
}
