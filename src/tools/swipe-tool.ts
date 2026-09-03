import * as maplibregl from 'maplibre-gl';
import { PIKSEL_PRODUCTS, PIKSEL_WMS_BASE_URL, S2_YEARS, LS9_YEARS, PikselProduct } from '../config/piksel';
import { BASEMAPS } from '../config/basemaps';
import { PikselLoader } from './piksel-loader';
import { showToast } from '../ui/toast';

export interface SwipeLayerOption {
  id: string;
  name: string;
  group: string;
  type: 'piksel' | 'basemap';
  productId?: string;
  year?: string;
  basemapId?: string;
}

export class SwipeTool {
  private mainMap: maplibregl.Map;
  private pikselLoader?: PikselLoader;
  private swipeMap: maplibregl.Map | null = null;
  private isActive: boolean = false;
  private dividerPosition: number = 0.5; // 0.0 to 1.0
  private leftOption!: SwipeLayerOption;
  private rightOption!: SwipeLayerOption;

  private isDragging: boolean = false;
  private isSyncing: boolean = false;
  private containerEl: HTMLElement | null = null;
  private handleEl: HTMLElement | null = null;
  private onToggleCallback?: (active: boolean) => void;

  constructor(mainMap: maplibregl.Map, pikselLoader?: PikselLoader) {
    this.mainMap = mainMap;
    this.pikselLoader = pikselLoader;
  }

  public setPikselLoader(loader: PikselLoader) {
    this.pikselLoader = loader;
  }

  public onToggle(cb: (active: boolean) => void) {
    this.onToggleCallback = cb;
  }

  public isSwipeActive(): boolean {
    return this.isActive;
  }

  public toggle() {
    if (this.isActive) {
      this.disable();
    } else {
      this.enable();
    }
  }

  public enable() {
    if (this.isActive) return;
    this.isActive = true;

    // 1. Contextually adopt the currently active product from PikselLoader
    this.setupContextualPair();

    // 2. If current map zoom is < 6, smoothly auto-zoom to Level 7.5 so satellite imagery is immediately visible
    if (this.mainMap.getZoom() < 6) {
      const center = this.mainMap.getCenter();
      const isCountryCenter = Math.abs(center.lng - 117.89) < 2 && Math.abs(center.lat - (-2.55)) < 2;
      this.mainMap.flyTo({
        center: isCountryCenter ? [112.9485, -7.9514] : [center.lng, center.lat],
        zoom: 7.5,
        duration: 1200
      });
    }

    this.createUI();
    this.initSwipeMap();

    // 3. Apply right comparison layer on main map
    this.applyLayerToMap(this.mainMap, this.rightOption, 'swipe-right');

    if (this.onToggleCallback) this.onToggleCallback(true);
    showToast(`Bandingkan: ${this.leftOption.name} (Kiri) vs ${this.rightOption.name} (Kanan)`, 'info');
  }

