import * as maplibregl from 'maplibre-gl';
import { PikselProduct, PikselPreset, PIKSEL_PRODUCTS, PIKSEL_PRESETS, S2_YEARS } from '../config/piksel';

export type PikselStatusCode = 'idle' | 'zoom_too_low' | 'requesting' | 'loading' | 'ready' | 'partial' | 'error';

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
  private currentOpacity: number = 0.85;
  private gridVisible: boolean = false;
  private popup: maplibregl.Popup;
  private isEventsBound: boolean = false;
  private onLoadingCallback: ((state: PikselLoadingState) => void) | null = null;
  private onLayersChangeCallbacks: Array<() => void> = [];

  // Request Manager State
  private requestCounter: number = 0;
  private activeRequestId: number = 0;
  private activeSourceId: string | null = null;
  private activeLayerId: string | null = null;

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
        console.warn('[PikselLoader] Error in layersChange callback:', e);
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
    const minZoom = prod?.minZoom ?? 6;

    if (this.requestStartTime > 0 && (status === 'ready' || status === 'partial' || status === 'error')) {
      this.currentLatencyMs = Math.round(performance.now() - this.requestStartTime);
    }

    let defaultMsg = '';
    switch (status) {
      case 'idle':
        defaultMsg = 'Tidak ada layer citra aktif';
        break;
      case 'zoom_too_low':
        defaultMsg = `Perbesar peta (Zoom ≥ ${minZoom}) untuk memproses komposit Piksel 10m`;
        break;
      case 'requesting':
        defaultMsg = `Menginisialisasi pipeline WMS ${prod?.name || ''}...`;
        break;
      case 'loading':
        defaultMsg = `Memproses tile satelit di Open Data Cube BIG (${this.tilesLoaded}/${Math.max(this.tilesRequested, 1)} tile)...`;
        break;
      case 'ready':
        defaultMsg = `Layer ${prod?.name || ''} siap ditampilkan`;
        break;
      case 'partial':
        defaultMsg = `Sebagian tile citra dimuat (${this.tilesLoaded}/${Math.max(this.tilesRequested, 1)} tile). Beberapa tile masih diproses di server.`;
        break;
      case 'error':
        defaultMsg = `Server OGC Piksel timeout / 500. Silakan perbesar peta atau pilih tahun lain.`;
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
   * Monitor zoom and move events dynamically
   */
  private attachMapZoomListeners() {
    if (!this.map) return;

    this.map.on('zoomstart', () => {
      if (this.activeSourceId) {
        this.tilesFailed = 0;
      }
    });

    this.map.on('movestart', () => {
      if (this.activeSourceId) {
        this.tilesFailed = 0;
      }
    });

    this.map.on('zoomend', () => {
      const prod = this.getActiveProduct();
      if (!prod) return;

      const currentZoom = this.map.getZoom();
      const minZoom = prod.minZoom ?? 6;

      if (currentZoom < minZoom) {
        this.emitState('zoom_too_low');
      } else if (this.currentStatus === 'zoom_too_low') {
        this.emitState('loading');
      }
    });
  }

  /**
   * Source lifecycle & tile telemetry listener
   */
  private attachMapSourceListeners() {
    if (!this.map) return;

    this.map.on('sourcedataloading', (e) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const currentZoom = this.map.getZoom();
        const prod = this.getActiveProduct();
        const minZoom = prod?.minZoom ?? 6;

        if (currentZoom >= minZoom) {
          this.tilesRequested++;
          this.emitState('loading');
        }
      }
    });

    this.map.on('sourcedata', (e) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const prod = this.getActiveProduct();
        if (!prod) return;

        const currentZoom = this.map.getZoom();
        const minZoom = prod.minZoom ?? 6;

        if (currentZoom < minZoom) {
          this.emitState('zoom_too_low');
          return;
        }

        if (e.isSourceLoaded) {
          this.tilesLoaded = Math.max(this.tilesLoaded, this.tilesRequested);
          // If all requested tiles arrived or map source is fully loaded
          if (this.tilesLoaded >= this.tilesRequested && this.tilesRequested > 0) {
            this.tilesFailed = 0; // Clear transient errors since source is fully loaded
            this.emitState('ready');
          } else if (this.tilesLoaded > 0 && this.tilesLoaded < this.tilesRequested) {
            this.emitState('partial');
          }
        }
      }
    });

    this.map.on('idle', () => {
      if (this.activeSourceId && this.map.isSourceLoaded(this.activeSourceId)) {
        const prod = this.getActiveProduct();
        if (!prod) return;

        const currentZoom = this.map.getZoom();
        const minZoom = prod.minZoom ?? 6;

        if (currentZoom < minZoom) {
          this.emitState('zoom_too_low');
        } else {
          // Source is 100% loaded and map is idle
          this.tilesLoaded = Math.max(this.tilesLoaded, this.tilesRequested);
          this.tilesFailed = 0;
          this.emitState('ready');
        }
      }
    });

    this.map.on('error', (e: any) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const prod = this.getActiveProduct();
        if (!prod) return;

        const currentZoom = this.map.getZoom();
        const minZoom = prod.minZoom ?? 6;

        if (currentZoom >= minZoom) {
          // Check if it's a persistent error or unrecoverable 500
          this.tilesFailed++;
          if (this.tilesLoaded === 0 && this.tilesRequested <= 2) {
            this.emitState('error');
          } else {
            this.emitState('partial');
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
        this.renderRasterLayer(product);
      }
    }
    this.notifyLayersChange();
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
    });
    ids.push('piksel-grid-fill', 'piksel-grid-line');
    return ids;
  }

  public getDiagnostics(): PikselDiagnostics {
    const prod = this.getActiveProduct();
    const currentZoom = this.map ? Number(this.map.getZoom().toFixed(1)) : 0;
    const minZoom = prod?.minZoom ?? 6;

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
        this.renderRasterLayer(product);
      }
    } else {
      this.emitState('idle');
    }

    this.notifyLayersChange();
  }

  private cleanupActiveRasterLayer() {
    if (!this.map) return;

    PIKSEL_PRODUCTS.forEach((prod) => {
      const lId = `piksel-raster-${prod.id}`;
      const sId = `piksel-raster-src-${prod.id}`;

      if (this.map.getLayer(lId)) {
        try {
          this.map.removeLayer(lId);
        } catch (_) {}
      }
      if (this.map.getSource(sId)) {
        try {
          this.map.removeSource(sId);
        } catch (_) {}
      }
    });

    this.activeSourceId = null;
    this.activeLayerId = null;
  }

  /**
   * Constructs the authentic OGC WMS URL for MapLibre Web Mercator tiling
   */
  private buildWmsTileUrl(product: PikselProduct): string {
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
      const yearToUse = (product.availableYears && product.availableYears.includes(this.selectedYear))
        ? this.selectedYear
        : (product.availableYears ? product.availableYears[0] : this.selectedYear);
      params.set('TIME', `${yearToUse}-01-01`);
    }

    return `${product.serviceUrl}?${params.toString()}&BBOX={bbox-epsg-3857}`;
  }

  /**
   * Renders the raster layer for a specific OGC satellite product with zoom gating
   */
  private renderRasterLayer(product: PikselProduct) {
    if (!this.map) return;

    const sourceId = `piksel-raster-src-${product.id}`;
    const layerId = `piksel-raster-${product.id}`;
    const tileUrl = this.buildWmsTileUrl(product);
    const minZoom = product.minZoom ?? 6;

    this.activeSourceId = sourceId;
    this.activeLayerId = layerId;

    // Reset tile telemetry
    this.tilesRequested = 0;
    this.tilesLoaded = 0;
    this.tilesFailed = 0;
    this.requestStartTime = performance.now();

    const currentZoom = this.map.getZoom();
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
        layout: { visibility: 'visible' },
        paint: {
          'raster-opacity': this.currentOpacity,
          'raster-fade-duration': 250
        }
      });
    } catch (e) {
      console.warn(`[PikselLoader] Layer error for ${product.id}:`, e);
      this.emitState('error', `Gagal menambahkan layer WMS: ${(e as Error).message}`);
    }
  }

  private rasterVisible: boolean = true;

  public isLayerVisible(): boolean {
    return this.rasterVisible;
  }

  public setLayerVisible(visible: boolean) {
    this.rasterVisible = visible;
    if (!this.map || !this.activeProductId) return;

    const layerId = `piksel-raster-${this.activeProductId}`;
    if (this.map.getLayer(layerId)) {
      this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
    this.notifyLayersChange();
  }

  public setOpacity(opacity: number) {
    this.currentOpacity = opacity;

    if (!this.map || !this.activeProductId) return;

    const layerId = `piksel-raster-${this.activeProductId}`;
    if (this.map.getLayer(layerId)) {
      this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
    }
    this.notifyLayersChange();
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
        console.warn('[PikselLoader] Grid layer error:', e);
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
          <div class="piksel-badge" style="background-color: #10b98122; color: #10b981; border: 1px solid #10b98166; margin-bottom: 6px;">
            Piksel Data Cube Grid
          </div>
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
