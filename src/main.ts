import './style.css';
import { MapManager } from './map/map-manager';
import { SidebarUI } from './ui/sidebar';
import { StatusBarUI } from './ui/status-bar';
import { GeocoderTool, SearchResult } from './tools/geocoder';
import { MeasureTool } from './tools/measure';
import { GeoJsonLoader } from './tools/geojson-loader';
import { GEELoader } from './tools/gee-loader';
import { GEEPanelUI } from './ui/gee-panel';
import { PikselLoader } from './tools/piksel-loader';
import { PikselPanelUI } from './ui/piksel-panel';
import { ActiveLayersUI } from './ui/active-layers';
import { BASEMAPS } from './config/basemaps';
import { showToast } from './ui/toast';
import { PermalinkManager } from './tools/permalink';
import { PointInspector } from './tools/point-inspector';

class WebGISApp {
  private mapManager: MapManager;
  private sidebarUI: SidebarUI;
  private statusBarUI: StatusBarUI;
  private geocoderTool: GeocoderTool | null = null;
  private measureTool: MeasureTool | null = null;
  private geojsonLoader: GeoJsonLoader | null = null;
  private geeLoader: GEELoader | null = null;
  private geePanelUI: GEEPanelUI | null = null;
  private pikselLoader: PikselLoader | null = null;
  private pikselPanelUI: PikselPanelUI | null = null;
  private activeLayersUI: ActiveLayersUI | null = null;
  private permalinkManager: PermalinkManager | null = null;
  private pointInspector: PointInspector | null = null;

  constructor() {
    this.mapManager = new MapManager('map');
    this.sidebarUI = new SidebarUI();
    this.statusBarUI = new StatusBarUI();

    this.init();
  }

  private async init() {
    // 1. Build UI Component Views & Basemap Gallery immediately
    this.renderBasemapGallery();
    this.bindProjectionEvents();
    this.bindResetMapEvents();
    this.bindSearchEvents();
    this.bindMeasureEvents();
    this.bindImportEvents();
    this.bindShareEvents();
    this.bindExportEvents();
    this.bindInspectorEvents();
    this.bindLegendEvents();

    // 2. Connect Telemetry & Feature Inspector
    this.mapManager.onMouseMove((info) => {
      this.statusBarUI.update(info);
    });

    this.mapManager.onFeatureClick((properties, layerName) => {
      this.showFeatureInspector(properties, layerName);
    });

    // 3. Initialize MapLibre GL map (guaranteed to resolve only when map style is loaded)
    try {
      const map = await this.mapManager.initMap();

      // Remove loading overlay smoothly
      const overlay = document.getElementById('map-loading-overlay');
      if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 400);
      }

      this.geocoderTool = new GeocoderTool(map);
      this.measureTool = new MeasureTool(map);
      this.geojsonLoader = new GeoJsonLoader(map);
      this.geeLoader = new GEELoader(map);
      this.geePanelUI = new GEEPanelUI(this.geeLoader);
      this.pikselLoader = new PikselLoader(map);
      this.pikselPanelUI = new PikselPanelUI(this.pikselLoader);

      // Register tool references for deterministic layer ordering
      this.mapManager.setGeoJsonLoader(this.geojsonLoader);
      this.mapManager.setPikselLoader(this.pikselLoader);
      this.mapManager.setGeeLoader(this.geeLoader);
      this.mapManager.setMeasureTool(this.measureTool);

      // Centralized style.load lifecycle restoration
      this.mapManager.onStyleReady(() => this.pikselLoader?.restoreAfterStyleChange());
      this.mapManager.onStyleReady(() => this.geojsonLoader?.reattachLayersIfNeeded());
      this.mapManager.onStyleReady(() => this.geeLoader?.restoreAfterStyleChange());
      this.mapManager.onStyleReady(() => this.measureTool?.restoreAfterStyleChange());
      this.mapManager.onStyleReady(() => this.updateDynamicLegend());

      // Auto-enforce layer ordering & legend update on any layer state changes
      this.pikselLoader.onLayersChange(() => {
        this.mapManager.enforceLayerOrder();
        this.updateDynamicLegend();
        this.permalinkManager?.scheduleHashUpdate();
      });
      this.geeLoader.onLayersChange(() => {
        this.mapManager.enforceLayerOrder();
        this.updateDynamicLegend();
      });
      this.geojsonLoader.onLayersChange(() => {
        this.mapManager.enforceLayerOrder();
        this.updateDynamicLegend();
      });

