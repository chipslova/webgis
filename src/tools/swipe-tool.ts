import * as maplibregl from 'maplibre-gl';
import { PIKSEL_PRODUCTS, PIKSEL_WMS_BASE_URL, S2_YEARS } from '../config/piksel';
import { BASEMAPS } from '../config/basemaps';
import { showToast } from '../ui/toast';

export interface SwipeLayerOption {
  id: string;
  name: string;
  type: 'piksel' | 'basemap';
  productId?: string;
  year?: string;
  basemapId?: string;
}

export class SwipeTool {
  private mainMap: maplibregl.Map;
  private swipeMap: maplibregl.Map | null = null;
  private isActive: boolean = false;
  private dividerPosition: number = 0.5; // 0.0 to 1.0
  private leftOption: SwipeLayerOption = {
    id: 's2-2017',
    name: 'Sentinel-2 GeoMAD (2017)',
    type: 'piksel',
    productId: 's2-geomad-rgb',
    year: '2017'
  };
  private rightOption: SwipeLayerOption = {
    id: 's2-2025',
    name: 'Sentinel-2 GeoMAD (2025)',
    type: 'piksel',
    productId: 's2-geomad-rgb',
    year: '2025'
  };

  private isDragging: boolean = false;
  private isSyncing: boolean = false;
  private containerEl: HTMLElement | null = null;
  private handleEl: HTMLElement | null = null;
  private onToggleCallback?: (active: boolean) => void;

  constructor(mainMap: maplibregl.Map) {
    this.mainMap = mainMap;
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

    this.createUI();
    this.initSwipeMap();
    this.updateClipPath();
    this.bindEvents();

    if (this.onToggleCallback) this.onToggleCallback(true);
    showToast('Mode Bandingkan (Swipe) Aktif — Geser slider untuk komparasi temporal/spektral', 'info');
  }

  public disable() {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.swipeMap) {
      this.swipeMap.remove();
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

    // 1. Container for Swipe Map and Handle
    this.containerEl = document.createElement('div');
    this.containerEl.id = 'swipe-comparison-container';
    this.containerEl.className = 'swipe-comparison-container';

    // Top control banner
    const optionsHtml = this.getLayerOptions().map(opt => `
      <option value="${opt.id}">${opt.name}</option>
    `).join('');

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
          <span class="swipe-side-tag left-tag">KIRI (LEFT)</span>
          <select id="swipe-left-select" class="swipe-select">
            ${this.getLayerOptions().map(opt => `<option value="${opt.id}" ${opt.id === this.leftOption.id ? 'selected' : ''}>${opt.name}</option>`).join('')}
          </select>
        </div>

        <div class="swipe-center-info">
          <span class="swipe-split-pct" id="swipe-split-pct">50% | 50%</span>
        </div>

        <div class="swipe-selector-group">
          <span class="swipe-side-tag right-tag">KANAN (RIGHT)</span>
          <select id="swipe-right-select" class="swipe-select">
            ${this.getLayerOptions().map(opt => `<option value="${opt.id}" ${opt.id === this.rightOption.id ? 'selected' : ''}>${opt.name}</option>`).join('')}
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

  private getLayerOptions(): SwipeLayerOption[] {
    const options: SwipeLayerOption[] = [];

    // Sentinel-2 Multi-Year Options
    S2_YEARS.forEach(yr => {
      options.push({
        id: `s2-${yr}`,
        name: `Sentinel-2 GeoMAD (${yr})`,
        type: 'piksel',
        productId: 's2-geomad-rgb',
        year: yr
      });
    });

    // Other Spectral Products
    options.push({
      id: 's2-ndvi',
      name: 'Sentinel-2 NDVI (Vegetasi)',
      type: 'piksel',
      productId: 's2-ndvi',
      year: '2025'
    });
    options.push({
      id: 's2-ndwi',
      name: 'Sentinel-2 NDWI (Air)',
      type: 'piksel',
      productId: 's2-ndwi',
      year: '2025'
    });
    options.push({
      id: 's2-nir',
      name: 'Sentinel-2 NIR (Inframerah)',
      type: 'piksel',
      productId: 's2-geomad-nir',
      year: '2025'
    });

    // Basemaps
    options.push({
      id: 'base-osm',
      name: 'OpenStreetMap Standard',
      type: 'basemap',
      basemapId: 'osm-standard'
    });
    options.push({
      id: 'base-satellite',
      name: 'ESRI World Imagery',
      type: 'basemap',
      basemapId: 'esri-satellite'
    });

    return options;
  }

  private initSwipeMap() {
    const swipeViewEl = document.getElementById('swipe-map-view');
    if (!swipeViewEl) return;

    this.swipeMap = new maplibregl.Map({
      container: swipeViewEl,
      style: { version: 8, sources: {}, layers: [] },
      center: this.mainMap.getCenter(),
      zoom: this.mainMap.getZoom(),
      bearing: this.mainMap.getBearing(),
      pitch: this.mainMap.getPitch(),
      attributionControl: false
    });

    this.swipeMap.on('load', () => {
      this.applyLayerToMap(this.swipeMap!, this.leftOption, 'swipe-left');
    });

    // Sync movements both ways
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
  }

  private applyLayerToMap(map: maplibregl.Map, opt: SwipeLayerOption, prefix: string) {
    if (opt.type === 'piksel' && opt.productId) {
      const prod = PIKSEL_PRODUCTS.find(p => p.id === opt.productId);
      if (!prod) return;

      const yr = opt.year || '2025';
      const timeParam = prod.timeEnabled ? `&TIME=${yr}` : '';
      const wmsUrl = `${PIKSEL_WMS_BASE_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${prod.layer}&STYLES=${prod.style}&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256${timeParam}&BBOX={bbox-epsg-3857}`;

      const sourceId = `${prefix}-source`;
      const layerId = `${prefix}-layer`;

      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);

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

    // Clip left map view
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
        const found = this.getLayerOptions().find(o => o.id === leftSelect.value);
        if (found && this.swipeMap) {
          this.leftOption = found;
          this.applyLayerToMap(this.swipeMap, this.leftOption, 'swipe-left');
        }
      });
    }

    const rightSelect = document.getElementById('swipe-right-select') as HTMLSelectElement;
    if (rightSelect) {
      rightSelect.addEventListener('change', () => {
        const found = this.getLayerOptions().find(o => o.id === rightSelect.value);
        if (found) {
          this.rightOption = found;
          // Apply to main map
          this.applyLayerToMap(this.mainMap, this.rightOption, 'swipe-right');
        }
      });
    }

    // 3. Close Button
    const closeBtn = document.getElementById('btn-close-swipe');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.disable());
    }

    // Window resize handler
    window.addEventListener('resize', () => {
      if (this.isActive) this.updateClipPath();
    });
  }
}
