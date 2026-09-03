import { MapManager } from '../map/map-manager';
import { PikselLoader } from './piksel-loader';
import { GEELoader } from './gee-loader';

export interface URLState {
  lng?: number;
  lat?: number;
  zoom?: number;
  basemapId?: string;
  productId?: string;
  year?: string;
  geeLayers?: string[];
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
   * Parse current window.location.hash
   * Supports both URL query params (#map=7.50/-7.5407/110.4463&basemap=esri-satellite&product=s2-ndvi&year=2024&gee=lst,poi)
   * and legacy slash format (#[lng]/[lat]/[zoom]/[basemapId]/[productId]/[year])
   */
  public static parseHash(): URLState {
    const rawHash = window.location.hash.replace(/^#/, '').trim();
    if (!rawHash) return {};

    const state: URLState = {};

    // 1. Structured query format (#map=...&product=...)
    if (rawHash.includes('=') || rawHash.includes('&')) {
      const params = new URLSearchParams(rawHash);

      // Map coords: map=zoom/lat/lng or map=lng/lat/zoom
      if (params.has('map')) {
        const parts = (params.get('map') || '').split('/');
        if (parts.length === 3) {
          const p0 = parseFloat(parts[0]);
          const p1 = parseFloat(parts[1]);
          const p2 = parseFloat(parts[2]);
          // Standard: zoom/lat/lng
          if (p0 <= 22 && Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
            state.zoom = p0;
            state.lat = p1;
            state.lng = p2;
          } else {
            // lng/lat/zoom
            state.lng = p0;
            state.lat = p1;
            state.zoom = p2;
          }
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

    this.scheduleHashUpdate();
  }

  public scheduleHashUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateHash();
    }, 400);
  }

  public getShareableUrl(): string {
    const map = this.mapManager.getMap();
    if (!map) return window.location.href;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const basemapId = this.mapManager.getCurrentBasemapId();
    const activeProduct = this.pikselLoader?.getActiveProduct();
    const year = this.pikselLoader?.getSelectedYear();

    const params = new URLSearchParams();
    params.set('map', `${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`);

    if (basemapId && basemapId !== 'osm-standard') {
      params.set('basemap', basemapId);
    }
    if (activeProduct) {
      params.set('product', activeProduct.id);
      if (year && activeProduct.timeEnabled) {
        params.set('year', year);
      }
    }

    if (this.geeLoader) {
      const activeGee: string[] = [];
      ['lst', 'elevation', 'landcover', 'poi'].forEach((k) => {
        if (this.geeLoader?.isLayerActive(k as any)) {
          activeGee.push(k);
        }
      });
      if (activeGee.length > 0) {
        params.set('gee', activeGee.join(','));
      }
    }

    return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
  }

  private updateHash() {
    const map = this.mapManager.getMap();
    if (!map || this.isUpdatingHash) return;

    try {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const basemapId = this.mapManager.getCurrentBasemapId();
      const activeProduct = this.pikselLoader?.getActiveProduct();
      const year = this.pikselLoader?.getSelectedYear();

      const params = new URLSearchParams();
      params.set('map', `${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`);

      if (basemapId && basemapId !== 'osm-standard') {
        params.set('basemap', basemapId);
      }
      if (activeProduct) {
        params.set('product', activeProduct.id);
        if (year && activeProduct.timeEnabled) {
          params.set('year', year);
        }
      }

      if (this.geeLoader) {
        const activeGee: string[] = [];
        ['lst', 'elevation', 'landcover'].forEach((k) => {
          if (this.geeLoader?.isLayerActive(k as any)) {
            activeGee.push(k);
          }
        });
        if (activeGee.length > 0) {
          params.set('gee', activeGee.join(','));
        }
      }

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
