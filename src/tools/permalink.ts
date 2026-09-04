import { MapManager } from '../map/map-manager';
import { PikselLoader } from './piksel-loader';
import { GEELoader } from './gee-loader';

export interface URLState {
  lng?: number;
  lat?: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  projection?: 'mercator' | 'globe';
  basemapId?: string;
  productId?: string;
  year?: string;
  pikselOpacity?: number;
  geeLayers?: string[];
  geeOpacity?: number;
}

export class PermalinkManager {
  private mapManager: MapManager;
  private pikselLoader?: PikselLoader;
  private geeLoader?: GEELoader;
  private isUpdatingHash: boolean = false;
  private debounceTimer?: any;

  constructor(mapManager: MapManager, pikselLoader?: PikselLoader, geeLoader?: GEELoader) {
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
  }

  public setPikselLoader(loader: PikselLoader) {
    this.pikselLoader = loader;
  }

  public setGEELoader(loader: GEELoader) {
    this.geeLoader = loader;
  }

  /**
   * Parse hash string (either provided or from window.location.hash)
   * Supports structured query params (#map=7.50/-7.5407/110.4463/45/15&proj=globe&basemap=esri-satellite&product=s2-ndvi&year=2024&gee=lst,poi&p_op=0.85&g_op=0.8)
   * and legacy slash format (#[lng]/[lat]/[zoom]/[basemapId]/[productId]/[year])
   */
  public static parseHash(customHash?: string): URLState {
    const rawHash = (customHash !== undefined ? customHash : (typeof window !== 'undefined' ? window.location.hash : ''))
      .replace(/^#/, '')
      .trim();

    if (!rawHash) return {};

    const state: URLState = {};

    // 1. Structured query format (#map=...&product=...)
    if (rawHash.includes('=') || rawHash.includes('&')) {
      const params = new URLSearchParams(rawHash);

      // Map coords: map=zoom/lat/lng or map=zoom/lat/lng/pitch/bearing
      if (params.has('map')) {
        const parts = (params.get('map') || '').split('/');
        if (parts.length >= 3) {
          const p0 = parseFloat(parts[0]);
          const p1 = parseFloat(parts[1]);
          const p2 = parseFloat(parts[2]);

          if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
            // Standard: zoom/lat/lng
            if (p0 <= 22 && Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
              state.zoom = p0;
              state.lat = p1;
              state.lng = p2;
            } else if (Math.abs(p0) <= 180 && Math.abs(p1) <= 90 && p2 <= 22) {
              // lng/lat/zoom
              state.lng = p0;
              state.lat = p1;
              state.zoom = p2;
            }

            if (parts.length >= 4) {
              const pPitch = parseFloat(parts[3]);
              if (!isNaN(pPitch)) state.pitch = Math.min(85, Math.max(0, pPitch));
            }
            if (parts.length >= 5) {
              const pBearing = parseFloat(parts[4]);
              if (!isNaN(pBearing)) state.bearing = pBearing;
            }
          }
        }
      }

      if (params.has('pitch')) {
        const val = parseFloat(params.get('pitch') || '');
        if (!isNaN(val)) state.pitch = Math.min(85, Math.max(0, val));
      }

      if (params.has('bearing')) {
        const val = parseFloat(params.get('bearing') || '');
        if (!isNaN(val)) state.bearing = val;
      }

      if (params.has('proj')) {
        const projVal = params.get('proj')?.toLowerCase();
        if (projVal === 'globe' || projVal === 'mercator') {
          state.projection = projVal;
        }
      }

      if (params.has('basemap')) {
        state.basemapId = params.get('basemap') || undefined;
      }
      if (params.has('product')) {
        state.productId = params.get('product') || undefined;
      }
      if (params.has('year')) {
        state.year = params.get('year') || undefined;
      }
      if (params.has('gee')) {
        const geeList = (params.get('gee') || '').split(',').filter(Boolean);
        if (geeList.length > 0) state.geeLayers = geeList;
      }

      if (params.has('p_op')) {
        const opVal = parseFloat(params.get('p_op') || '');
        if (!isNaN(opVal) && opVal >= 0 && opVal <= 1) {
          state.pikselOpacity = opVal;
        }
      }

      if (params.has('g_op')) {
        const opVal = parseFloat(params.get('g_op') || '');
        if (!isNaN(opVal) && opVal >= 0 && opVal <= 1) {
          state.geeOpacity = opVal;
        }
      }

      return state;
    }

    // 2. Legacy slash format (#lng/lat/zoom/basemapId/productId/year)
    const parts = rawHash.split('/');
    if (parts.length >= 3) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const zoom = parseFloat(parts[2]);
      if (!isNaN(lng) && !isNaN(lat)) {
        state.lng = lng;
        state.lat = lat;
      }
      if (!isNaN(zoom)) {
        state.zoom = zoom;
      }
    }

