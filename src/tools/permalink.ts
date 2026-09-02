import * as maplibregl from 'maplibre-gl';
import { MapManager } from '../map/map-manager';
import { PikselLoader } from './piksel-loader';

export interface URLState {
  lng?: number;
  lat?: number;
  zoom?: number;
  basemapId?: string;
  productId?: string;
}

export class PermalinkManager {
  private mapManager: MapManager;
  private pikselLoader?: PikselLoader;
  private isUpdatingHash: boolean = false;
  private debounceTimer?: any;

  constructor(mapManager: MapManager, pikselLoader?: PikselLoader) {
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
  }

  public setPikselLoader(loader: PikselLoader) {
    this.pikselLoader = loader;
  }

  /**
   * Parse current window.location.hash
   * Format: #[lng]/[lat]/[zoom]/[basemapId]/[productId]
   */
  public static parseHash(): URLState {
    const hash = window.location.hash.replace(/^#/, '').trim();
    if (!hash) return {};

    const parts = hash.split('/');
    const state: URLState = {};

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

    // Initial update
    this.scheduleHashUpdate();
  }

  public scheduleHashUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateHash();
    }, 400);
  }

  private updateHash() {
    const map = this.mapManager.getMap();
    if (!map || this.isUpdatingHash) return;

    try {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const basemapId = this.mapManager.getCurrentBasemapId();
      const productId = this.pikselLoader?.getActiveProduct()?.id || '';

      const lngStr = center.lng.toFixed(4);
      const latStr = center.lat.toFixed(4);
      const zoomStr = zoom.toFixed(2);

      let newHash = `#${lngStr}/${latStr}/${zoomStr}/${basemapId}`;
      if (productId) {
        newHash += `/${productId}`;
      }

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
