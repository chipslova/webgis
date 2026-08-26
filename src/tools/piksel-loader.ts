import * as maplibregl from 'maplibre-gl';

export interface PikselProduct {
  id: string;
  name: string;
  layerName: string;
  styleName: string;
  description: string;
  badge: string;
  color: string;
  resolution: string;
  sensor: string;
  whatItShows: string;
  legendType: 'natural' | 'nir' | 'falsecolor' | 'ndvi' | 'ndwi' | 'bsi' | 'flood' | 'stats';
  serviceType: 'WMTS' | 'WMS';
  supportsTime?: boolean;
  timeRange?: string[];
  defaultTime?: string;
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

export interface PikselHealthStatus {
  status: 'online' | 'degraded' | 'offline' | 'checking';
  latencyMs: number;
  endpoint: string;
  lastChecked: Date | null;
  details?: string;
}

export const PIKSEL_OWS_STAGING = 'https://ows.staging.piksel.big.go.id';
export const PIKSEL_OWS_PROD = 'https://ows.piksel.big.go.id';

export const PIKSEL_YEARS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'];

/**
 * Authentic Earth Observation Products Catalog from Badan Informasi Geospasial (BIG)
 * Connected directly to OpenDataCube OWS (WMTS 1.0.0 & WMS 1.3.0)
 */
export const PIKSEL_PRODUCTS: PikselProduct[] = [
  {
    id: 's2-geomad-rgb',
    name: 'Sentinel-2 GeoMAD (True Color RGB)',
    layerName: 's2_geomad_annual_spectral',
    styleName: 'rgb',
    description: 'Komposit optik tahunan 10m bebas awan nasional dari sensor Sentinel-2 MSI (B4/Merah, B3/Hijau, B2/Biru).',
    whatItShows: 'Warna Alami Foto Satelit: Hutan hijau lebat, perkotaan abu-abu/terang, dan laut jernih tanpa gangguan tutupan awan.',
    badge: 'Optik 10m',
    color: '#10b981',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (GeoMAD)',
    legendType: 'natural',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 's2-geomad-nir',
    name: 'Sentinel-2 GeoMAD (False Color NIR / Kanopi)',
    layerName: 's2_geomad_annual_spectral',
    styleName: 'false_color_nir',
    description: 'Kombinasi inframerah dekat (NIR B8 / B4 / B3) untuk memetakan biomassa kanopi dan kesehatan tutupan vegetasi tropis.',
    whatItShows: 'Tutupan Biomassa Tropis: Kanopi hutan lebat & pertanian subur tampak Merah Pekat/Jingga, lahan terbuka abu-abu, dan perairan hitam.',
    badge: 'NIR Kanopi',
    color: '#ef4444',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (GeoMAD)',
    legendType: 'nir',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 's2-geomad-rededge',
    name: 'Sentinel-2 GeoMAD (Red Edge / Klorofil)',
    layerName: 's2_geomad_annual_spectral',
    styleName: 'false_color_rededge',
    description: 'Band spektral Red Edge (B5/B6/B7) sangat peka kandungan klorofil tanaman untuk pemantauan stres fisiologis pertanian.',
    whatItShows: 'Aktivitas Klorofil: Kontras vegetasi pertanian aktif tampak Hijau Terang bervariasi membedakan kerapatan sel tanaman.',
    badge: 'Red Edge 10m',
    color: '#8b5cf6',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (GeoMAD)',
    legendType: 'falsecolor',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 's2-geomad-ndvi',
    name: 'Sentinel-2 GeoMAD (NDVI Vegetasi)',
    layerName: 's2_geomad_annual_indices',
    styleName: 'ndvi',
    description: 'Indeks Vegetasi Ternormalisasi (B8 - B4) / (B8 + B4) untuk kuantifikasi kerapatan tutupan hijau nasional.',
    whatItShows: 'Indeks Hijau Daun: Hijau Tua (NDVI > 0.6 = Hutan Lebat), Kuning (0.3-0.5 = Pertanian), Cokelat/Merah (<0.1 = Lahan Kering/Kota).',
    badge: 'Indeks NDVI',
    color: '#16a34a',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (Indeks)',
    legendType: 'ndvi',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 's2-geomad-ndwi',
    name: 'Sentinel-2 GeoMAD (NDWI Indeks Air)',
    layerName: 's2_geomad_annual_indices',
    styleName: 'ndwi',
    description: 'Indeks Air McFeeters (B3 - B8) / (B3 + B8) untuk delineasi badan air, danau, waduk, alur sungai, dan rawa basah.',
    whatItShows: 'Badan Air Terbuka: Permukaan danau & laut tampak Biru Cerah (nilai positif), sedangkan daratan tampak Abu-abu gelap.',
    badge: 'Indeks Air',
    color: '#06b6d4',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (Indeks)',
    legendType: 'ndwi',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 's2-geomad-bsi',
    name: 'Sentinel-2 GeoMAD (BSI Lahan Terbuka)',
    layerName: 's2_geomad_annual_indices',
    styleName: 'bsi',
    description: 'Bare Soil Index untuk memisahkan tanah terbuka, lahan tambang galian, dan area pembangunan fisik dari vegetasi.',
    whatItShows: 'Lahan Terbuka/Galian: Area tanah terbuka & bukaan lahan tampak Cokelat/Kuning Terang, sedangkan area kanopi tampak redup.',
    badge: 'BSI Tanah',
    color: '#d97706',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (Indeks)',
    legendType: 'bsi',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 's2-geomad-count',
    name: 'Sentinel-2 GeoMAD (Kerapatan Observasi Cube)',
    layerName: 's2_geomad_annual_statistics',
    styleName: 'count',
    description: 'Distribusi jumlah scene satelit bebas awan per piksel yang dikompositkan dalam algoritma GeoMAD tahunan.',
    whatItShows: 'Densitas Data Cube: Kuning/Merah (>30 scene akuisisi = sangat kaya data), Hijau/Biru (10-25 scene), Ungu (<5 scene).',
    badge: 'Statistik Cube',
    color: '#ec4899',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (Statistik)',
    legendType: 'stats',
    serviceType: 'WMTS',
    supportsTime: true,
    timeRange: PIKSEL_YEARS,
    defaultTime: '2025'
  },
  {
    id: 'flood-hazard-rp02',
    name: 'Piksel Model Bahaya Banjir (Periode 2 Tahun)',
    layerName: 'flood_hazard_rp02',
    styleName: 'hazard_class',
    description: 'Model bahaya banjir nasional tahun 2025 dengan probabilitas 50% AEP (Annual Exceedance Probability) berbasis geomorfologi BIG.',
    whatItShows: 'Kelas Bahaya Banjir: Merah (Bahaya Tinggi pada dataran aluvial aktif), Jingga (Sedang), Kuning (Rendah).',
    badge: 'Bahaya Banjir',
    color: '#3b82f6',
    resolution: '10 meter',
    sensor: 'BIG Hydrology Model 2025',
    legendType: 'flood',
    serviceType: 'WMTS',
    supportsTime: false
  },
  {
    id: 'flood-hazard-rp10',
    name: 'Piksel Model Bahaya Banjir (Periode 10 Tahun)',
    layerName: 'flood_hazard_rp10',
    styleName: 'hazard_class',
    description: 'Model bahaya banjir dengan probabilitas tahunan 10% AEP untuk perencanaan mitigasi bencana regional.',
    whatItShows: 'Zona Genangan Ekstrem: Area rawan luapan sungai dan rob pasang surut dengan return period 10 tahun.',
    badge: 'Banjir 10-Th',
    color: '#2563eb',
    resolution: '10 meter',
    sensor: 'BIG Hydrology Model 2025',
    legendType: 'flood',
    serviceType: 'WMTS',
    supportsTime: false
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
    description: 'Kaldera lautan pasir Bromo, tutupan vegetasi lereng Semeru, dan geomorfologi vulkanik aktif.',
    recommendedProduct: 's2-geomad-rgb'
  },
  {
    id: 'toba',
    name: 'Danau Toba & Samosir',
    locationName: 'Sumatera Utara',
    center: [98.8052, 2.5819],
    zoom: 10.5,
    pitch: 20,
    description: 'Delineasi indeks air (NDWI) danau vulkanik terbesar di Asia Tenggara serta tutupan vegetasi tangkapan air.',
    recommendedProduct: 's2-geomad-ndwi'
  },
  {
    id: 'ikn',
    name: 'IKN Nusantara',
    locationName: 'Kalimantan Timur',
    center: [116.7050, -0.9700],
    zoom: 11.5,
    pitch: 25,
    description: 'Monitoring pembangunan infrastruktur Ibu Kota Nusantara dan bukaan lahan (BSI) vs kanopi hutan tropis (NIR).',
    recommendedProduct: 's2-geomad-nir'
  },
  {
    id: 'jakarta-coast',
    name: 'Pesisir Jakarta & Ciliwung',
    locationName: 'DKI Jakarta',
    center: [106.7900, -6.1150],
    zoom: 12,
    description: 'Analisis zona bahaya banjir luapan dan rob pesisir utara Jakarta dengan model hidrologi Piksel.',
    recommendedProduct: 'flood-hazard-rp02'
  },
  {
    id: 'gag-island',
    name: 'Pulau Gag (Raja Ampat)',
    locationName: 'Papua Barat Daya',
    center: [129.8900, -0.4500],
    zoom: 12,
    description: 'Analisis bukaan lahan mineral terbuka (BSI) vs kelestarian vegetasi pesisir kepulauan tropis.',
    recommendedProduct: 's2-geomad-bsi'
  }
];

export class PikselLoader {
  private map: maplibregl.Map;
  private activeProductId: string | null = null;
  private selectedYear: string = '2025';
  private currentOpacity: number = 0.85;
  private gridVisible: boolean = false;
  private popup: maplibregl.Popup;
  private isEventsBound: boolean = false;
  private serviceType: 'WMTS' | 'WMS' = 'WMTS';
  private baseUrl: string = PIKSEL_OWS_STAGING;
  private healthStatus: PikselHealthStatus = {
    status: 'checking',
    latencyMs: 0,
    endpoint: PIKSEL_OWS_STAGING,
    lastChecked: null
  };
  private healthListeners: Array<(status: PikselHealthStatus) => void> = [];

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '360px'
    });

    // Run startup health check
    this.checkEndpointHealth();
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

    // Refresh active layer if it supports time dimension
    if (this.activeProductId) {
      const activeProd = this.getActiveProduct();
      if (activeProd && activeProd.supportsTime) {
        this.renderRasterLayer(activeProd, true);
      }
    }
  }

  public getOpacity(): number {
    return this.currentOpacity;
  }

  public isGridVisible(): boolean {
    return this.gridVisible;
  }

  public getServiceType(): 'WMTS' | 'WMS' {
    return this.serviceType;
  }

  public setServiceType(type: 'WMTS' | 'WMS') {
    if (this.serviceType === type) return;
    this.serviceType = type;
    if (this.activeProductId) {
      const activeProd = this.getActiveProduct();
      if (activeProd) {
        this.renderRasterLayer(activeProd, true);
      }
    }
  }

  public getHealthStatus(): PikselHealthStatus {
    return this.healthStatus;
  }

  public onHealthChange(listener: (status: PikselHealthStatus) => void) {
    this.healthListeners.push(listener);
    listener(this.healthStatus);
  }

  private notifyHealth() {
    this.healthListeners.forEach((fn) => fn(this.healthStatus));
  }

  /**
   * Health-checks the Piksel OGC endpoint to verify live connectivity and latency
   */
  public async checkEndpointHealth(): Promise<PikselHealthStatus> {
    const startTime = performance.now();
    this.healthStatus.status = 'checking';
    this.notifyHealth();

    try {
      // Test WMTS Capabilities with timeout
      const testUrl = `${this.baseUrl}/wmts?service=WMTS&version=1.0.0&request=GetCapabilities`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(testUrl, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const elapsed = Math.round(performance.now() - startTime);

      if (resp.ok) {
        this.healthStatus = {
          status: elapsed > 3000 ? 'degraded' : 'online',
          latencyMs: elapsed,
          endpoint: this.baseUrl,
          lastChecked: new Date(),
          details: `WMTS 1.0.0 Aktif (${elapsed}ms)`
        };
      } else {
        this.healthStatus = {
          status: 'degraded',
          latencyMs: elapsed,
          endpoint: this.baseUrl,
          lastChecked: new Date(),
          details: `HTTP ${resp.status}: ${resp.statusText}`
        };
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      this.healthStatus = {
        status: 'offline',
        latencyMs: elapsed,
        endpoint: this.baseUrl,
        lastChecked: new Date(),
        details: err?.name === 'AbortError' ? 'Koneksi timeout (>8s)' : 'Tidak dapat terhubung'
      };
    }

    this.notifyHealth();
    return this.healthStatus;
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
   * Generates the MapLibre tile URL template for a specific product
   */
  public buildTileUrl(product: PikselProduct): string {
    const timeParam = product.supportsTime && this.selectedYear ? `&time=${this.selectedYear}-01-01` : '';

    if (this.serviceType === 'WMS') {
      return `${this.baseUrl}/wms?service=WMS&version=1.3.0&request=GetMap&layers=${product.layerName}&styles=${product.styleName}&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true${timeParam}`;
    }

    // Default: WMTS GoogleMapsCompatible (EPSG:3857 WholeWorld_WebMercator)
    return `${this.baseUrl}/wmts?service=WMTS&version=1.0.0&request=GetTile&layer=${product.layerName}&style=${product.styleName}&tilematrixset=WholeWorld_WebMercator&TileMatrix={z}&TileRow={y}&TileCol={x}&format=image/png${timeParam}`;
  }

  /**
   * Sets the active EO satellite product
   */
  public setActiveProduct(productId: string | null) {
    this.activeProductId = productId;

    if (!this.map) return;

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.setActiveProduct(productId));
      return;
    }

    // Hide all existing raster layers first
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
   * Renders or refreshes the raster layer for a specific satellite product
   */
  private renderRasterLayer(product: PikselProduct, forceRefresh: boolean = false) {
    if (!this.map) return;

    const sourceId = `piksel-raster-src-${product.id}`;
    const layerId = `piksel-raster-${product.id}`;
    const tileUrl = this.buildTileUrl(product);

    try {
      const existingSource = this.map.getSource(sourceId) as maplibregl.RasterTileSource;

      if (!existingSource) {
        this.map.addSource(sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          attribution: '© Badan Informasi Geospasial (BIG) • Geoscience Australia • Piksel'
        });
      } else if (forceRefresh) {
        // If updating tile URL (e.g. year changed or protocol switched)
        if (typeof (existingSource as any).setTiles === 'function') {
          (existingSource as any).setTiles([tileUrl]);
        } else {
          // Re-add source if setTiles is not available
          if (this.map.getLayer(layerId)) {
            this.map.removeLayer(layerId);
          }
          this.map.removeSource(sourceId);
          this.map.addSource(sourceId, {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '© Badan Informasi Geospasial (BIG) • Geoscience Australia • Piksel'
          });
        }
      }

      if (!this.map.getLayer(layerId)) {
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
      } else {
        this.map.setLayoutProperty(layerId, 'visibility', 'visible');
        this.map.setPaintProperty(layerId, 'raster-opacity', this.currentOpacity);
      }
    } catch (e) {
      console.warn(`[PikselLoader] Layer rendering notice for ${product.id}:`, e);
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
              'fill-opacity': 0.08
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
        console.warn('[PikselLoader] Grid layer notice:', e);
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
            BIG Open Data Cube Tile
          </div>
          <h4>🛰️ Tile Grid: <code>${regionCode}</code></h4>
          <table class="gee-popup-table">
            <tr><td><strong>Scene Terindeks:</strong></td><td><strong>${sceneCount}</strong></td></tr>
            <tr><td><strong>Status Grid:</strong></td><td><span style="color: #10b981; font-weight: 600;">Terverifikasi ODC BIG</span></td></tr>
            <tr><td><strong>Resolusi Spasial:</strong></td><td>10 meter (Sentinel-2)</td></tr>
            <tr><td><strong>Sistem Koordinat:</strong></td><td>EPSG:3857 (Web Mercator)</td></tr>
          </table>
          <div style="margin-top: 8px; display: flex; gap: 8px;">
            <a href="https://explorer.piksel.big.go.id/products/s2_geomad_annual_spectral" target="_blank" rel="noopener noreferrer" style="color: #06b6d4; font-size: 11px; text-decoration: underline;">
              Lihat di BIG Piksel Explorer &rarr;
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
      const activeProd = this.getActiveProduct();
      if (activeProd) {
        this.renderRasterLayer(activeProd, true);
      }
    }
    if (this.gridVisible) {
      this.setGridVisible(true);
    }
  }
}