      // Instantiate Active Layers UI manager with seamless tab router integration
      this.activeLayersUI = new ActiveLayersUI(
        'active-layers-container',
        this.mapManager,
        this.pikselLoader,
        this.geeLoader,
        this.geojsonLoader,
        this.measureTool,
        (tabId) => this.sidebarUI.setActiveTab(tabId)
      );

      // Load sample cities vector layer, GEE Earth Engine datasets & Piksel EO UI
      await this.geojsonLoader.loadSampleData();
      await this.geeLoader.loadGEEDatasets();
      this.geePanelUI.init();
      this.pikselPanelUI.init();

      // Enforce strict layer order and render initial legend
      this.mapManager.enforceLayerOrder();
      this.updateDynamicLegend();

      // Initialize Permalink State Sync
      this.permalinkManager = new PermalinkManager(this.mapManager, this.pikselLoader, this.geeLoader);
      this.permalinkManager.init();

      // Check if URL hash has initial parameters
      const urlState = PermalinkManager.parseHash();
      if (urlState.lng !== undefined && urlState.lat !== undefined && urlState.zoom !== undefined) {
        map.jumpTo({
          center: [urlState.lng, urlState.lat],
          zoom: urlState.zoom,
          pitch: urlState.pitch ?? 0,
          bearing: urlState.bearing ?? 0
        });
      }
      if (urlState.projection === 'globe' && this.mapManager.getProjection() !== 'globe') {
        this.mapManager.toggleProjection();
        const globeLabel = document.getElementById('globe-btn-label');
        const globeBtn = document.getElementById('btn-toggle-globe');
        if (globeLabel) globeLabel.innerText = '3D Globe';
        if (globeBtn) globeBtn.classList.add('active');
      }
      if (urlState.basemapId && urlState.basemapId !== this.mapManager.getCurrentBasemapId()) {
        this.mapManager.setBasemap(urlState.basemapId);
      }
      if (urlState.year && this.pikselLoader) {
        this.pikselLoader.setSelectedYear(urlState.year);
      }
      if (urlState.productId && this.pikselLoader) {
        this.pikselLoader.setActiveProduct(urlState.productId);
      }
      if (urlState.pikselOpacity !== undefined && this.pikselLoader) {
        this.pikselLoader.setOpacity(urlState.pikselOpacity);
      }
      if (urlState.geeLayers && this.geeLoader) {
        ['lst', 'elevation', 'landcover', 'poi'].forEach(k => {
          const shouldBeActive = urlState.geeLayers!.includes(k);
          this.geeLoader?.toggleLayer(k as any, shouldBeActive);
        });
        if (urlState.geeOpacity !== undefined) {
          this.geeLoader.setOpacity(urlState.geeOpacity);
        }
        this.geePanelUI.init();
      }

      // Instantiate Point Inspector
      this.pointInspector = new PointInspector(map, this.pikselLoader, this.geeLoader, this.geojsonLoader, this.measureTool);

