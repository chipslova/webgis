import * as maplibregl from 'maplibre-gl';

export interface PikselProduct {
  id: string;
  name: string;
  layerName: string;
  description: string;
  badge: string;
  color: string;
  resolution: string;
  sensor: string;
  whatItShows: string;
  legendType: 'natural' | 'radar' | 'thermal' | 'falsecolor';
  rasterTileUrl?: string;
}

export interface PikselPreset {
  id: string;
  name: string;
  locationName: string;
  center: [number, number];
  zoom: number;
  pitch?: number;
  description: string;
  recommendedProduct: string;
}

export const PIKSEL_PRODUCTS: PikselProduct[] = [
  {
    id: 's2-geomad',
    name: 'Sentinel-2 GeoMAD (True Color)',
    layerName: 's2_geomad_annual',
    description: 'Komposit optik warna alami 10m bebas awan untuk seluruh Indonesia.',
    whatItShows: 'Warna asli foto satelit (RGB): Hutan hijau, kota abu-abu, dan laut biru jernih tanpa tutupan awan.',
    badge: 'Optik 10m',
    color: '#10b981',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI',
    legendType: 'natural',
    rasterTileUrl: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'
  },
  {
    id: 's2-cir',
    name: 'Sentinel-2 Kerapatan Vegetasi & Kanopi',
    layerName: 's2_vegetation_canopy',
    description: 'Peningkatan kontras klorofil & biomassa untuk membedakan hutan lebat vs lahan terbuka.',
    whatItShows: 'Tutupan Vegetasi Tropis: Kanopi hutan lebat & pertanian subur tampak Hijau Pekat (klorofil tinggi), tanah terbuka tampak Jingga/Cokelat, dan perairan tampak Biru Gelap.',
    badge: 'Vegetasi 10m',
    color: '#059669',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI',
    legendType: 'falsecolor',
    rasterTileUrl: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'
  },
  {
    id: 's1-radar',
    name: 'Sentinel-1 SAR Radar (Backscatter)',
    layerName: 's1_rtc',
    description: 'Citra gelombang mikro radar untuk delineasi air, batas garis pantai, dan struktur kota.',
    whatItShows: 'Pantulan Radar: Permukaan air datar memantulkan sinyal menjauh (tampak hitam pekat), sedangkan bangunan & pohon tampak terang bertekstur.',
    badge: 'SAR Radar',
    color: '#3b82f6',
    resolution: '10 meter',
    sensor: 'Sentinel-1 C-Band SAR',
    legendType: 'radar',
    rasterTileUrl: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'
  },
  {
    id: 'ls9-sr',
    name: 'Landsat 9 Surface Reflectance (30m)',
    layerName: 'ls9_c2l2_sr',
    description: 'Citra optik & multispektral permukaan resolusi tinggi 30m dari sensor Landsat 9 OLI-2.',
    whatItShows: 'Reflektansi Permukaan (Bebas Blur): Kontur tutupan lahan, sawah, perbukitan, dan batas permukiman tajam beresolusi 30 meter.',
    badge: 'Multispektral 30m',
    color: '#8b5cf6',
    resolution: '30 meter',
    sensor: 'Landsat 9 OLI-2',
    legendType: 'falsecolor',
    rasterTileUrl: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'
  }
];

export const PIKSEL_PRESETS: PikselPreset[] = [
  {
    id: 'bromo',
    name: 'Bromo Tengger Semeru',
    locationName: 'Jawa Timur',
    center: [112.9485, -7.9514],
    zoom: 12,
    pitch: 35,
    description: 'Kaldera lautan pasir Bromo dan hutan cemara di lereng Gunung Semeru.',
    recommendedProduct: 's2-geomad'
  },
  {
    id: 'toba',
    name: 'Danau Toba & Samosir',
    locationName: 'Sumatera Utara',
    center: [98.8052, 2.5819],
    zoom: 10.5,
    pitch: 20,
    description: 'Perairan danau vulkanik terbesar di Asia Tenggara dan tangkapan air Danau Toba.',
    recommendedProduct: 's2-geomad'
  },
  {
    id: 'ikn',
    name: 'IKN Nusantara',
    locationName: 'Kalimantan Timur',
    center: [116.7050, -0.9700],
    zoom: 11.5,
    pitch: 25,
    description: 'Pembangunan infrastruktur Ibu Kota Nusantara dan kelestarian kanopi hutan tropis.',
    recommendedProduct: 's2-cir'
  },
  {
    id: 'jakarta-coast',
    name: 'Pesisir Utara Jakarta',
    locationName: 'DKI Jakarta',
    center: [106.7900, -6.1150],
    zoom: 12.5,
    description: 'Batas garis pantai, tanggul laut, dan area rawan banjir rob pasang surut.',
    recommendedProduct: 's1-radar'
  },
  {
    id: 'gag-island',
    name: 'Pulau Gag (Raja Ampat)',
    locationName: 'Papua Barat Daya',
    center: [129.8900, -0.4500],
    zoom: 12,
    description: 'Analisis tutupan vegetasi pulau tropis dan area terbuka mineral.',
    recommendedProduct: 's2-cir'
  }
];

