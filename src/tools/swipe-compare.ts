import * as maplibregl from 'maplibre-gl';
import { PIKSEL_PRODUCTS, PikselProduct } from '../config/piksel';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config/basemaps';
import { MapManager } from '../map/map-manager';
import { SidebarUI } from '../ui/sidebar';
import { PikselLoader } from './piksel-loader';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export type MapFactory = (options: maplibregl.MapOptions) => maplibregl.Map;

export interface CompareSideConfig {
  productId: string | null;
  year: string;
  basemapId: string;
}

export interface SwipePreset {
  id: string;
  name: string;
  locationName: string;
  center: [number, number];
  zoom: number;
  pitch?: number;
  description: string;
  left: { productId: string; year: string };
  right: { productId: string; year: string };
}

export const SWIPE_PRESETS: SwipePreset[] = [
  {
    id: 'ikn-dev',
    name: 'Pembangunan IKN Nusantara',
    locationName: 'Kalimantan Timur',
    center: [116.7050, -0.9700],
    zoom: 12.0,
    pitch: 0,
    description: 'Bandingkan tutupan hutan 2018 (Kiri) vs Progres Infrastruktur & Indeks Vegetasi 2025 (Kanan).',
    left: { productId: 's2-geomad-rgb', year: '2018' },
    right: { productId: 's2-ndvi', year: '2025' }
  },
  {
    id: 'bromo-spectral',
    name: 'Kawah Bromo & Vegetasi Tengger',
    locationName: 'Jawa Timur',
    center: [112.9530, -7.9425],
    zoom: 13.0,
    pitch: 0,
    description: 'Bandingkan komposit spektral vegetasi (Kiri) vs True Color RGB (Kanan) di kaldera Bromo.',
    left: { productId: 's2-ndvi', year: '2025' },
    right: { productId: 's2-geomad-rgb', year: '2025' }
  },
  {
    id: 'jakarta-urban',
    name: 'Ekspansi Urban Pesisir Jakarta',
    locationName: 'DKI Jakarta & Teluk Jakarta',
    center: [106.8272, -6.1754],
    zoom: 12.0,
    pitch: 0,
    description: 'Perkembangan pulau reklamasi & densitas terbangun 2018 (Kiri) vs 2025 (Kanan).',
    left: { productId: 's2-geomad-rgb', year: '2018' },
    right: { productId: 's2-geomad-rgb', year: '2025' }
  },
  {
    id: 'danau-toba',
    name: 'Kualitas Air & Pesisir Danau Toba',
    locationName: 'Sumatera Utara',
    center: [98.8800, 2.6800],
    zoom: 11.5,
    pitch: 0,
    description: 'Indeks Air (NDWI) 2025 (Kiri) vs Komposit Warna Alami 2025 (Kanan).',
    left: { productId: 's2-ndwi', year: '2025' },
    right: { productId: 's2-geomad-rgb', year: '2025' }
  }
];

export class SwipeCompareManager {
  private primaryMap: maplibregl.Map;
  private mapManager: MapManager | null = null;
  private sidebarUI: SidebarUI | null = null;
  private pikselLoader: PikselLoader | null = null;
  private mapFactory: MapFactory;
  private compareMap: maplibregl.Map | null = null;
  private isCompareActive: boolean = false;
  private sliderPositionPercent: number = 50; // 0 to 100%
  private wasSidebarOpen: boolean = false;

  private leftConfig: CompareSideConfig = {
    productId: 's2-geomad-rgb',
    year: '2018',
    basemapId: DEFAULT_BASEMAP_ID
  };

  private rightConfig: CompareSideConfig = {
    productId: 's2-geomad-rgb',
    year: '2025',
    basemapId: DEFAULT_BASEMAP_ID
  };

  private onStateChangeCallbacks: Array<() => void> = [];
  private syncListener: (() => void) | null = null;
  private resizeListener: (() => void) | null = null;

  constructor(
    primaryMap: maplibregl.Map,
    mapManager?: MapManager | null,
    sidebarUI?: SidebarUI | null,
    pikselLoader?: PikselLoader | null,
    mapFactory?: MapFactory
  ) {
    this.primaryMap = primaryMap;
    this.mapManager = mapManager || null;
    this.sidebarUI = sidebarUI || null;
    this.pikselLoader = pikselLoader || null;
    this.mapFactory = mapFactory || ((opts) => new maplibregl.Map(opts));
  }

  public isActive(): boolean {
    return this.isCompareActive;
  }

