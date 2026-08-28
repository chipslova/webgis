import * as maplibregl from 'maplibre-gl';
import { PikselProduct, PikselPreset, PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../config/piksel';

export type PikselLoadingState = {
  isLoading: boolean;
  productId: string | null;
  productName?: string;
  isComputeHeavy?: boolean;
  hasError?: boolean;
};

export class PikselLoader {
  private map: maplibregl.Map;
  private activeProductId: string | null = null;
  private selectedYear: string = '2021';
  private currentOpacity: number = 0.85;
  private gridVisible: boolean = false;
  private popup: maplibregl.Popup;
  private isEventsBound: boolean = false;
  private onLoadingCallback: ((state: PikselLoadingState) => void) | null = null;
  private activeSourceId: string | null = null;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '340px'
    });
    this.attachMapSourceListeners();
  }

  /**
   * Real MapLibre source event listener for accurate tile loading detection
   */
  private attachMapSourceListeners() {
    if (!this.map) return;

    this.map.on('sourcedataloading', (e) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const prod = this.getActiveProduct();
        if (prod && this.onLoadingCallback) {
          this.onLoadingCallback({
            isLoading: true,
            productId: prod.id,
            productName: prod.name,
            isComputeHeavy: !!prod.isComputeHeavy
          });
        }
      }
    });

    this.map.on('sourcedata', (e) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId && e.isSourceLoaded) {
        const prod = this.getActiveProduct();
        if (prod && this.onLoadingCallback) {
          this.onLoadingCallback({
            isLoading: false,
            productId: prod.id,
            productName: prod.name,
            isComputeHeavy: !!prod.isComputeHeavy
          });
        }
      }
    });

    this.map.on('idle', () => {
      if (this.activeSourceId && this.map.isSourceLoaded(this.activeSourceId)) {
        const prod = this.getActiveProduct();
        if (prod && this.onLoadingCallback) {
          this.onLoadingCallback({
            isLoading: false,
            productId: prod.id,
            productName: prod.name,
            isComputeHeavy: !!prod.isComputeHeavy
          });
        }
      }
    });

    this.map.on('error', (e: any) => {
      if (this.activeSourceId && e.sourceId === this.activeSourceId) {
        const prod = this.getActiveProduct();
        if (prod && this.onLoadingCallback) {
          this.onLoadingCallback({
            isLoading: false,
            productId: prod.id,
            productName: prod.name,
            hasError: true
          });
        }
      }
    });
  }

  public onLoadingStateChange(cb: (state: PikselLoadingState) => void) {
    this.onLoadingCallback = cb;
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
    this.selectedYear = year;
    if (this.activeProductId) {
      const product = this.getActiveProduct();
      if (product && product.timeEnabled) {
        this.renderRasterLayer(product);
      }
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
    });
    ids.push('piksel-grid-fill', 'piksel-grid-line');
    return ids;
  }

  /**
   * Sets the active Piksel OGC product layer
   */
  public setActiveProduct(productId: string | null) {
    this.activeProductId = productId;

    if (!this.map) return;

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.setActiveProduct(productId));
      return;
    }

    // Hide all Piksel raster layers first
    PIKSEL_PRODUCTS.forEach((prod) => {
      const layerId = `piksel-raster-${prod.id}`;
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    });

    // If a product is selected, render/activate it
    if (productId) {
      const product = PIKSEL_PRODUCTS.find((p) => p.id === productId);
      if (product) {
        this.activeSourceId = `piksel-raster-src-${product.id}`;

        if (this.onLoadingCallback) {
          this.onLoadingCallback({
            isLoading: true,
            productId: product.id,
            productName: product.name,
            isComputeHeavy: !!product.isComputeHeavy
          });
        }

        this.renderRasterLayer(product);
      }
    } else {
      this.activeSourceId = null;
      if (this.onLoadingCallback) {
        this.onLoadingCallback({
          isLoading: false,
          productId: null
        });
      }
    }
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

    // MapLibre replaces {bbox-epsg-3857} dynamically per tile
    return `${product.serviceUrl}?${params.toString()}&BBOX={bbox-epsg-3857}`;
  }

  /**
   * Renders the raster layer for a specific OGC satellite product
   */
  private renderRasterLayer(product: PikselProduct) {
    if (!this.map) return;

    const sourceId = `piksel-raster-src-${product.id}`;
    const layerId = `piksel-raster-${product.id}`;
    const tileUrl = this.buildWmsTileUrl(product);

    try {
      // If source already exists, update its tile URL or remove and re-add for clean reload
      if (this.map.getSource(sourceId)) {
        if (this.map.getLayer(layerId)) {
          this.map.removeLayer(layerId);
        }
        this.map.removeSource(sourceId);
      }

      this.map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: product.attribution || '© Badan Informasi Geospasial (BIG) — Piksel'
      });

      this.map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        layout: { visibility: 'visible' },
        paint: {
          'raster-opacity': this.currentOpacity,
          'raster-fade-duration': 200
        }
      });
    } catch (e) {
      console.warn(`[PikselLoader] Layer error for ${product.id}:`, e);
    }
  }

  public setOpacity(opacity: number) {
    this.currentOpacity = opacity;

    if (!this.map || !this.activeProductId) return;

    const layerId = `piksel-raster-${this.activeProductId}`;
    if (this.map.getLayer(layerId)) {
      this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
    }
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
