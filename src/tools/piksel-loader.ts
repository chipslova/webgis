import * as maplibregl from 'maplibre-gl';
import { PikselProduct, PikselPreset, PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../config/piksel';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export type PikselStatusCode = 'idle' | 'zoom_too_low' | 'requesting' | 'loading' | 'ready' | 'degraded' | 'partial' | 'error';

export interface TimeLapseState {
  isPlaying: boolean;
  year: string;
  speedMs: number;
  availableYears: string[];
}

export interface PikselDiagnostics {
  productId: string | null;
  productName?: string;
  year?: string;
  minZoom: number;
  currentZoom: number;
  tilesRequested: number;
  tilesLoaded: number;
  tilesFailed: number;
  latencyMs: number;
  status: PikselStatusCode;
  statusMessage: string;
}

export type PikselLoadingState = {
  status: PikselStatusCode;
  isLoading: boolean;
  productId: string | null;
  productName?: string;
  isComputeHeavy?: boolean;
  minZoom?: number;
  currentZoom?: number;
  diagnostics?: PikselDiagnostics;
  hasError?: boolean;
  statusMessage?: string;
};

export class PikselLoader {
  private map: maplibregl.Map;
  private activeProductId: string | null = null;
  private selectedYear: string = '2025';
  private currentOpacity: number = 1.0;
  private currentBrightness: number = 0;
  private currentContrast: number = 0;
  private currentSaturation: number = 0;
  private gridVisible: boolean = false;
  private popup: maplibregl.Popup;
  private isEventsBound: boolean = false;
  private onLoadingCallback: ((state: PikselLoadingState) => void) | null = null;
  private onLayersChangeCallbacks: Array<() => void> = [];

  // Time-Lapse Animator State
  private timeLapseTimer: ReturnType<typeof setInterval> | null = null;
  private timeLapseSpeedMs: number = 2000;
  private onTimeLapseChangeCallbacks: Array<(state: TimeLapseState) => void> = [];

  // Request Manager State
  private requestCounter: number = 0;
  private activeRequestId: number = 0;
  private activeSourceId: string | null = null;
  private activeLayerId: string | null = null;

  // Double-Buffering & Cross-Fade Ping-Pong State (Time-Lapse Smooth Transition)
  private activeSlot: number = 0;
  private prefetchedYear: string | null = null;
  private crossFadeCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private maskEnabled: boolean = false;


  public isMaskEnabled(): boolean {
    return this.maskEnabled;
  }

  public setMaskEnabled(enabled: boolean) {
    this.maskEnabled = enabled;
    if (this.activeProductId === 's2-ndbi') {
      const prod = this.getActiveProduct();
      if (prod) {
        this.renderRasterLayer(prod, this.activeRequestId);
      }
    }
    this.notifyLayersChange();
  }

  public getActiveLayerId(): string | null {
    return this.activeLayerId;
  }

  public getLayerIdForSlot(productId: string, slot: number): string {
    return slot === 0 ? `piksel-raster-${productId}` : `piksel-raster-${productId}-buf`;
  }

  public getSourceIdForSlot(productId: string, slot: number): string {
    return slot === 0 ? `piksel-raster-src-${productId}` : `piksel-raster-src-${productId}-buf`;
  }

  public setBasemapCustomizer(_customizer: any) {
    // Preserved for modular compatibility
  }

  // Diagnostics & Telemetry
  private tilesRequested: number = 0;
  private tilesLoaded: number = 0;
  private tilesFailed: number = 0;
  private requestStartTime: number = 0;
  private currentLatencyMs: number = 0;
  private currentStatus: PikselStatusCode = 'idle';

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '340px'
    });

    this.attachMapSourceListeners();
    this.attachMapZoomListeners();
  }

  public onLayersChange(callback: () => void) {
    this.onLayersChangeCallbacks.push(callback);
  }

  private notifyLayersChange() {
    this.onLayersChangeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        logger.warn('[PikselLoader] Error in layersChange callback:', e);
      }
    });
  }

  public onLoadingStateChange(cb: (state: PikselLoadingState) => void) {
    this.onLoadingCallback = cb;
  }

  private emitState(status: PikselStatusCode, customMessage?: string) {
    this.currentStatus = status;
    const prod = this.getActiveProduct();
    const currentZoom = this.map ? Number(this.map.getZoom().toFixed(1)) : 0;
    const minZoom = prod?.minZoom ?? 8;

    if (this.requestStartTime > 0 && (status === 'ready' || status === 'degraded' || status === 'partial' || status === 'error')) {
      this.currentLatencyMs = Math.round(performance.now() - this.requestStartTime);
    }

    let defaultMsg = '';
    switch (status) {
      case 'idle':
        defaultMsg = 'Tidak ada lapisan raster satelit aktif';
        break;
      case 'zoom_too_low':
        defaultMsg = `Tingkat zoom peta saat ini adalah ${currentZoom}. Perbesar minimal ke Tingkat ${minZoom} (skala Pulau/Provinsi) untuk merender citra satelit resolusi tinggi.`;
        break;
      case 'requesting':
        defaultMsg = `Menghubungkan ke layanan OGC WMS untuk ${prod?.name || ''}...`;
        break;
      case 'loading':
        defaultMsg = `Memproses permintaan raster di BIG Open Data Cube...`;
        break;
      case 'ready':
        defaultMsg = `Citra ${prod?.name || ''} berhasil dirender`;
        break;
      case 'degraded':
      case 'partial':
        defaultMsg = `Raster termuat sebagian. Server upstream ODC mengalami latensi pada sejumlah tile.`;
        break;
      case 'error':
        defaultMsg = `Layanan OGC WMS untuk ${prod?.name || ''} mengalami kendala upstream (Batas Waktu / HTTP 500).`;
        break;
    }

    const statusMessage = customMessage || defaultMsg;

    const diagnostics: PikselDiagnostics = {
      productId: prod?.id || null,
      productName: prod?.name,
      year: this.selectedYear,
      minZoom,
      currentZoom,
      tilesRequested: this.tilesRequested,
      tilesLoaded: this.tilesLoaded,
      tilesFailed: this.tilesFailed,
      latencyMs: this.currentLatencyMs,
      status,
      statusMessage
    };

    if (this.onLoadingCallback) {
      this.onLoadingCallback({
        status,
        isLoading: status === 'requesting' || status === 'loading',
        productId: prod?.id || null,
        productName: prod?.name,
        isComputeHeavy: !!prod?.isComputeHeavy,
        minZoom,
        currentZoom,
        diagnostics,
        hasError: status === 'error',
        statusMessage
      });
    }
  }

  /**
   * Quick helper to smoothly zoom the map to the minimum level required for the active product
   */
  public zoomToMinZoom(targetPreset?: PikselPreset) {
    if (!this.map) return;
    if (targetPreset) {
      this.flyToPreset(targetPreset);
      return;
    }
    const prod = this.getActiveProduct();
    const minZ = prod?.minZoom ?? 8;
    const targetZ = Math.max(minZ, 8.5);

    this.map.easeTo({
      zoom: targetZ,
      duration: 1200,
      essential: true
    });
  }

  /**
   * Intelligently flies or zooms the map to ensure satellite imagery is immediately visible and sharpest.
   * Directs the camera directly to where data is most abundant and clearest (above minZoom, at optimal focal view).
   */
  public autoFlyToOptimalView(productId?: string, forceFly: boolean = false): string | null {
    if (!this.map) return null;
    const targetId = productId || this.activeProductId;
    if (!targetId) return null;

    const prod = PIKSEL_PRODUCTS.find((p) => p.id === targetId);
    if (!prod) return null;

    const minZoom = prod.minZoom ?? 8;
    const currentZoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : 0;
    const currentCenter = typeof this.map.getCenter === 'function' ? this.map.getCenter() : null;

    const matchingPreset = PIKSEL_PRESETS.find((p) => p.recommendedProduct === targetId)
      || PIKSEL_PRESETS.find((p) => p.id === 'bromo')
      || PIKSEL_PRESETS[0];

    const targetCenter: [number, number] = prod.optimalFocus?.center
      || matchingPreset?.center
      || [112.9485, -7.9514];

    const targetZoom: number = Math.max(
      minZoom,
      prod.optimalFocus?.zoom ?? matchingPreset?.zoom ?? 11.0
    );

    const targetPitch: number = prod.optimalFocus?.pitch ?? matchingPreset?.pitch ?? 0;
    const targetBearing: number = prod.optimalFocus?.bearing ?? 0;
    const locationName: string = prod.optimalFocus?.name ?? matchingPreset?.name ?? 'Area Rekomendasi';

    // Calculate distance from current camera center to target optimal hotspot
    let isClose = false;
    if (currentCenter) {
      const dLng = Math.abs(currentCenter.lng - targetCenter[0]);
      const dLat = Math.abs(currentCenter.lat - targetCenter[1]);
      if (dLng < 0.25 && dLat < 0.25) {
        isClose = true;
      }
    }

    // Always navigate if:
    // 1. forceFly is true (e.g. user selected product in UI)
    // 2. OR currentZoom < minZoom (needs zooming in)
    // 3. OR not close to the richest data hotspot
    if (forceFly || currentZoom < minZoom || !isClose) {
      if (typeof this.map.flyTo === 'function') {
        this.map.flyTo({
          center: targetCenter,
          zoom: targetZoom,
          pitch: targetPitch,
          bearing: targetBearing,
          duration: 1800,
          essential: true
        });
      }
      return locationName;
    }

    // If already in the target area, but zoom is slightly below the optimal clear zoom
    if (currentZoom < targetZoom) {
      if (typeof this.map.easeTo === 'function') {
        this.map.easeTo({
          zoom: targetZoom,
          duration: 1200,
          essential: true
        });
      }
      return locationName;
    }

    return null;
  }

  /**
   * Retry loading the active product WMS layer
   */
  public retryCurrentProduct() {
    const prod = this.getActiveProduct();
    if (prod && !prod.isDisabled) {
      this.tilesFailed = 0;
      this.tilesLoaded = 0;
      this.tilesRequested = 0;
      const currentReqId = ++this.requestCounter;
      this.activeRequestId = currentReqId;
      this.cleanupActiveRasterLayer();
      this.renderRasterLayer(prod, currentReqId);
    }
  }

  /**
   * Monitor zoom and move events dynamically
   */
  private attachMapZoomListeners() {
    if (!this.map) return;

    this.map.on('zoomend', () => {
      const prod = this.getActiveProduct();
      if (!prod) return;

      const currentZoom = this.map.getZoom();
      const minZoom = prod.minZoom ?? 8;

      if (currentZoom < minZoom) {
        this.emitState('zoom_too_low');
      } else if (this.currentStatus === 'zoom_too_low') {
        this.emitState('loading');
      }
    });
  }

  /**
   * Source lifecycle & raster request telemetry listener
   */
  private attachMapSourceListeners() {
    if (!this.map) return;

    this.map.on('sourcedataloading', (e) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const currentZoom = this.map.getZoom();
        const prod = this.getActiveProduct();
        const minZoom = prod?.minZoom ?? 8;

        if (currentZoom >= minZoom) {
          this.tilesRequested++;
          if (this.currentStatus !== 'loading' && this.currentStatus !== 'requesting') {
            this.emitState('loading');
          }
        }
      }
    });

    this.map.on('sourcedata', (e) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const prod = this.getActiveProduct();
        if (!prod) return;

        const currentZoom = this.map.getZoom();
        const minZoom = prod.minZoom ?? 8;

        if (currentZoom < minZoom) {
          this.emitState('zoom_too_low');
          return;
        }

        if (e.isSourceLoaded) {
          this.tilesLoaded = this.tilesRequested;
          if (this.tilesFailed > 0) {
            this.emitState('degraded');
          } else {
            this.emitState('ready');
          }
        }
      }
    });

    this.map.on('idle', () => {
      if (this.activeSourceId && this.map.isSourceLoaded(this.activeSourceId)) {
        const prod = this.getActiveProduct();
        if (!prod) return;

        const currentZoom = this.map.getZoom();
        const minZoom = prod.minZoom ?? 8;

        if (currentZoom < minZoom) {
          this.emitState('zoom_too_low');
        } else {
          this.tilesLoaded = this.tilesRequested;
          if (this.tilesFailed > 0) {
            this.emitState('degraded');
          } else {
            this.emitState('ready');
          }
        }
      }
    });

    this.map.on('error', (e: any) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const prod = this.getActiveProduct();
        if (!prod) return;

        const currentZoom = this.map.getZoom();
        const minZoom = prod.minZoom ?? 8;

        if (currentZoom >= minZoom) {
          this.tilesFailed++;
          // Only trigger full error if zero successful data events occurred and repeated errors
          if (this.tilesLoaded === 0 && this.tilesFailed >= 2) {
            this.emitState('error');
          } else {
            this.emitState('degraded');
          }
        }
      }
    });
  }

  public getProducts(): PikselProduct[] {
    return PIKSEL_PRODUCTS;
  }

  public getPresets(): PikselPreset[] {
    return PIKSEL_PRESETS;
  }

  public getMap(): maplibregl.Map {
    return this.map;
  }

  public getActiveProductId(): string | null {
    return this.activeProductId;
  }

  public getActiveProduct(): PikselProduct | null {
    return PIKSEL_PRODUCTS.find((p) => p.id === this.activeProductId) || null;
  }

  public getSelectedYear(): string {
    return this.selectedYear;
  }

  public setSelectedYear(year: string) {
    if (this.selectedYear === year) return;
    this.selectedYear = year;

    if (this.activeProductId) {
      const product = this.getActiveProduct();
      if (product && product.timeEnabled) {
        const currentReqId = ++this.requestCounter;
        this.activeRequestId = currentReqId;
        // Smooth Double-Buffering Cross-Fade: keep old year visible as backplate while loading new year
        this.transitionToYear(product, year, currentReqId);
      }
    }
    this.notifyLayersChange();
    this.notifyTimeLapseChange();
  }

  // --- Time-Lapse Animator Methods ---

  public isTimeLapsePlaying(): boolean {
    return this.timeLapseTimer !== null;
  }

  public getTimeLapseSpeed(): number {
    return this.timeLapseSpeedMs;
  }

  public setTimeLapseSpeed(speedMs: number) {
    this.timeLapseSpeedMs = Math.max(500, Math.min(10000, speedMs));
    if (this.isTimeLapsePlaying()) {
      this.pauseTimeLapse();
      this.playTimeLapse();
    } else {
      this.notifyTimeLapseChange();
    }
  }

  public onTimeLapseChange(callback: (state: TimeLapseState) => void) {
    this.onTimeLapseChangeCallbacks.push(callback);
  }

  public getTimeLapseState(): TimeLapseState {
    return {
      isPlaying: this.isTimeLapsePlaying(),
      year: this.selectedYear,
      speedMs: this.timeLapseSpeedMs,
      availableYears: this.getChronologicalYears()
    };
  }

  private notifyTimeLapseChange() {
    const state = this.getTimeLapseState();
    this.onTimeLapseChangeCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        logger.warn('[PikselLoader] Error in onTimeLapseChange callback:', e);
      }
    });
  }

  public getChronologicalYears(): string[] {
    const prod = this.getActiveProduct();
    if (!prod || !prod.availableYears || prod.availableYears.length === 0) {
      return [this.selectedYear];
    }
    return [...prod.availableYears].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  public stepTimeLapse(direction: 1 | -1) {
    const years = this.getChronologicalYears();
    if (years.length <= 1) return;

    let currentIndex = years.indexOf(this.selectedYear);
    if (currentIndex === -1) currentIndex = 0;

    let nextIndex = currentIndex + direction;
    if (nextIndex >= years.length) {
      nextIndex = 0;
    } else if (nextIndex < 0) {
      nextIndex = years.length - 1;
    }

    const nextYear = years[nextIndex];
    this.setSelectedYear(nextYear);
  }

  public playTimeLapse() {
    const prod = this.getActiveProduct();
    if (!prod || !prod.timeEnabled) return;

    if (this.timeLapseTimer) {
      clearInterval(this.timeLapseTimer);
      this.timeLapseTimer = null;
    }

    // Immediately prefetch the upcoming frame into dormant GPU memory for instant first step
    this.prefetchNextYear();

    this.timeLapseTimer = setInterval(() => {
      this.stepTimeLapse(1);
    }, this.timeLapseSpeedMs);

    this.notifyTimeLapseChange();
  }

  public pauseTimeLapse() {
    if (this.timeLapseTimer) {
      clearInterval(this.timeLapseTimer);
      this.timeLapseTimer = null;
      this.notifyTimeLapseChange();
    }
  }

  public toggleTimeLapse() {
    if (this.isTimeLapsePlaying()) {
      this.pauseTimeLapse();
    } else {
      this.playTimeLapse();
    }
  }

  public getOpacity(): number {
    return this.currentOpacity;
  }

  public isGridVisible(): boolean {
    return this.gridVisible;
  }

  public getAllMapLayerIds(): string[] {
    const ids: string[] = [];
    PIKSEL_PRODUCTS.forEach((p) => {
      ids.push(`piksel-raster-${p.id}`);
      ids.push(`piksel-raster-${p.id}-buf`);
    });
    ids.push('piksel-ndbi-water-mask', 's2-ndwi-mask-layer');
    ids.push('piksel-grid-fill', 'piksel-grid-line');
    return ids;
  }

  public getDiagnostics(): PikselDiagnostics {
    const prod = this.getActiveProduct();
    const currentZoom = this.map ? Number(this.map.getZoom().toFixed(1)) : 0;
    const minZoom = prod?.minZoom ?? 8;

    return {
      productId: prod?.id || null,
      productName: prod?.name,
      year: this.selectedYear,
      minZoom,
      currentZoom,
      tilesRequested: this.tilesRequested,
      tilesLoaded: this.tilesLoaded,
      tilesFailed: this.tilesFailed,
      latencyMs: this.currentLatencyMs,
      status: this.currentStatus,
      statusMessage: ''
    };
  }

  /**
   * Sets the active Piksel OGC product layer with monotonic request tracking
   */
  public setActiveProduct(productId: string | null) {
    if (this.isTimeLapsePlaying()) {
      this.pauseTimeLapse();
    }
    this.activeProductId = productId;
    const currentReqId = ++this.requestCounter;
    this.activeRequestId = currentReqId;

    if (!this.map) return;

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => {
        if (this.activeRequestId === currentReqId) {
          this.setActiveProduct(productId);
        }
      });
      return;
    }

    // Hide/remove previous active raster layers cleanly
    this.cleanupActiveRasterLayer();

    if (productId) {
      const product = PIKSEL_PRODUCTS.find((p) => p.id === productId);
      if (product) {
        if (product.isDisabled) {
          logger.warn(`[PikselLoader] Product ${product.id} is disabled. Skipping WMS request.`);
          this.activeProductId = null;
          this.emitState('idle');
          this.notifyLayersChange();
          return;
        }


        this.renderRasterLayer(product, currentReqId);
      }
    } else {
      this.emitState('idle');
    }

    this.notifyLayersChange();
  }

  private cleanupActiveRasterLayer() {
    if (!this.map) return;

    if (this.crossFadeCleanupTimer) {
      clearTimeout(this.crossFadeCleanupTimer);
      this.crossFadeCleanupTimer = null;
    }

    PIKSEL_PRODUCTS.forEach((prod) => {
      [0, 1].forEach((slot) => {
        const lId = this.getLayerIdForSlot(prod.id, slot);
        const sId = this.getSourceIdForSlot(prod.id, slot);

        if (this.map.getLayer(lId)) {
          try { this.map.removeLayer(lId); } catch (_) {}
        }
        if (this.map.getSource(sId)) {
          try { this.map.removeSource(sId); } catch (_) {}
        }
      });
    });

    // Also remove mask layers if present
    const maskLayerIds = ['piksel-ndbi-water-mask', 's2-ndwi-mask-layer'];
    const maskSourceIds = ['piksel-water-mask-src', 's2-ndwi-mask-src'];
    maskLayerIds.forEach((lId) => {
      if (this.map.getLayer(lId)) { try { this.map.removeLayer(lId); } catch (_) {} }
    });
    maskSourceIds.forEach((sId) => {
      if (this.map.getSource(sId)) { try { this.map.removeSource(sId); } catch (_) {} }
    });

    this.activeSourceId = null;
    this.activeLayerId = null;
    this.activeSlot = 0;
    this.prefetchedYear = null;
  }

  /**
   * Constructs the authentic OGC WMS URL for MapLibre Web Mercator tiling
   */
  private buildWmsTileUrl(product: PikselProduct, targetYear?: string): string {
    const yearToUse = targetYear || (
      (product.availableYears && product.availableYears.includes(this.selectedYear))
        ? this.selectedYear
        : (product.availableYears ? product.availableYears[0] : this.selectedYear)
    );

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
          params.set('TIME', `${yearToUse}-01-01/${yearToUse}-12-31`);
          break;
        case 'annual':
        default:
          params.set('TIME', `${yearToUse}-01-01`);
          break;
      }
    }

    const url = `${product.serviceUrl}?${params.toString()}&BBOX={bbox-epsg-3857}`;
    logger.log('[Piksel WMS]', {
      product: product.id,
      layer: product.layer,
      style: product.style,
      year: yearToUse,
      timeMode: product.timeMode,
      url
    });
    return url;
  }

  /**
   * Renders the raster layer for a specific OGC satellite product with zoom gating
   */
  private renderRasterLayer(product: PikselProduct, requestId = this.activeRequestId) {
    if (!this.map) return;
    if (requestId !== this.activeRequestId) return;

    const slot = 0;
    this.activeSlot = slot;
    const sourceId = this.getSourceIdForSlot(product.id, slot);
    const layerId = this.getLayerIdForSlot(product.id, slot);
    const tileUrl = this.buildWmsTileUrl(product);
    const minZoom = product.minZoom ?? 8;

    this.activeSourceId = sourceId;
    this.activeLayerId = layerId;

    // Reset tile telemetry
    this.tilesRequested = 0;
    this.tilesLoaded = 0;
    this.tilesFailed = 0;
    this.requestStartTime = performance.now();

    const currentZoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : 10;
    if (currentZoom < minZoom) {
      this.emitState('zoom_too_low');
    } else {
      this.emitState('requesting');
    }

    try {
      // Remove layer and source cleanly if existing
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }

      this.map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: minZoom,
        maxzoom: 18,
        attribution: product.attribution || '© Badan Informasi Geospasial (BIG) — Piksel'
      });

      this.map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        minzoom: minZoom,
        maxzoom: 18,
        layout: { visibility: this.rasterVisible ? 'visible' : 'none' },
        paint: {
          'raster-opacity': this.currentOpacity,
          'raster-fade-duration': 0,
          'raster-resampling': 'nearest',
          'raster-brightness-min': this.currentBrightness > 0 ? this.currentBrightness * 0.5 : 0,
          'raster-brightness-max': this.currentBrightness < 0 ? Math.max(0.2, 1 + this.currentBrightness * 0.5) : 1,
          'raster-contrast': product.id === 's2-ndbi' ? Math.max(0.2, this.currentContrast) : this.currentContrast,
          'raster-saturation': this.currentSaturation
        }
      });

      // Built-in automatic water/ocean masking for NDBI (prevents marine/water areas from being detected as buildings)
      const waterMaskLayerId = 'piksel-ndbi-water-mask';
      const waterMaskSourceId = 'piksel-water-mask-src';
      if (this.map.getLayer(waterMaskLayerId)) { try { this.map.removeLayer(waterMaskLayerId); } catch (_) {} }
      if (this.map.getSource(waterMaskSourceId)) { try { this.map.removeSource(waterMaskSourceId); } catch (_) {} }

      if (product.id === 's2-ndbi') {
        try {
          if (!this.map.getSource(waterMaskSourceId)) {
            this.map.addSource(waterMaskSourceId, {
              type: 'vector',
              url: 'https://tiles.openfreemap.org/planet'
            });
          }

          this.map.addLayer({
            id: waterMaskLayerId,
            type: 'fill',
            source: waterMaskSourceId,
            'source-layer': 'water',
            minzoom: 0,
            maxzoom: 22,
            layout: { visibility: this.rasterVisible ? 'visible' : 'none' },
            paint: {
              'fill-color': '#0369a1',
              'fill-opacity': this.currentOpacity * 0.92
            }
          });
        } catch (err) {
          logger.warn('[PikselLoader] NDBI water mask layer notice:', err);
        }
      }

      // If time-enabled, prime the upcoming frame in background cache
      if (product.timeEnabled && product.availableYears && product.availableYears.length > 1) {
        setTimeout(() => this.prefetchNextYear(), 500);
      }
    } catch (e) {
      ErrorHandler.getInstance().showThrottledError(`Failed to load satellite layer ${product.name}.`);
      logger.warn(`[PikselLoader] Layer error for ${product.id}:`, e);
      this.emitState('error', `Failed to add WMS layer: ${(e as Error).message}`);
    }
  }

  /**
   * Pre-fetches the subsequent chronological year's tiles in the background idle slot
   * so the next transition has 0ms latency and 0% basemap leakage.
   */
  public prefetchNextYear() {
    if (!this.map || !this.activeProductId) return;
    const prod = this.getActiveProduct();
    if (!prod || !prod.timeEnabled || !prod.availableYears || prod.availableYears.length <= 1) return;

    const years = this.getChronologicalYears();
    const currentIndex = years.indexOf(this.selectedYear);
    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + 1) % years.length;
    const nextYear = years[nextIndex];

    const idleSlot = this.activeSlot === 0 ? 1 : 0;
    const prefetchSourceId = this.getSourceIdForSlot(prod.id, idleSlot);
    const prefetchLayerId = this.getLayerIdForSlot(prod.id, idleSlot);
    const tileUrl = this.buildWmsTileUrl(prod, nextYear);
    const minZoom = prod.minZoom ?? 8;

    try {
      if (this.map.getLayer(prefetchLayerId)) {
        this.map.removeLayer(prefetchLayerId);
      }
      if (this.map.getSource(prefetchSourceId)) {
        this.map.removeSource(prefetchSourceId);
      }

      this.map.addSource(prefetchSourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: minZoom,
        maxzoom: 18,
        attribution: prod.attribution || '© Badan Informasi Geospasial (BIG) — Piksel'
      });

      this.map.addLayer({
        id: prefetchLayerId,
        type: 'raster',
        source: prefetchSourceId,
        minzoom: minZoom,
        maxzoom: 18,
        layout: { visibility: 'visible' },
        paint: {
          'raster-opacity': 0.0001, // Dormant in GPU memory, invisible to user
          'raster-fade-duration': 0,
          'raster-resampling': 'nearest',
          'raster-brightness-min': this.currentBrightness > 0 ? this.currentBrightness * 0.5 : 0,
          'raster-brightness-max': this.currentBrightness < 0 ? Math.max(0.2, 1 + this.currentBrightness * 0.5) : 1,
          'raster-contrast': prod.id === 's2-ndbi' ? Math.max(0.2, this.currentContrast) : this.currentContrast,
          'raster-saturation': this.currentSaturation
        }
      });
      this.prefetchedYear = nextYear;
    } catch (_) {}
  }

  /**
   * Performs seamless Double-Buffering cross-fade transition between years without basemap flicker.
   */
  private transitionToYear(product: PikselProduct, targetYear: string, requestId: number) {
    if (!this.map) return;
    if (requestId !== this.activeRequestId) return;

    const currentSlot = this.activeSlot;
    const nextSlot = currentSlot === 0 ? 1 : 0;

    const currentLayerId = this.getLayerIdForSlot(product.id, currentSlot);
    const currentSourceId = this.getSourceIdForSlot(product.id, currentSlot);

    const nextLayerId = this.getLayerIdForSlot(product.id, nextSlot);
    const nextSourceId = this.getSourceIdForSlot(product.id, nextSlot);

    const minZoom = product.minZoom ?? 8;
    const currentZoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : 10;

    // Check if nextLayerId was already pre-fetched in GPU memory
    const isPrefetched = this.prefetchedYear === targetYear && this.map.getLayer(nextLayerId);

    if (isPrefetched) {
      // 0ms instant transition!
      try {
        if (typeof this.map.setPaintProperty === 'function') {
          this.map.setPaintProperty(nextLayerId, 'raster-opacity', this.currentOpacity);
        }
      } catch (_) {}

      this.activeSlot = nextSlot;
      this.activeLayerId = nextLayerId;
      this.activeSourceId = nextSourceId;
      this.prefetchedYear = null;

      // Clean up previous year layer after cross-fade duration (350ms)
      if (this.crossFadeCleanupTimer) {
        clearTimeout(this.crossFadeCleanupTimer);
      }
      this.crossFadeCleanupTimer = setTimeout(() => {
        try {
          if (this.map && typeof this.map.getLayer === 'function' && this.map.getLayer(currentLayerId)) {
            this.map.removeLayer(currentLayerId);
          }
          if (this.map && typeof this.map.getSource === 'function' && this.map.getSource(currentSourceId)) {
            this.map.removeSource(currentSourceId);
          }
        } catch (_) {}
      }, 350);

      // Pre-fetch subsequent frame into newly-vacated slot
      if (this.isTimeLapsePlaying()) {
        setTimeout(() => this.prefetchNextYear(), 400);
      }
      return;
    }

    // Manual jump or unprefetched transition:
    // Add nextLayerId ON TOP of currentLayerId so currentLayerId acts as solid backplate (0% basemap leakage)
    const tileUrl = this.buildWmsTileUrl(product, targetYear);
    this.activeSourceId = nextSourceId;
    this.activeLayerId = nextLayerId;
    this.activeSlot = nextSlot;

    this.tilesRequested = 0;
    this.tilesLoaded = 0;
    this.tilesFailed = 0;
    this.requestStartTime = performance.now();

    if (currentZoom < minZoom) {
      this.emitState('zoom_too_low');
    } else {
      this.emitState('requesting');
    }

    try {
      if (this.map.getLayer(nextLayerId)) {
        this.map.removeLayer(nextLayerId);
      }
      if (this.map.getSource(nextSourceId)) {
        this.map.removeSource(nextSourceId);
      }

      this.map.addSource(nextSourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: minZoom,
        maxzoom: 18,
        attribution: product.attribution || '© Badan Informasi Geospasial (BIG) — Piksel'
      });

      this.map.addLayer({
        id: nextLayerId,
        type: 'raster',
        source: nextSourceId,
        minzoom: minZoom,
        maxzoom: 18,
        layout: { visibility: this.rasterVisible ? 'visible' : 'none' },
        paint: {
          'raster-opacity': this.currentOpacity,
          'raster-fade-duration': 0,
          'raster-resampling': 'nearest',
          'raster-brightness-min': this.currentBrightness > 0 ? this.currentBrightness * 0.5 : 0,
          'raster-brightness-max': this.currentBrightness < 0 ? Math.max(0.2, 1 + this.currentBrightness * 0.5) : 1,
          'raster-contrast': product.id === 's2-ndbi' ? Math.max(0.2, this.currentContrast) : this.currentContrast,
          'raster-saturation': this.currentSaturation
        }
      });

      // Keep currentLayerId visible until new tiles have cross-faded in (500ms)
      if (this.crossFadeCleanupTimer) {
        clearTimeout(this.crossFadeCleanupTimer);
      }
      this.crossFadeCleanupTimer = setTimeout(() => {
        try {
          if (this.map && typeof this.map.getLayer === 'function' && this.map.getLayer(currentLayerId)) {
            this.map.removeLayer(currentLayerId);
          }
          if (this.map && typeof this.map.getSource === 'function' && this.map.getSource(currentSourceId)) {
            this.map.removeSource(currentSourceId);
          }
        } catch (_) {}
      }, 500);

      // Pre-fetch subsequent frame
      if (this.isTimeLapsePlaying()) {
        setTimeout(() => this.prefetchNextYear(), 600);
      }
    } catch (e) {
      logger.warn(`[PikselLoader] Cross-fade transition fallback for ${product.id}:`, e);
      this.renderRasterLayer(product, requestId);
    }
  }

  private rasterVisible: boolean = true;

  public isLayerVisible(): boolean {
    return this.rasterVisible;
  }

  public setLayerVisible(visible: boolean) {
    this.rasterVisible = visible;
    if (!this.map || !this.activeProductId) return;

    [0, 1].forEach((slot) => {
      const layerId = this.getLayerIdForSlot(this.activeProductId!, slot);
      if (typeof this.map.getLayer === 'function' && this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
    ['piksel-ndbi-water-mask', 's2-ndwi-mask-layer'].forEach((mId) => {
      if (typeof this.map.getLayer === 'function' && this.map.getLayer(mId)) {
        this.map.setLayoutProperty(mId, 'visibility', visible ? 'visible' : 'none');
      }
    });
    this.notifyLayersChange();
  }

  public setOpacity(opacity: number) {
    this.currentOpacity = opacity;

    if (!this.map || !this.activeProductId) return;

    [0, 1].forEach((slot) => {
      const layerId = this.getLayerIdForSlot(this.activeProductId!, slot);
      if (typeof this.map.getLayer === 'function' && this.map.getLayer(layerId)) {
        this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
      }
    });
    if (typeof this.map.getLayer === 'function' && this.map.getLayer('piksel-ndbi-water-mask')) {
      this.map.setPaintProperty('piksel-ndbi-water-mask', 'fill-opacity', opacity * 0.92);
    }
    if (typeof this.map.getLayer === 'function' && this.map.getLayer('s2-ndwi-mask-layer')) {
      this.map.setPaintProperty('s2-ndwi-mask-layer', 'raster-opacity', opacity * 0.7);
    }
    this.notifyLayersChange();
  }

  public getFilters() {
    return {
      brightness: this.currentBrightness,
      contrast: this.currentContrast,
      saturation: this.currentSaturation
    };
  }

  public setBrightness(val: number) {
    this.currentBrightness = Math.max(-1, Math.min(1, val));
    this.applyRasterFilters();
  }

  public setContrast(val: number) {
    this.currentContrast = Math.max(-1, Math.min(1, val));
    this.applyRasterFilters();
  }

  public setSaturation(val: number) {
    this.currentSaturation = Math.max(-1, Math.min(1, val));
    this.applyRasterFilters();
  }

  public resetFilters() {
    this.currentBrightness = 0;
    this.currentContrast = 0;
    this.currentSaturation = 0;
    this.applyRasterFilters();
  }

  private applyRasterFilters() {
    if (!this.map || !this.activeProductId) return;
    const bMin = this.currentBrightness > 0 ? this.currentBrightness * 0.5 : 0;
    const bMax = this.currentBrightness < 0 ? Math.max(0.2, 1 + this.currentBrightness * 0.5) : 1;

    [0, 1].forEach((slot) => {
      const layerId = this.getLayerIdForSlot(this.activeProductId!, slot);
      if (typeof this.map.getLayer === 'function' && this.map.getLayer(layerId)) {
        try {
          this.map.setPaintProperty(layerId, 'raster-brightness-min', bMin);
          this.map.setPaintProperty(layerId, 'raster-brightness-max', bMax);
          const contrastVal = this.activeProductId === 's2-ndbi' 
            ? (this.currentContrast === 0 ? 0.2 : this.currentContrast)
            : this.currentContrast;
          this.map.setPaintProperty(layerId, 'raster-contrast', contrastVal);
          this.map.setPaintProperty(layerId, 'raster-saturation', this.currentSaturation);
        } catch (_) {}
      }
    });
  }

  public setGridVisible(visible: boolean) {
    this.gridVisible = visible;

    if (!this.map) return;

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.setGridVisible(visible));
      return;
    }

    const sourceId = 'piksel-grid-source';
    const fillId = 'piksel-grid-fill';
    const lineId = 'piksel-grid-line';

    if (visible) {
      try {
        if (!this.map.getSource(sourceId)) {
          this.map.addSource(sourceId, {
            type: 'geojson',
            data: '/data/piksel_s2_regions.geojson'
          });
        }

        if (!this.map.getLayer(fillId)) {
          this.map.addLayer({
            id: fillId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: 'visible' },
            paint: {
              'fill-color': '#10b981',
              'fill-opacity': 0.05
            }
          });
        } else {
          this.map.setLayoutProperty(fillId, 'visibility', 'visible');
        }

        if (!this.map.getLayer(lineId)) {
          this.map.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            layout: { visibility: 'visible' },
            paint: {
              'line-color': '#10b981',
              'line-width': 1.5,
              'line-opacity': 0.8,
              'line-dasharray': [4, 2]
            }
          });
        } else {
          this.map.setLayoutProperty(lineId, 'visibility', 'visible');
        }

        if (!this.isEventsBound) {
          this.bindGridEvents();
          this.isEventsBound = true;
        }
      } catch (e) {
        logger.warn('[PikselLoader] Grid layer error:', e);
      }
    } else {
      if (this.map.getLayer(fillId)) {
        this.map.setLayoutProperty(fillId, 'visibility', 'none');
      }
      if (this.map.getLayer(lineId)) {
        this.map.setLayoutProperty(lineId, 'visibility', 'none');
      }
    }

    this.notifyLayersChange();
  }

  private bindGridEvents() {
    const fillId = 'piksel-grid-fill';

    this.map.on('click', fillId, (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties || {};
      const regionCode = props.region_code || props.label || 'N/A';
      const sceneInfo = props.count ? `${props.count} Scene Satelit` : 'Tersedia di Open Data Cube';

      const html = `
        <div class="gee-popup-card">
          <span class="gee-popup-badge piksel_tilegrid">Piksel Data Cube Grid</span>
          <h4>🛰️ Tile Grid: <code>${regionCode}</code></h4>
          <table class="gee-popup-table">
            <tr><td><strong>Dataset:</strong></td><td>Sentinel-2 MSI Surface Reflectance</td></tr>
            <tr><td><strong>Jumlah Scene:</strong></td><td><strong>${sceneInfo}</strong></td></tr>
            <tr><td><strong>Resolusi Grid:</strong></td><td>10 meter (Data Cube Terindeks)</td></tr>
          </table>
          <div style="margin-top: 8px;">
            <a href="https://explorer.piksel.big.go.id/products/s2_geomad_annual" target="_blank" rel="noopener noreferrer" style="color: #06b6d4; font-size: 11px; text-decoration: underline;">
              Buka Katalog Produk BIG Piksel &rarr;
            </a>
          </div>
        </div>
      `;

      this.popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
    });

    this.map.on('mouseenter', fillId, () => (this.map.getCanvas().style.cursor = 'pointer'));
    this.map.on('mouseleave', fillId, () => (this.map.getCanvas().style.cursor = ''));
  }

  public flyToPreset(preset: PikselPreset) {
    if (!this.map) return;

    this.map.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      pitch: preset.pitch || 0,
      bearing: 0,
      duration: 1800,
      essential: true
    });

    // Automatically activate the optimal satellite analysis product for this preset location
    if (preset.recommendedProduct) {
      this.setActiveProduct(preset.recommendedProduct);
    }
  }

  public restoreAfterStyleChange() {
    if (this.activeProductId) {
      this.setActiveProduct(this.activeProductId);
    }
    if (this.gridVisible) {
      this.setGridVisible(true);
    }
  }
}