  public getSliderPosition(): number {
    return this.sliderPositionPercent;
  }

  public setSliderPosition(percent: number) {
    this.sliderPositionPercent = Math.max(0, Math.min(100, percent));
    this.updateClipPath();

    if (typeof document !== 'undefined') {
      const handle = document.getElementById('swipe-divider-handle');
      if (handle) {
        handle.style.left = `${this.sliderPositionPercent}%`;
        handle.setAttribute('aria-valuenow', `${Math.round(this.sliderPositionPercent)}`);
      }
    }

    this.notify();
  }

  public getLeftConfig(): CompareSideConfig {
    return { ...this.leftConfig };
  }

  public getRightConfig(): CompareSideConfig {
    return { ...this.rightConfig };
  }

  public getPrimaryMapZoom(): number {
    return this.primaryMap?.getZoom ? this.primaryMap.getZoom() : 10;
  }

  public autoZoomIfLow(targetZoom: number = 9.5) {
    if (this.primaryMap && typeof this.primaryMap.getZoom === 'function') {
      const cur = this.primaryMap.getZoom();
      if (cur < 8) {
        this.primaryMap.flyTo({
          zoom: targetZoom,
          duration: 1400,
          essential: true
        });
      }
    }
  }

  public setLeftConfig(config: Partial<CompareSideConfig>) {
    this.leftConfig = { ...this.leftConfig, ...config };
    this.autoZoomIfLow();
    this.renderLeftLayer();
    this.notify();
  }

  public setRightConfig(config: Partial<CompareSideConfig>) {
    this.rightConfig = { ...this.rightConfig, ...config };
    this.autoZoomIfLow();
    this.renderRightLayer();
    this.notify();
  }

  public onStateChange(cb: () => void) {
    this.onStateChangeCallbacks.push(cb);
  }

