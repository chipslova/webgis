import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config/basemaps';

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
   * Dynamically transforms relative sprite/glyph URLs, normalizes ESRI VectorTileServer
   * endpoints to absolute direct tile URLs, deduplicates layer IDs, and sets projection.
   */
  private normalizeStyleSpecification(style: maplibregl.StyleSpecification): maplibregl.StyleSpecification {
    const origin = window.location.origin;

    // 1. Normalize relative sprite URLs
    if (style && style.sprite) {
      if (typeof style.sprite === 'string' && style.sprite.startsWith('/')) {
        style.sprite = origin + style.sprite;
      } else if (Array.isArray(style.sprite)) {
        style.sprite = style.sprite.map((s: any) => {
          if (typeof s === 'string' && s.startsWith('/')) return origin + s;
          if (s && typeof s === 'object' && typeof s.url === 'string' && s.url.startsWith('/')) {
            return { ...s, url: origin + s.url };
          }
          return s;
        });
      }
    }

    // 2. Normalize relative glyphs URLs or provide fallback for raster styles
    if (style && style.glyphs && typeof style.glyphs === 'string' && style.glyphs.startsWith('/')) {
      style.glyphs = origin + style.glyphs;
    } else if (style && !style.glyphs) {
      style.glyphs = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
    }

    // 3. Deduplicate layer IDs to prevent MapLibre validation warnings
    if (style && Array.isArray(style.layers)) {
      const seenIds = new Set<string>();
      style.layers.forEach((layer: any, idx: number) => {
        if (layer && layer.id) {
          if (seenIds.has(layer.id)) {
            layer.id = `${layer.id}_dup_${idx}`;
          } else {
            seenIds.add(layer.id);
          }
        }
      });
    }

    // 4. Force direct absolute tiles array and DELETE src.url for ESRI VectorTileServer
    if (style && style.sources) {
      for (const sourceId of Object.keys(style.sources)) {
        const src = style.sources[sourceId] as any;
        if (src && (src.type === 'vector' || src.type === 'raster')) {
          if (src.url && typeof src.url === 'string' && src.url.includes('VectorTileServer')) {
            const baseUrl = src.url.split('?')[0].replace(/\/$/, '');
            src.tiles = [`${baseUrl}/tile/{z}/{y}/{x}.pbf`];
            delete src.url;
          } else if (src.tiles && Array.isArray(src.tiles)) {
            src.tiles = src.tiles.map((t: string) => {
              if (t.startsWith('/')) return origin + t;
              return t;
            });
            delete src.url;
          }
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
        initialStyle = this.normalizeStyleSpecification(json);
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

    // Ensure projection is enforced on style load
    this.map.on('style.load', () => {
      if (this.map && typeof (this.map as any).setProjection === 'function') {
        try {
          this.map.setProjection({ type: this.currentProjection });
        } catch (err) {
          console.warn('setProjection error:', err);
        }
      }
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

    return this.map;
  }

  public getMap(): maplibregl.Map | null {
    return this.map;
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
      const normalizedStyle = this.normalizeStyleSpecification(styleJson);

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

      if (typeof (this.map as any).setProjection === 'function') {
        try {
          this.map.setProjection({ type: this.currentProjection });
        } catch (e) {
          console.warn('setProjection error on style.load:', e);
        }
      }
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
