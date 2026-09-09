import * as maplibregl from 'maplibre-gl';
import { PIKSEL_PRODUCTS, PikselProduct } from '../config/piksel';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config/basemaps';
import { logger } from '../utils/logger';

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
    pitch: 20,
    description: 'Bandingkan tutupan hutan lebat 2018 (Kiri) vs Progres Infrastruktur & Indeks Vegetasi 2025 (Kanan).',
    left: { productId: 's2-geomad-rgb', year: '2018' },
    right: { productId: 's2-ndvi', year: '2025' }
  },
  {
    id: 'bromo-spectral',
    name: 'Kaldera Bromo (RGB vs NIR)',
    locationName: 'Jawa Timur',
    center: [112.9485, -7.9514],
    zoom: 12.5,
    pitch: 35,
    description: 'Bandingkan Warna Alami RGB (Kiri) vs Klorofil Inframerah Dekat NIR (Kanan).',
    left: { productId: 's2-geomad-rgb', year: '2025' },
    right: { productId: 's2-geomad-nir', year: '2025' }
  },
  {
    id: 'toba-water',
    name: 'Danau Toba (True Color vs NDWI)',
    locationName: 'Sumatera Utara',
    center: [98.8052, 2.5819],
    zoom: 11.0,
    pitch: 15,
    description: 'Bandingkan kenampakan optik pulau Samosir (Kiri) vs Pemisahan Indeks Badan Air NDWI (Kanan).',
    left: { productId: 's2-geomad-rgb', year: '2025' },
    right: { productId: 's2-ndwi', year: '2025' }
  },
  {
    id: 'merapi-history',
    name: 'Gunung Merapi (2018 vs 2025)',
    locationName: 'D.I. Yogyakarta',
    center: [110.4463, -7.5407],
    zoom: 12.2,
    pitch: 30,
    description: 'Bandingkan morfologi kubah lava dan alur lahar erupsi tahun 2018 vs kondisi 2025.',
    left: { productId: 's2-geomad-rgb', year: '2018' },
    right: { productId: 's2-geomad-rgb', year: '2025' }
  }
];

export class SwipeCompareManager {
  private primaryMap: maplibregl.Map;
  private compareMap: maplibregl.Map | null = null;
  private isCompareActive: boolean = false;
  private sliderPositionPercent: number = 50; // 0 to 100%

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

  constructor(primaryMap: maplibregl.Map) {
    this.primaryMap = primaryMap;
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
    this.notify();
  }

  public getLeftConfig(): CompareSideConfig {
    return { ...this.leftConfig };
  }

  public getRightConfig(): CompareSideConfig {
    return { ...this.rightConfig };
  }

  public setLeftConfig(config: Partial<CompareSideConfig>) {
    this.leftConfig = { ...this.leftConfig, ...config };
    this.renderLeftLayer();
    this.notify();
  }

  public setRightConfig(config: Partial<CompareSideConfig>) {
    this.rightConfig = { ...this.rightConfig, ...config };
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

    // Create container elements
    this.ensureOverlayElements();
    this.initCompareMap();

    if (preset) {
      this.primaryMap.flyTo({
        center: preset.center,
        zoom: preset.zoom,
        pitch: preset.pitch || 0,
        bearing: 0,
        duration: 1600,
        essential: true
      });
    }

    this.notify();
  }

  /**
   * Deactivates Swipe Comparison Mode and tears down the secondary canvas cleanly
   */
  public deactivate() {
    if (!this.isCompareActive) return;

    this.isCompareActive = false;

    // Remove event listeners
    if (this.syncListener) {
      this.primaryMap.off('move', this.syncListener);
      this.syncListener = null;
    }

    if (this.compareMap) {
      try {
        this.compareMap.remove();
      } catch (_) {}
      this.compareMap = null;
    }

    if (typeof document !== 'undefined') {
      const container = document.getElementById('swipe-compare-overlay');
      if (container) {
        container.remove();
      }
    }

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
    const compareMapDiv = document.getElementById('swipe-compare-map');
    if (!compareMapDiv) return;

    const bm = BASEMAPS.find((b) => b.id === this.leftConfig.basemapId) || BASEMAPS[0];

    this.compareMap = new maplibregl.Map({
      container: compareMapDiv,
      style: bm.styleUrl,
      center: this.primaryMap.getCenter(),
      zoom: this.primaryMap.getZoom(),
      pitch: this.primaryMap.getPitch(),
      bearing: this.primaryMap.getBearing(),
      attributionControl: false,
      interactive: false // Primary map drives interaction
    });

    this.compareMap.on('load', () => {
      this.renderLeftLayer();
    });

    // Synchronize camera movement seamlessly
    this.syncListener = () => {
      if (!this.compareMap) return;
      this.compareMap.jumpTo({
        center: this.primaryMap.getCenter(),
        zoom: this.primaryMap.getZoom(),
        pitch: this.primaryMap.getPitch(),
        bearing: this.primaryMap.getBearing()
      });
    };

    this.primaryMap.on('move', this.syncListener);
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