  private notify() {
    this.onStateChangeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        logger.warn('[SwipeCompare] Error in stateChange callback:', e);
      }
    });
  }

  /**
   * Activates Swipe Comparison Mode with synchronized dual canvas
   */
  public activate(preset?: SwipePreset) {
    if (this.isCompareActive) {
      if (preset) this.applyPreset(preset);
      return;
    }

    if (preset) {
      this.leftConfig.productId = preset.left.productId;
      this.leftConfig.year = preset.left.year;
      this.rightConfig.productId = preset.right.productId;
      this.rightConfig.year = preset.right.year;
    }

    this.isCompareActive = true;
    this.sliderPositionPercent = 50;

    if (typeof document !== 'undefined') {
      document.body.classList.add('swipe-mode-active');
      // Close popovers if open
      const bmPop = document.getElementById('basemap-popover');
      if (bmPop) bmPop.style.display = 'none';
      const subPop = document.getElementById('sublayers-popover');
      if (subPop) subPop.style.display = 'none';
    }

    // Auto-collapse sidebar for an uncluttered full-map comparison view
    if (this.sidebarUI) {
      this.wasSidebarOpen = this.sidebarUI.getIsOpen();
      this.sidebarUI.setOpen(false);
    }

    // Suppress standalone piksel layer to avoid overlay conflict
    if (this.pikselLoader) {
      this.pikselLoader.setActiveProduct(null);
    }

    // Sync basemap id
    const currentBm = this.mapManager?.getCurrentBasemapId() || DEFAULT_BASEMAP_ID;
    this.leftConfig.basemapId = currentBm;
    this.rightConfig.basemapId = currentBm;

    // Create container elements & init secondary map
    this.ensureOverlayElements();
    this.initCompareMap();
    if (!this.compareMap) {
      this.deactivate();
      return;
    }
    this.renderRightLayer();

    if (preset) {
      this.primaryMap.flyTo({
        center: preset.center,
        zoom: preset.zoom,
        pitch: preset.pitch || 0,
        bearing: 0,
        duration: 1600,
        essential: true
      });
    } else {
      // Smart Auto-Zoom: If user opens comparison while at national view (zoom < 6), launch flagship IKN preset.
      // If at intermediate zoom (6-7.9), smoothly zoom in to 9.5 to trigger WMS tile loading automatically.
      const curZoom = this.getPrimaryMapZoom();
      if (curZoom < 6) {
        this.applyPreset(SWIPE_PRESETS[0]);
      } else if (curZoom < 8) {
        this.autoZoomIfLow(9.5);
      }
    }

    // Trigger map canvas resize
    setTimeout(() => {
      try {
        if (typeof this.primaryMap?.resize === 'function') this.primaryMap.resize();
        if (typeof this.compareMap?.resize === 'function') this.compareMap.resize();
      } catch (_) {
        // Safe resize
      }
    }, 150);

    this.notify();
  }

  /**
   * Deactivates Swipe Comparison Mode and cleans up both maps and overlays
   */
  public deactivate() {
    if (!this.isCompareActive) return;

    this.isCompareActive = false;

    if (typeof document !== 'undefined') {
      document.body.classList.remove('swipe-mode-active');
    }

    // Remove primary map swipe layers
    const rightSrcId = 'swipe-right-raster-src';
    const rightLayerId = 'swipe-right-raster-layer';

    if (this.primaryMap && this.primaryMap.getStyle()) {
      if (this.primaryMap.getLayer(rightLayerId)) {
        try {
          this.primaryMap.removeLayer(rightLayerId);
        } catch (_) {}
      }
      if (this.primaryMap.getSource(rightSrcId)) {
        try {
          this.primaryMap.removeSource(rightSrcId);
        } catch (_) {}
      }
    }

    // Remove event listeners
    if (this.syncListener) {
      this.primaryMap.off('move', this.syncListener);
      this.syncListener = null;
    }

    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }

    // Remove secondary map
    if (this.compareMap) {
      try {
        this.compareMap.remove();
      } catch (_) {}
      this.compareMap = null;
    }

    // Remove DOM overlays
    if (typeof document !== 'undefined') {
      const container = document.getElementById('swipe-compare-overlay');
      if (container) container.remove();

      const uiRoot = document.getElementById('swipe-ui-root');
      if (uiRoot) uiRoot.remove();
    }

    // Restore previous sidebar state
    if (this.wasSidebarOpen && this.sidebarUI) {
      this.sidebarUI.setOpen(true);
    }

    setTimeout(() => {
      this.primaryMap.resize();
    }, 150);

    this.notify();
  }

  public applyPreset(preset: SwipePreset) {
    this.leftConfig.productId = preset.left.productId;
    this.leftConfig.year = preset.left.year;
    this.rightConfig.productId = preset.right.productId;
    this.rightConfig.year = preset.right.year;

    this.renderLeftLayer();
    this.renderRightLayer();

    this.primaryMap.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      pitch: preset.pitch || 0,
      bearing: 0,
      duration: 1800,
      essential: true
    });

    this.notify();
  }

  private ensureOverlayElements() {
    if (typeof document === 'undefined') return;

    let overlay = document.getElementById('swipe-compare-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'swipe-compare-overlay';
      overlay.className = 'swipe-compare-overlay';

      const compareMapDiv = document.createElement('div');
      compareMapDiv.id = 'swipe-compare-map';
      compareMapDiv.className = 'swipe-compare-map';
      overlay.appendChild(compareMapDiv);

      const mapContainer = document.getElementById('map');
      if (mapContainer) {
        mapContainer.appendChild(overlay);
      }
    }
    this.updateClipPath();
  }

  private updateClipPath() {
    if (typeof document === 'undefined') return;

    const overlay = document.getElementById('swipe-compare-overlay');
    if (overlay) {
      overlay.style.clipPath = `polygon(0 0, ${this.sliderPositionPercent}% 0, ${this.sliderPositionPercent}% 100%, 0 100%)`;
    }
  }

  private initCompareMap() {
    if (typeof document === 'undefined') return;
    const compareMapDiv = document.getElementById('swipe-compare-map');
    if (!compareMapDiv) return;

    const bm = BASEMAPS.find((b) => b.id === this.leftConfig.basemapId) || BASEMAPS[0];

    try {
      this.compareMap = this.mapFactory({
        container: compareMapDiv,
        style: bm.styleUrl,
        center: this.primaryMap.getCenter ? this.primaryMap.getCenter() : { lng: 117.89, lat: -2.55 } as any,
        zoom: this.primaryMap.getZoom ? this.primaryMap.getZoom() : 5,
        pitch: this.primaryMap.getPitch ? this.primaryMap.getPitch() : 0,
        bearing: this.primaryMap.getBearing ? this.primaryMap.getBearing() : 0,
        attributionControl: false,
        interactive: false // Primary map drives camera
      });
    } catch (e) {
      logger.warn('[SwipeCompare] Gagal inisialisasi peta komparasi kedua:', e);
      ErrorHandler.getInstance().showThrottledError(
        'Perangkat atau browser Anda tidak mendukung Mode Komparasi (WebGL2 diperlukan).'
      );
      this.deactivate();
      return;
    }

    if (!this.compareMap) {
      this.deactivate();
      return;
    }

    if (typeof this.compareMap.on === 'function') {
      this.compareMap.on('load', () => {
        this.renderLeftLayer();
        this.compareMap?.resize();
      });
    }

    // Synchronize camera movement seamlessly
    this.syncListener = () => {
      if (!this.compareMap || typeof this.compareMap.jumpTo !== 'function') return;
      this.compareMap.jumpTo({
        center: this.primaryMap.getCenter ? this.primaryMap.getCenter() : { lng: 117.89, lat: -2.55 } as any,
        zoom: this.primaryMap.getZoom ? this.primaryMap.getZoom() : 5,
        pitch: this.primaryMap.getPitch ? this.primaryMap.getPitch() : 0,
        bearing: this.primaryMap.getBearing ? this.primaryMap.getBearing() : 0
      });
    };

    if (this.primaryMap && typeof this.primaryMap.on === 'function') {
      this.primaryMap.on('move', this.syncListener);
    }

    if (typeof window !== 'undefined') {
      this.resizeListener = () => {
        if (this.compareMap && typeof this.compareMap.resize === 'function') {
          this.compareMap.resize();
        }
      };
      window.addEventListener('resize', this.resizeListener);
    }
  }

  private buildWmsTileUrl(product: PikselProduct, year: string): string {
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      CRS: 'EPSG:3857',
      WIDTH: '256',
      HEIGHT: '256',
      LAYERS: product.layer,
      STYLES: product.style,
      FORMAT: 'image/png',
      TRANSPARENT: 'TRUE'
    });

    if (product.timeEnabled) {
      switch (product.timeMode) {
        case 'year-range':
          params.set('TIME', `${year}-01-01/${year}-12-31`);
          break;
        case 'annual':
        default:
          params.set('TIME', `${year}-01-01`);
          break;
      }
    }

    return `${product.serviceUrl}?${params.toString()}&BBOX={bbox-epsg-3857}`;
  }

  private renderLeftLayer() {
    if (!this.compareMap || !this.compareMap.getStyle()) return;

    const srcId = 'swipe-left-raster-src';
    const layerId = 'swipe-left-raster-layer';

    if (this.compareMap.getLayer(layerId)) {
      try {
        this.compareMap.removeLayer(layerId);
      } catch (_) {}
    }
    if (this.compareMap.getSource(srcId)) {
      try {
        this.compareMap.removeSource(srcId);
      } catch (_) {}
    }

    if (!this.leftConfig.productId) return;

    const prod = PIKSEL_PRODUCTS.find((p) => p.id === this.leftConfig.productId);
    if (!prod || prod.isDisabled) return;

    const tileUrl = this.buildWmsTileUrl(prod, this.leftConfig.year);
    const minZoom = prod.minZoom ?? 8;

    try {
      this.compareMap.addSource(srcId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: minZoom,
        maxzoom: 18
      });

      this.compareMap.addLayer({
        id: layerId,
        type: 'raster',
        source: srcId,
        minzoom: minZoom,
        maxzoom: 18,
        paint: {
          'raster-opacity': 0.95
        }
      });
    } catch (e) {
      logger.warn('[SwipeCompare] Error rendering left layer:', e);
    }
  }

  private renderRightLayer() {
    if (!this.primaryMap || !this.primaryMap.getStyle()) return;

    const srcId = 'swipe-right-raster-src';
    const layerId = 'swipe-right-raster-layer';

    if (this.primaryMap.getLayer(layerId)) {
      try {
        this.primaryMap.removeLayer(layerId);
      } catch (_) {}
    }
    if (this.primaryMap.getSource(srcId)) {
      try {
        this.primaryMap.removeSource(srcId);
      } catch (_) {}
    }

    if (!this.rightConfig.productId) return;

    const prod = PIKSEL_PRODUCTS.find((p) => p.id === this.rightConfig.productId);
    if (!prod || prod.isDisabled) return;

    const tileUrl = this.buildWmsTileUrl(prod, this.rightConfig.year);
    const minZoom = prod.minZoom ?? 8;

    try {
      this.primaryMap.addSource(srcId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: minZoom,
        maxzoom: 18
      });

      this.primaryMap.addLayer({
        id: layerId,
        type: 'raster',
        source: srcId,
        minzoom: minZoom,
        maxzoom: 18,
        paint: {
          'raster-opacity': 0.95
        }
      });
    } catch (e) {
      logger.warn('[SwipeCompare] Error rendering right layer:', e);
    }
  }
}