  /**
   * Intelligently sets Left & Right comparison layers based on what the user is currently viewing
   */
  private setupContextualPair() {
    const activeProduct = this.pikselLoader?.getActiveProduct();
    const activeYear = this.pikselLoader?.getSelectedYear() || '2025';

    if (activeProduct) {
      // User is currently viewing an active product in Piksel panel
      if (activeProduct.id === 'flood-hazard-rp02') {
        this.leftOption = {
          id: 'opt-flood-hazard-rp02',
          name: 'Bahaya Banjir (Periode Ulang 2 Tahun)',
          group: 'Bahaya Banjir',
          type: 'piksel',
          productId: 'flood-hazard-rp02'
        };
        this.rightOption = {
          id: 'opt-flood-hazard-rp10',
          name: 'Bahaya Banjir (Periode Ulang 10 Tahun)',
          group: 'Bahaya Banjir',
          type: 'piksel',
          productId: 'flood-hazard-rp10'
        };
      } else if (activeProduct.id === 's2-ndvi') {
        this.leftOption = {
          id: `opt-s2-geomad-rgb-${activeYear}`,
          name: `Sentinel-2 Warna Alami (${activeYear})`,
          group: 'Sentinel-2 GeoMAD',
          type: 'piksel',
          productId: 's2-geomad-rgb',
          year: activeYear
        };
        this.rightOption = {
          id: `opt-s2-ndvi-${activeYear}`,
          name: `Sentinel-2 NDVI Vegetasi (${activeYear})`,
          group: 'Indeks Spektral',
          type: 'piksel',
          productId: 's2-ndvi',
          year: activeYear
        };
      } else if (activeProduct.id === 's2-ndwi') {
        this.leftOption = {
          id: `opt-s2-geomad-rgb-${activeYear}`,
          name: `Sentinel-2 Warna Alami (${activeYear})`,
          group: 'Sentinel-2 GeoMAD',
          type: 'piksel',
          productId: 's2-geomad-rgb',
          year: activeYear
        };
        this.rightOption = {
          id: `opt-s2-ndwi-${activeYear}`,
          name: `Sentinel-2 NDWI Air (${activeYear})`,
          group: 'Indeks Spektral',
          type: 'piksel',
          productId: 's2-ndwi',
          year: activeYear
        };
      } else if (activeProduct.id === 's2-geomad-rgb') {
        const compareYear = activeYear === '2017' ? '2025' : '2017';
        this.leftOption = {
          id: `opt-s2-geomad-rgb-${compareYear}`,
          name: `Sentinel-2 GeoMAD (${compareYear})`,
          group: 'Sentinel-2 GeoMAD',
          type: 'piksel',
          productId: 's2-geomad-rgb',
          year: compareYear
        };
        this.rightOption = {
          id: `opt-s2-geomad-rgb-${activeYear}`,
          name: `Sentinel-2 GeoMAD (${activeYear})`,
          group: 'Sentinel-2 GeoMAD',
          type: 'piksel',
          productId: 's2-geomad-rgb',
          year: activeYear
        };
      } else {
        // Any other active product: pair with Sentinel-2 RGB
        this.leftOption = {
          id: `opt-s2-geomad-rgb-${activeYear}`,
          name: `Sentinel-2 Warna Alami (${activeYear})`,
          group: 'Sentinel-2 GeoMAD',
          type: 'piksel',
          productId: 's2-geomad-rgb',
          year: activeYear
        };
        this.rightOption = {
          id: `opt-${activeProduct.id}-${activeYear}`,
          name: `${activeProduct.name} (${activeYear})`,
          group: 'Produk Aktif',
          type: 'piksel',
          productId: activeProduct.id,
          year: activeYear
        };
      }
    } else {
      // Default initial pair: 2017 vs 2025
      this.leftOption = {
        id: 'opt-s2-geomad-rgb-2017',
        name: 'Sentinel-2 GeoMAD (2017)',
        group: 'Sentinel-2 GeoMAD',
        type: 'piksel',
        productId: 's2-geomad-rgb',
        year: '2017'
      };
      this.rightOption = {
        id: 'opt-s2-geomad-rgb-2025',
        name: 'Sentinel-2 GeoMAD (2025)',
        group: 'Sentinel-2 GeoMAD',
        type: 'piksel',
        productId: 's2-geomad-rgb',
        year: '2025'
      };
    }
  }

  public disable() {
    if (!this.isActive) return;
    this.isActive = false;

    this.cleanupLayerFromMap(this.mainMap, 'swipe-right');

    if (this.swipeMap) {
      try {
        this.swipeMap.remove();
      } catch (_) {}
      this.swipeMap = null;
    }

    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }

    if (this.onToggleCallback) this.onToggleCallback(false);
    showToast('Mode Bandingkan dinonaktifkan', 'info');
  }

  private createUI() {
    const mapWrapper = document.getElementById('map') || document.body;

    this.containerEl = document.createElement('div');
    this.containerEl.id = 'swipe-comparison-container';
    this.containerEl.className = 'swipe-comparison-container';

    const leftOptionsHtml = this.renderSelectOptions(this.leftOption.id);
    const rightOptionsHtml = this.renderSelectOptions(this.rightOption.id);

    this.containerEl.innerHTML = `
      <div id="swipe-map-view" class="swipe-map-view"></div>
      
      <div id="swipe-handle" class="swipe-handle">
        <div class="swipe-handle-line"></div>
        <div class="swipe-handle-knob">
          <span>◀ ▶</span>
        </div>
      </div>

      <div class="swipe-top-bar">
        <div class="swipe-selector-group">
          <span class="swipe-side-tag left-tag">SISI KIRI</span>
          <select id="swipe-left-select" class="swipe-select">
            ${leftOptionsHtml}
          </select>
        </div>

        <div class="swipe-center-info">
          <span class="swipe-split-pct" id="swipe-split-pct">50% | 50%</span>
        </div>

        <div class="swipe-selector-group">
          <span class="swipe-side-tag right-tag">SISI KANAN</span>
          <select id="swipe-right-select" class="swipe-select">
            ${rightOptionsHtml}
          </select>
        </div>

        <button id="btn-close-swipe" class="btn-close-swipe" title="Keluar dari Mode Bandingkan">
          ✕ Keluar
        </button>
      </div>
    `;

    mapWrapper.appendChild(this.containerEl);
    this.handleEl = this.containerEl.querySelector('#swipe-handle');
  }

  /**
   * Generates clean, grouped <optgroup> dropdown list of all available datasets
   */
  private renderSelectOptions(selectedId: string): string {
    const allOptions = this.getAllLayerOptions();
    const groups = [
      '📅 Sentinel-2 GeoMAD (Multi-Tahun)',
      '🔬 Indeks Biofisik & Spektral',
      '🌊 Pemodelan Bahaya Banjir Nasional',
      '🛰️ Satelit Landsat 9 & Kualitas',
      '🗺️ Peta Dasar (Basemaps)'
    ];

    return groups.map(grp => {
      const opts = allOptions.filter(o => o.group === grp);
      if (opts.length === 0) return '';
      const itemsHtml = opts.map(o => `
        <option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${o.name}</option>
      `).join('');
      return `<optgroup label="${grp}">${itemsHtml}</optgroup>`;
    }).join('');
  }

  public getAllLayerOptions(): SwipeLayerOption[] {
    const options: SwipeLayerOption[] = [];

    // 1. Sentinel-2 GeoMAD Multi-Year
    S2_YEARS.forEach(yr => {
      options.push({
        id: `opt-s2-geomad-rgb-${yr}`,
        name: `Sentinel-2 GeoMAD (${yr})`,
        group: '📅 Sentinel-2 GeoMAD (Multi-Tahun)',
        type: 'piksel',
        productId: 's2-geomad-rgb',
        year: yr
      });
    });

    // 2. Spectral Indices
    S2_YEARS.slice(0, 4).forEach(yr => {
      options.push({
        id: `opt-s2-ndvi-${yr}`,
        name: `NDVI Indeks Vegetasi (${yr})`,
        group: '🔬 Indeks Biofisik & Spektral',
        type: 'piksel',
        productId: 's2-ndvi',
        year: yr
      });
      options.push({
        id: `opt-s2-ndwi-${yr}`,
        name: `NDWI Indeks Air (${yr})`,
        group: '🔬 Indeks Biofisik & Spektral',
        type: 'piksel',
        productId: 's2-ndwi',
        year: yr
      });
    });

    options.push({
      id: 'opt-s2-nir',
      name: 'Sentinel-2 NIR (Inframerah Dekat)',
      group: '🔬 Indeks Biofisik & Spektral',
      type: 'piksel',
      productId: 's2-geomad-nir',
      year: '2025'
    });

    // 3. Flood Hazard
    options.push({
      id: 'opt-flood-hazard-rp02',
      name: 'Bahaya Banjir (Periode Ulang 2 Tahun)',
      group: '🌊 Pemodelan Bahaya Banjir Nasional',
      type: 'piksel',
      productId: 'flood-hazard-rp02'
    });
    options.push({
      id: 'opt-flood-hazard-rp10',
      name: 'Bahaya Banjir (Periode Ulang 10 Tahun)',
      group: '🌊 Pemodelan Bahaya Banjir Nasional',
      type: 'piksel',
      productId: 'flood-hazard-rp10'
    });

    // 4. Landsat 9 & Quality Mask
    LS9_YEARS.forEach(yr => {
      options.push({
        id: `opt-ls9-${yr}`,
        name: `Landsat 9 Surface Reflectance (${yr})`,
        group: '🛰️ Satelit Landsat 9 & Kualitas',
        type: 'piksel',
        productId: 'ls9-sr',
        year: yr
      });
    });

    options.push({
      id: 'opt-s2-count',
      name: 'Observation Density Mask (Scene Count)',
      group: '🛰️ Satelit Landsat 9 & Kualitas',
      type: 'piksel',
      productId: 's2-count',
      year: '2025'
    });

    // 5. Basemaps
    const bmList = [
      { id: 'google-satellite', name: 'Google Satellite (Foto Udara)' },
      { id: 'big-rbi', name: 'BIG Peta Rupa Bumi Indonesia (RBI)' },
      { id: 'osm-standard', name: 'OpenStreetMap Standard' },
      { id: 'esri-satellite', name: 'ESRI World Imagery' },
      { id: 'esri-topographic', name: 'ESRI World Topographic' }
    ];

    bmList.forEach(bm => {
      options.push({
        id: `opt-base-${bm.id}`,
        name: bm.name,
        group: '🗺️ Peta Dasar (Basemaps)',
        type: 'basemap',
        basemapId: bm.id
      });
    });

    return options;
  }

  private initSwipeMap() {
    const swipeViewEl = document.getElementById('swipe-map-view');
    if (!swipeViewEl) return;

    let baseStyle: any = { version: 8, sources: {}, layers: [] };
    try {
      const mainStyle = this.mainMap.getStyle();
      if (mainStyle) {
        baseStyle = JSON.parse(JSON.stringify(mainStyle));
      }
    } catch (_) {}

    this.swipeMap = new maplibregl.Map({
      container: swipeViewEl,
      style: baseStyle,
      center: this.mainMap.getCenter(),
      zoom: this.mainMap.getZoom(),
      bearing: this.mainMap.getBearing(),
      pitch: this.mainMap.getPitch(),
      attributionControl: false
    });

    const onReady = () => {
      if (!this.swipeMap) return;
      this.applyLayerToMap(this.swipeMap, this.leftOption, 'swipe-left');
      this.updateClipPath();
      this.swipeMap.resize();
    };

    if (this.swipeMap.isStyleLoaded()) {
      onReady();
    } else {
      this.swipeMap.once('load', onReady);
    }

    // Bidirectional smooth movement synchronization
    const sync = (source: maplibregl.Map, target: maplibregl.Map) => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      target.jumpTo({
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch()
      });
      this.isSyncing = false;
    };

    this.mainMap.on('move', () => {
      if (this.swipeMap && this.isActive) sync(this.mainMap, this.swipeMap);
    });

    this.swipeMap.on('move', () => {
      if (this.mainMap && this.isActive) sync(this.swipeMap, this.mainMap);
    });

    this.bindEvents();
  }

  private buildWmsUrl(product: PikselProduct, year?: string): string {
    const yr = year || '2025';
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
      params.set('TIME', `${yr}-01-01`);
    }

    return `${PIKSEL_WMS_BASE_URL}?${params.toString()}&BBOX={bbox-epsg-3857}`;
  }

  private cleanupLayerFromMap(map: maplibregl.Map, prefix: string) {
    const sourceId = `${prefix}-source`;
    const layerId = `${prefix}-layer`;

    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch (_) {}
  }

  private applyLayerToMap(map: maplibregl.Map, opt: SwipeLayerOption, prefix: string) {
    if (opt.type === 'piksel' && opt.productId) {
      const prod = PIKSEL_PRODUCTS.find(p => p.id === opt.productId);
      if (!prod) return;

      const wmsUrl = this.buildWmsUrl(prod, opt.year);
      const sourceId = `${prefix}-source`;
      const layerId = `${prefix}-layer`;

      this.cleanupLayerFromMap(map, prefix);

      map.addSource(sourceId, {
        type: 'raster',
        tiles: [wmsUrl],
        tileSize: 256,
        minzoom: prod.minZoom ?? 6,
        maxzoom: 18
      });

      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 1.0,
          'raster-fade-duration': 0
        }
      });
    } else if (opt.type === 'basemap' && opt.basemapId) {
      const bm = BASEMAPS.find(b => b.id === opt.basemapId);
      if (bm && typeof bm.style === 'string') {
        map.setStyle(bm.style);
      }
    }
  }

  private updateClipPath() {
    const mapEl = document.getElementById('map');
    if (!mapEl || !this.containerEl) return;

    const width = mapEl.clientWidth;
    const splitX = Math.round(width * this.dividerPosition);
    const leftPct = Math.round(this.dividerPosition * 100);
    const rightPct = 100 - leftPct;

    const swipeViewEl = document.getElementById('swipe-map-view');
    if (swipeViewEl) {
      swipeViewEl.style.clipPath = `polygon(0 0, ${splitX}px 0, ${splitX}px 100%, 0 100%)`;
    }

    if (this.handleEl) {
      this.handleEl.style.left = `${splitX}px`;
    }

    const pctEl = document.getElementById('swipe-split-pct');
    if (pctEl) {
      pctEl.innerText = `${leftPct}% | ${rightPct}%`;
    }
  }

  private bindEvents() {
    if (!this.containerEl) return;

    // 1. Divider dragging
    const onMouseDown = (e: MouseEvent | TouchEvent) => {
      this.isDragging = true;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      const mapEl = document.getElementById('map');
      if (!mapEl) return;

      const rect = mapEl.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const x = clientX - rect.left;
      this.dividerPosition = Math.max(0.05, Math.min(0.95, x / rect.width));
      this.updateClipPath();
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    if (this.handleEl) {
      this.handleEl.addEventListener('mousedown', onMouseDown);
      this.handleEl.addEventListener('touchstart', onMouseDown);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchend', onMouseUp);

    // 2. Selectors Change
    const leftSelect = document.getElementById('swipe-left-select') as HTMLSelectElement;
    if (leftSelect) {
      leftSelect.addEventListener('change', () => {
        const found = this.getAllLayerOptions().find(o => o.id === leftSelect.value);
        if (found && this.swipeMap) {
          this.leftOption = found;
          this.applyLayerToMap(this.swipeMap, this.leftOption, 'swipe-left');
        }
      });
    }

    const rightSelect = document.getElementById('swipe-right-select') as HTMLSelectElement;
    if (rightSelect) {
      rightSelect.addEventListener('change', () => {
        const found = this.getAllLayerOptions().find(o => o.id === rightSelect.value);
        if (found) {
          this.rightOption = found;
          this.applyLayerToMap(this.mainMap, this.rightOption, 'swipe-right');
        }
      });
    }

    // 3. Close Button
    const closeBtn = document.getElementById('btn-close-swipe');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.disable());
    }

    window.addEventListener('resize', () => {
      if (this.isActive) {
        this.updateClipPath();
        this.swipeMap?.resize();
      }
    });
  }
}