    if (parts.length >= 4 && parts[3]) {
      state.basemapId = parts[3];
    }
    if (parts.length >= 5 && parts[4]) {
      state.productId = parts[4];
    }
    if (parts.length >= 6 && parts[5]) {
      state.year = parts[5];
    }

    return state;
  }

  /**
   * Start listening to map and state changes to keep URL hash in sync
   */
  public init() {
    const map = this.mapManager.getMap();
    if (!map) return;

    const update = () => this.scheduleHashUpdate();

    map.on('moveend', update);
    map.on('zoomend', update);
    map.on('pitchend', update);
    map.on('rotateend', update);

    this.scheduleHashUpdate();
  }

  public scheduleHashUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateHash();
    }, 400);
  }

  public buildParams(): URLSearchParams {
    const map = this.mapManager.getMap();
    const params = new URLSearchParams();
    if (!map) return params;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = Math.round(map.getPitch());
    const bearing = Math.round(map.getBearing());
    const projection = this.mapManager.getProjection();
    const basemapId = this.mapManager.getCurrentBasemapId();
    const activeProduct = this.pikselLoader?.getActiveProduct();
    const year = this.pikselLoader?.getSelectedYear();

    // Map Coordinates & 3D orientation
    if (pitch > 0 || bearing !== 0) {
      params.set('map', `${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}/${pitch}/${bearing}`);
    } else {
      params.set('map', `${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`);
    }

    // 3D Globe Projection
    if (projection === 'globe') {
      params.set('proj', 'globe');
    }

    // Basemap
    if (basemapId && basemapId !== 'osm-standard') {
      params.set('basemap', basemapId);
    }

    // Piksel EO Product
    if (activeProduct) {
      params.set('product', activeProduct.id);
      if (year && activeProduct.timeEnabled) {
        params.set('year', year);
      }
      const pOp = this.pikselLoader?.getOpacity();
      if (pOp !== undefined && pOp !== 0.85) {
        params.set('p_op', pOp.toFixed(2));
      }
    }

    // GEE Layers
    if (this.geeLoader) {
      const activeGee: string[] = [];
      ['lst', 'elevation', 'landcover', 'poi'].forEach((k) => {
        if (this.geeLoader?.isLayerActive(k as any)) {
          activeGee.push(k);
        }
      });
      if (activeGee.length > 0) {
        params.set('gee', activeGee.join(','));
        const gOp = this.geeLoader.getOpacity();
        if (gOp !== undefined && gOp !== 0.8) {
          params.set('g_op', gOp.toFixed(2));
        }
      }
    }

    return params;
  }

  public getShareableUrl(): string {
    const params = this.buildParams();
    return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
  }

  private updateHash() {
    if (this.isUpdatingHash) return;

    try {
      const params = this.buildParams();
      const newHash = `#${params.toString()}`;

      if (window.location.hash !== newHash) {
        this.isUpdatingHash = true;
        window.history.replaceState(null, '', newHash);
        this.isUpdatingHash = false;
      }
    } catch (e) {
      console.warn('Permalink update error:', e);
    }
  }
}