      // Bind measurement callbacks
      this.measureTool.onResult((res) => {
        const card = document.getElementById('measure-result-card');
        const val = document.getElementById('measure-result-value');
        if (card && val) {
          card.style.display = res.text ? 'block' : 'none';
          val.innerText = res.text || '0';
        }
        this.mapManager.enforceLayerOrder();
        this.updateDynamicLegend();
      });
    } catch (err) {
      console.error('[WebGIS] Map initialization error:', err);
      const mapEl = document.getElementById('map');
      if (mapEl) {
        mapEl.innerHTML = `
          <div class="map-error-fallback">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h2>Gagal Memuat Peta WebGIS</h2>
            <p>Pastikan browser Anda mendukung akselerasi perangkat keras WebGL dan terhubung ke internet.</p>
            <button class="btn btn-primary" onclick="window.location.reload()">
              🔄 Muat Ulang Halaman
            </button>
          </div>
        `;
      }
    }
  }

  private bindProjectionEvents() {
    const btn = document.getElementById('btn-toggle-globe');
    const label = document.getElementById('globe-btn-label');
    if (!btn || !label) return;

    const updateLabel = () => {
      const current = this.mapManager.getProjection();
      label.innerText = current === 'globe' ? '3D Globe' : '2D Mercator';
      btn.classList.toggle('active', current === 'globe');
    };

    updateLabel();

    btn.addEventListener('click', () => {
      this.mapManager.toggleProjection();
      updateLabel();
    });
  }

  private bindResetMapEvents() {
    const resetBtn = document.getElementById('btn-reset-map');
    if (!resetBtn) return;

    resetBtn.addEventListener('click', () => {
      const map = this.mapManager.getMap();
      if (!map) return;

      // 1. Reset map camera to Indonesia archipelago view
      map.flyTo({
        center: [117.89, -2.55],
        zoom: 4.5,
        pitch: 0,
        bearing: 0,
        duration: 1500
      });

      // 2. Clear active Piksel EO product and grid
      this.pikselLoader?.setActiveProduct(null);
      this.pikselLoader?.setGridVisible(false);
      this.pikselPanelUI?.syncUIStates();

      // 3. Reset all GEE layers (Rasters and POIs off)
      this.geeLoader?.clearAllLayers();
      this.geePanelUI?.init();

      // 4. Clear all custom GeoJSON layers & sample cities
      this.geojsonLoader?.clearAllLayers();
      this.renderLayersList();

      // 5. Clear active measurement
      this.measureTool?.clear();
      document.getElementById('btn-measure-dist')?.classList.remove('active');
      document.getElementById('btn-measure-area')?.classList.remove('active');
      const measureCard = document.getElementById('measure-result-card');
      if (measureCard) measureCard.style.display = 'none';

      // 6. Hide feature inspector & point inspector
      const inspector = document.getElementById('feature-inspector');
      if (inspector) inspector.style.display = 'none';
      this.pointInspector?.clear();

      // 7. Refresh Active Layers UI
      this.activeLayersUI?.render();
    });
  }

  private renderBasemapGallery() {
    const grid = document.getElementById('basemap-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const currentId = this.mapManager.getCurrentBasemapId();

    BASEMAPS.forEach((bm) => {
      const card = document.createElement('div');
      card.className = `basemap-card ${bm.id === currentId ? 'active' : ''}`;
      card.dataset.id = bm.id;

      card.innerHTML = `
        <div class="basemap-thumb" style="background-color: ${bm.previewColor};">
          ${bm.name.substring(0, 2).toUpperCase()}
        </div>
        <div class="basemap-info">
          <div class="basemap-header-row">
            <div class="basemap-title" title="${bm.name}">${bm.name}</div>
            <span class="basemap-tag">${bm.category}</span>
          </div>
          <div class="basemap-desc">${bm.description}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.basemap-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.mapManager.setBasemap(bm.id);
      });

      grid.appendChild(card);
    });
  }

  private renderLayersList() {
    const list = document.getElementById('layers-list');
    if (!list || !this.geojsonLoader) return;

    const layers = this.geojsonLoader.getLayers();
    list.innerHTML = '';

    if (layers.length === 0) {
      list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;">Belum ada layer vektor kustom. Unggah file GeoJSON atau muat data sampel.</div>';
      return;
    }

    layers.forEach((layer) => {
      const item = document.createElement('div');
      item.className = 'layer-item';
      item.innerHTML = `
        <div class="layer-left" style="cursor: pointer;" title="Klik untuk menuju ke lokasi layer">
          <input type="checkbox" id="check-${layer.id}" ${layer.visible ? 'checked' : ''} />
          <span class="legend-symbol" style="background-color: ${layer.color};"></span>
          <span class="layer-title">${layer.name} (${layer.featureCount})</span>
        </div>
        <div class="layer-actions" style="display: flex; gap: 4px; align-items: center;">
          <button class="icon-btn-sm btn-zoom-layer" data-id="${layer.id}" title="Pusatkan peta ke layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
          <button class="icon-btn-sm btn-delete-layer" data-id="${layer.id}" title="Hapus layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      `;

      // Checkbox toggle
      const check = item.querySelector<HTMLInputElement>(`#check-${layer.id}`);
      if (check) {
        check.addEventListener('click', (e) => e.stopPropagation());
        check.addEventListener('change', (e) => {
          this.geojsonLoader?.toggleLayerVisibility(layer.id, (e.target as HTMLInputElement).checked);
          this.updateDynamicLegend();
        });
      }

      // Zoom to layer button
      const zoomBtn = item.querySelector<HTMLButtonElement>('.btn-zoom-layer');
      if (zoomBtn) {
        zoomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.geojsonLoader?.zoomToLayer(layer.id);
        });
      }

      // Click title to zoom
      const titleEl = item.querySelector<HTMLElement>('.layer-title');
      if (titleEl) {
        titleEl.addEventListener('click', () => {
          this.geojsonLoader?.zoomToLayer(layer.id);
        });
      }

      // Delete layer
      const delBtn = item.querySelector<HTMLButtonElement>('.btn-delete-layer');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.geojsonLoader?.removeLayer(layer.id);
          this.renderLayersList();
          this.updateDynamicLegend();
        });
      }

      list.appendChild(item);
    });
  }

  private bindSearchEvents() {
    const input = document.getElementById('geocoder-input') as HTMLInputElement;
    const dropdown = document.getElementById('geocoder-results');
    const clearBtn = document.getElementById('search-clear-btn');
    if (!input || !dropdown) return;

    let debounceTimer: any;

    input.addEventListener('input', () => {
      const query = input.value.trim();
      if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

      clearTimeout(debounceTimer);
      if (query.length < 2) {
        dropdown.classList.remove('active');
        return;
      }

      debounceTimer = setTimeout(async () => {
        if (!this.geocoderTool) return;
        const results = await this.geocoderTool.search(query);
        this.renderSearchResults(results, dropdown);
      }, 350);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        dropdown.classList.remove('active');
        this.geocoderTool?.clear();
      });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.classList.remove('active');
      }
    });
  }

  private renderSearchResults(results: SearchResult[], dropdown: HTMLElement) {
    dropdown.innerHTML = '';
    if (results.length === 0) {
      dropdown.innerHTML = '<div class="search-result-item" style="color: var(--text-muted);">Lokasi tidak ditemukan</div>';
      dropdown.classList.add('active');
      return;
    }

    results.forEach((res) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerText = res.display_name;

      item.addEventListener('click', () => {
        dropdown.classList.remove('active');
        this.geocoderTool?.flyToResult(res);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.add('active');
  }

  private bindMeasureEvents() {
    const distBtn = document.getElementById('btn-measure-dist');
    const areaBtn = document.getElementById('btn-measure-area');
    const clearBtn = document.getElementById('btn-measure-clear');
    const instructionBox = document.getElementById('measure-instruction-box');

    const updateInstructionVisibility = () => {
      const mode = this.measureTool?.getMode();
      if (instructionBox) {
        instructionBox.style.display = mode && mode !== 'none' ? 'block' : 'none';
      }
    };

    distBtn?.addEventListener('click', () => {
      if (!this.measureTool) return;
      const current = this.measureTool.getMode();
      this.measureTool.setMode(current === 'distance' ? 'none' : 'distance');
      distBtn.classList.toggle('active', this.measureTool.getMode() === 'distance');
      areaBtn?.classList.remove('active');
      updateInstructionVisibility();
      this.updateDynamicLegend();
    });

    areaBtn?.addEventListener('click', () => {
      if (!this.measureTool) return;
      const current = this.measureTool.getMode();
      this.measureTool.setMode(current === 'area' ? 'none' : 'area');
      areaBtn.classList.toggle('active', this.measureTool.getMode() === 'area');
      distBtn?.classList.remove('active');
      updateInstructionVisibility();
      this.updateDynamicLegend();
    });

    clearBtn?.addEventListener('click', () => {
      this.measureTool?.clear();
      distBtn?.classList.remove('active');
      areaBtn?.classList.remove('active');
      updateInstructionVisibility();
      const card = document.getElementById('measure-result-card');
      if (card) card.style.display = 'none';
      this.updateDynamicLegend();
    });
  }

  private bindLegendEvents() {
    const pikselBtn = document.getElementById('btn-goto-piksel-tab');
    if (pikselBtn) {
      pikselBtn.addEventListener('click', () => {
        this.sidebarUI.setActiveTab('piksel');
      });
    }
  }

  public updateDynamicLegend() {
    const container = document.getElementById('dynamic-legend-container');
    if (!container) return;

    let html = '';
    let activeLayersCount = 0;

    // --- SECTION 1: ACTIVE THEMATIC LAYERS & SATELLITE IMAGERY ---
    let thematicHtml = '';

    // 1. Active Piksel EO Product Legend
    const activeProduct = this.pikselLoader?.getActiveProduct();
    if (activeProduct) {
      activeLayersCount++;
      let swatchesHtml = '';
      if (activeProduct.legend && activeProduct.legend.swatches) {
        swatchesHtml = `
          <div class="dynamic-legend-swatches">
            ${activeProduct.legend.swatches.map(sw => `
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: ${sw.color}; box-shadow: 0 0 6px ${sw.color}66;"></span>
                <span class="dynamic-legend-label"><strong>${sw.icon ? sw.icon + ' ' : ''}</strong>${sw.label}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      thematicHtml += `
        <div class="dynamic-legend-card highlight-card">
          <div class="dynamic-legend-card-header">
            <span class="legend-card-icon">🛰️</span>
            <div>
              <div class="dynamic-legend-title">${activeProduct.name}</div>
              <div class="dynamic-legend-sub">${activeProduct.category} • Resolusi ${activeProduct.resolution} • OGC WMS (BIG)</div>
            </div>
          </div>
          ${swatchesHtml}
        </div>
      `;
    }

    // 2. Active GEE Layers (LST, Elevation, POIs, Land Cover)
    if (this.geeLoader) {
      if (this.geeLoader.isLayerVisible('lst')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🌡️</span>
              <div>
                <div class="dynamic-legend-title">MODIS Daytime Land Surface Temperature</div>
                <div class="dynamic-legend-sub">Wilayah Studi Jakarta - Jawa Barat</div>
              </div>
            </div>
            <div class="gee-legend-bar lst-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>22°C (Sejuk)</span>
              <span>25°C</span>
              <span>28°C</span>
              <span>31°C</span>
              <span>34°C+ (Ekstrem)</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('elevation')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">⛰️</span>
              <div>
                <div class="dynamic-legend-title">USGS SRTM Ground Elevation Grid</div>
                <div class="dynamic-legend-sub">Elevasi Permukaan Tanah (mdpl)</div>
              </div>
            </div>
            <div class="gee-legend-bar elv-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>0m (Pesisir)</span>
              <span>50m</span>
              <span>200m</span>
              <span>600m</span>
              <span>1200m+ (Puncak)</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('poi')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">📍</span>
              <div>
                <div class="dynamic-legend-title">Stasiun Observasi Suhu Urban vs Rural</div>
                <div class="dynamic-legend-sub">Titik Referensi MODIS LST</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px;">
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #ef4444; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Urban Core (Jakarta Monas - 33.85°C)</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #22c55e; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Rural / Forest (Bogor IPB - 24.60°C)</span>
              </div>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('landcover')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🌳</span>
              <div>
                <div class="dynamic-legend-title">MODIS Land Cover Classification</div>
                <div class="dynamic-legend-sub">Klasifikasi Tutupan Lahan</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px;">
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #0284c7;"></span><span class="dynamic-legend-label">Laut / Air</span></div>
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #e11d48;"></span><span class="dynamic-legend-label">Perkotaan</span></div>
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #eab308;"></span><span class="dynamic-legend-label">Pertanian</span></div>
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #15803d;"></span><span class="dynamic-legend-label">Hutan Lebat</span></div>
            </div>
          </div>
        `;
      }
    }

    // 3. Custom GeoJSON Layers
    const customLayers = this.geojsonLoader?.getLayers() || [];
    const visibleCustomLayers = customLayers.filter(l => l.visible);
    if (visibleCustomLayers.length > 0) {
      activeLayersCount++;
      thematicHtml += `
        <div class="dynamic-legend-card">
          <div class="dynamic-legend-card-header">
            <span class="legend-card-icon">📂</span>
            <div>
              <div class="dynamic-legend-title">Layer Vektor Kustom (GeoJSON)</div>
              <div class="dynamic-legend-sub">${visibleCustomLayers.length} layer vektor aktif</div>
            </div>
          </div>
          <div class="dynamic-legend-swatches" style="margin-top: 8px;">
            ${visibleCustomLayers.map(l => `
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: ${l.color};"></span>
                <span class="dynamic-legend-label">${l.name} (${l.featureCount} fitur)</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Wrap Thematic Section
    if (activeLayersCount > 0) {
      html += `
        <div class="legend-section-header">
          <span class="section-title">🛰️ Layer Tematik & Citra Aktif (${activeLayersCount})</span>
        </div>
        ${thematicHtml}
      `;
    } else {
      html += `
        <div class="dynamic-legend-empty">
          <div class="empty-icon">🛰️</div>
          <div class="empty-title">Belum Ada Layer Citra / Analisis Aktif</div>
          <p class="empty-desc">Aktifkan citra di tab <strong>Piksel EO</strong> atau analisis spasial di tab <strong>GEE</strong> untuk memuat legenda spektral otomatis di sini.</p>
        </div>
      `;
    }

    // --- SECTION 2: PERMANENT GENERAL MAP & TOOL SYMBOLS ---
    html += `
      <div class="legend-section-header" style="margin-top: 14px;">
        <span class="section-title">🗺️ Simbol Peta & Fitur Standar</span>
      </div>
      <div class="dynamic-legend-card">
        <div class="dynamic-legend-swatches">
          <div class="dynamic-legend-item">
            <span class="legend-symbol point" style="background-color: #f59e0b; width: 12px; height: 12px; border-radius: 50%; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Kota Utama</strong> (Sampel Titik Vektor Ibukota & Kota Besar)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2px dashed #10b981; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Grid Data Cube Nasional</strong> (Indeks Petak Scene 10m BIG)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2.5px solid #00f0ff; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Jalur Pengukuran Jarak</strong> (Turf.js Geodesik)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol polygon" style="background-color: rgba(0,240,255,0.3); border: 1.5px solid #00f0ff; width: 14px; height: 14px; border-radius: 3px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Area Pengukuran Luas</strong> (Poligon Geodesik)</span>
          </div>
          <div class="dynamic-legend-item">
            <span style="display: flex; align-items: center; justify-content: center; width: 16px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <span class="dynamic-legend-label"><strong>Penanda Lokasi</strong> (Hasil Pencarian Geocoder)</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  private bindImportEvents() {
    const fileInput = document.getElementById('file-geojson-input') as HTMLInputElement;
    const dropzone = document.getElementById('geojson-dropzone');
    const quickImportBtn = document.getElementById('btn-quick-import');
    const sampleBtn = document.getElementById('btn-load-sample');

    quickImportBtn?.addEventListener('click', () => {
      this.sidebarUI.setActiveTab('data');
      setTimeout(() => {
        document.getElementById('geojson-dropzone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleGeoJSONFile(files[0]);
      }
    });

    // Drag & Drop
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-blue)';
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-color)';
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        this.handleGeoJSONFile(e.dataTransfer.files[0]);
      }
    });

    sampleBtn?.addEventListener('click', () => {
      this.geojsonLoader?.loadSampleData();
      this.renderLayersList();
    });
  }

  private handleGeoJSONFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as GeoJSON.FeatureCollection;
        if (!json || (!json.type && !Array.isArray((json as any).features))) {
          throw new Error('Invalid GeoJSON');
        }
        const layerId = `custom-${Date.now()}`;
        const name = file.name.replace(/\.[^/.]+$/, '');
        this.geojsonLoader?.addGeoJSONLayer(layerId, name, json, '#10b981');
        this.renderLayersList();
        this.sidebarUI.setActiveTab('data');
        showToast(`Layer "${name}" berhasil ditambahkan ke peta!`, 'success');
      } catch (err) {
        showToast('Format GeoJSON tidak valid. Pastikan file berformat FeatureCollection yang benar.', 'error');
      }
    };
    reader.onerror = () => {
      showToast('Gagal membaca file dari sistem lokal.', 'error');
    };
    reader.readAsText(file);
  }

  private bindShareEvents() {
    const shareBtn = document.getElementById('btn-share-map');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', () => {
      if (!this.permalinkManager) return;
      const url = this.permalinkManager.getShareableUrl();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('Tautan peta & analisis aktif disalin ke clipboard!', 'success');
        }).catch(() => {
          prompt('Salin tautan peta berikut:', url);
        });
      } else {
        prompt('Salin tautan peta berikut:', url);
      }
    });
  }

  private bindExportEvents() {
    const exportBtn = document.getElementById('btn-export-map');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
      const map = this.mapManager.getMap();
      if (!map) return;

      const originalHtml = exportBtn.innerHTML;
      exportBtn.innerHTML = `
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span class="btn-text-label">Memproses...</span>
      `;
      (exportBtn as HTMLButtonElement).disabled = true;

      map.once('render', () => {
        try {
          const mapCanvas = map.getCanvas();
          const w = mapCanvas.width;
          const h = mapCanvas.height;

          // Create high-res composite canvas
          const outCanvas = document.createElement('canvas');
          outCanvas.width = w;
          outCanvas.height = h;
          const ctx = outCanvas.getContext('2d');

          if (!ctx) {
            throw new Error('Canvas context unavailable');
          }

          // 1. Draw Map Canvas
          ctx.drawImage(mapCanvas, 0, 0);

          // 2. Draw Top GIS Title Banner
          const topBarHeight = Math.max(54, Math.round(h * 0.065));
          ctx.fillStyle = 'rgba(9, 14, 27, 0.88)';
          ctx.fillRect(0, 0, w, topBarHeight);

          // Top Accent Line
          ctx.fillStyle = '#00f0ff';
          ctx.fillRect(0, topBarHeight - 2, w, 2);

          // Title Text
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.max(14, Math.round(topBarHeight * 0.34))}px "Plus Jakarta Sans", sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillText('Digital Earth Indonesia WebGIS', 20, Math.round(topBarHeight * 0.44));

          // Subtitle (Active Layers & Basemap)
          const activeProduct = this.pikselLoader?.getActiveProduct();
          const activeYear = this.pikselLoader?.getSelectedYear() || '2025';
          const prodText = activeProduct ? `${activeProduct.name} (${activeYear}) • OGC WMS (10m)` : 'Peta Analisis Geospasial Nasional';
          ctx.fillStyle = '#94a3b8';
          ctx.font = `${Math.max(11, Math.round(topBarHeight * 0.24))}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillText(prodText, 20, Math.round(topBarHeight * 0.78));

          // 3. Draw Bottom GIS Metadata Strip
          const bottomBarHeight = Math.max(34, Math.round(h * 0.04));
          ctx.fillStyle = 'rgba(9, 14, 27, 0.88)';
          ctx.fillRect(0, h - bottomBarHeight, w, bottomBarHeight);

          // Bottom Accent Line
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillRect(0, h - bottomBarHeight, w, 1);

          const center = map.getCenter();
          const zoom = map.getZoom().toFixed(2);
          const coordsText = `Lat: ${center.lat.toFixed(4)}°, Lng: ${center.lng.toFixed(4)}° | Zoom: ${zoom} | CRS: EPSG:3857`;
          const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

          ctx.fillStyle = '#cbd5e1';
          ctx.font = `${Math.max(10, Math.round(bottomBarHeight * 0.36))}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(coordsText, 20, h - Math.round(bottomBarHeight * 0.38));

          ctx.textAlign = 'right';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(`Diekspor: ${nowStr} • BIG / Open Data Cube`, w - 20, h - Math.round(bottomBarHeight * 0.38));

          // Trigger download
          const link = document.createElement('a');
          link.download = `digital-earth-indonesia-map-${Date.now()}.png`;
          link.href = outCanvas.toDataURL('image/png');
          link.click();
          showToast('Peta grafis berkualitas tinggi berhasil diekspor!', 'success');
        } catch (e) {
          console.error('Export error:', e);
          showToast('Gagal mengekspor peta ke format gambar.', 'error');
        } finally {
          setTimeout(() => {
            exportBtn.innerHTML = originalHtml;
            (exportBtn as HTMLButtonElement).disabled = false;
          }, 1000);
        }
      });
      map.triggerRepaint();
    });
  }

  private showFeatureInspector(properties: Record<string, any>, layerName: string) {
    const card = document.getElementById('feature-inspector');
    const titleEl = document.getElementById('inspector-layer-name');
    const contentEl = document.getElementById('inspector-content');
    if (!card || !titleEl || !contentEl) return;

    titleEl.innerText = `Layer: ${layerName}`;

    let rowsHtml = '<table class="inspector-table">';
    for (const [k, v] of Object.entries(properties)) {
      rowsHtml += `
        <tr>
          <td class="prop-key">${k}</td>
          <td class="prop-val">${typeof v === 'object' ? JSON.stringify(v) : v}</td>
        </tr>
      `;
    }
    rowsHtml += '</table>';

    contentEl.innerHTML = rowsHtml;
    card.style.display = 'flex';
  }

  private bindInspectorEvents() {
    const closeBtn = document.getElementById('inspector-close-btn');
    const card = document.getElementById('feature-inspector');

    closeBtn?.addEventListener('click', () => {
      if (card) card.style.display = 'none';
    });

    // Escape key closes feature inspector modal
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && card && card.style.display !== 'none') {
        card.style.display = 'none';
      }
    });
  }
}

// Start application
new WebGISApp();