export class PikselLoader {
  private map: maplibregl.Map;
  private activeProductId: string | null = null; // Clean default: pure basemap
  private currentOpacity: number = 0.85;
  private gridVisible: boolean = false;
  private popup: maplibregl.Popup;
  private isEventsBound: boolean = false;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '340px'
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
   * Sets the single active satellite product (hides all others to prevent messy visual clashes)
   */
  public setActiveProduct(productId: string | null) {
    this.activeProductId = productId;

    if (!this.map) return;

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.setActiveProduct(productId));
      return;
    }

    // Hide all raster layers first
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
        this.renderRasterLayer(product);
      }
    }
  }

  /**
   * Renders the raster layer for a specific satellite product
   */
  private renderRasterLayer(product: PikselProduct) {
    if (!product.rasterTileUrl || !this.map) return;

    const sourceId = `piksel-raster-src-${product.id}`;
    const layerId = `piksel-raster-${product.id}`;

    try {
      if (!this.map.getSource(sourceId)) {
        this.map.addSource(sourceId, {
          type: 'raster',
          tiles: [product.rasterTileUrl],
          tileSize: 256,
          attribution: '© BIG Piksel / Copernicus / NASA'
        });
      }

      const paintProps: Record<string, any> = {
        'raster-opacity': this.currentOpacity,
        'raster-fade-duration': 200
      };

      if (product.id === 's1-radar') {
        // Monochromatic SAR Backscatter: clear contrast with visible land textures
        paintProps['raster-saturation'] = -1.0;
        paintProps['raster-contrast'] = 0.2;
        paintProps['raster-brightness-min'] = 0.12;
        paintProps['raster-brightness-max'] = 1.0;
      } else if (product.id === 's2-cir') {
        // Enhanced Green Canopy & Vegetation
        paintProps['raster-saturation'] = 0.8;
        paintProps['raster-contrast'] = 0.25;
        paintProps['raster-brightness-max'] = 1.0;
      } else if (product.id === 's2-geomad') {
        // True-Color Optical GeoMAD (Natural RGB)
        paintProps['raster-saturation'] = 0.15;
        paintProps['raster-contrast'] = 0.1;
      } else if (product.id === 'ls9-sr') {
        // Landsat 9 High-Res Surface Reflectance (30m Optical/Multispectral)
        paintProps['raster-saturation'] = 0.45;
        paintProps['raster-contrast'] = 0.25;
      }

      if (!this.map.getLayer(layerId)) {
        this.map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          layout: { visibility: 'visible' },
          paint: paintProps
        });
      } else {
        this.map.setLayoutProperty(layerId, 'visibility', 'visible');
        this.map.setPaintProperty(layerId, 'raster-opacity', this.currentOpacity);
      }
    } catch (e) {
      console.warn(`[PikselLoader] Raster error for ${product.id}:`, e);
    }
  }

  /**
   * Sets transparency of the active satellite layer
   */
  public setOpacity(opacity: number) {
    this.currentOpacity = opacity;

    if (!this.map || !this.activeProductId) return;

    const layerId = `piksel-raster-${this.activeProductId}`;
    if (this.map.getLayer(layerId)) {
      this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
    }
  }

  /**
   * Toggles BIG Piksel Data Cube vector grid tiles
   */
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
      const regionCode = props.region_code || props.label || 'x152y010';
      const sceneCount = props.count ? `${props.count} Scene Satelit` : 'Data Cube Tersedia';

      const html = `
        <div class="gee-popup-card">
          <div class="piksel-badge" style="background-color: #10b98122; color: #10b981; border: 1px solid #10b98166; margin-bottom: 6px;">
            BIG Data Cube Tile
          </div>
          <h4>🛰️ Tile Akuisisi: <code>${regionCode}</code></h4>
          <table class="gee-popup-table">
            <tr><td><strong>Jumlah Scene:</strong></td><td><strong>${sceneCount}</strong></td></tr>
            <tr><td><strong>Status Grid:</strong></td><td><span style="color: #10b981; font-weight: 600;">Terindeks di BIG</span></td></tr>
            <tr><td><strong>Resolusi:</strong></td><td>10 meter (Sentinel-2)</td></tr>
          </table>
          <div style="margin-top: 8px;">
            <a href="https://explorer.piksel.big.go.id/products/s2_geomad_annual" target="_blank" rel="noopener noreferrer" style="color: #06b6d4; font-size: 11px; text-decoration: underline;">
              Buka di BIG Piksel Explorer &rarr;
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
