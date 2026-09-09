import './style.css';
import { MapManager } from './map/map-manager';
import { SidebarUI } from './ui/sidebar';
import { StatusBarUI } from './ui/status-bar';
import { GeocoderTool } from './tools/geocoder';
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
import { BasemapCustomizer } from './tools/basemap-customizer';
import { BasemapCustomizerUI } from './ui/basemap-customizer-panel';
import { MapExporter } from './tools/map-exporter';
import { DataPanelUI } from './ui/data-panel';
import { DynamicLegendUI } from './ui/dynamic-legend';
import { FeatureInspectorUI } from './ui/feature-inspector';
import { SearchUI } from './ui/search-ui';
import { GuidedTourUI } from './ui/guided-tour';
import { SwipeCompareManager } from './tools/swipe-compare';
import { SwipeCompareUI } from './ui/swipe-compare-ui';
import { CommandPaletteUI } from './ui/command-palette';
import { ErrorHandler } from './utils/error-handler';
import { setupUniversalEscapeHandler, announceToScreenReader } from './utils/a11y';
import { logger } from './utils/logger';

class WebGISApp {
  private mapManager: MapManager;
  private sidebarUI: SidebarUI;
  private statusBarUI: StatusBarUI;
  private geocoderTool: GeocoderTool | null = null;
  private measureTool: MeasureTool | null = null;
  private geojsonLoader: GeoJsonLoader | null = null;
  private dataPanelUI: DataPanelUI | null = null;
  private dynamicLegendUI: DynamicLegendUI | null = null;
  private geeLoader: GEELoader | null = null;
  private geePanelUI: GEEPanelUI | null = null;
  private pikselLoader: PikselLoader | null = null;
  private pikselPanelUI: PikselPanelUI | null = null;
  private activeLayersUI: ActiveLayersUI | null = null;
  private permalinkManager: PermalinkManager | null = null;
  private pointInspector: PointInspector | null = null;
  private basemapCustomizer: BasemapCustomizer | null = null;
  private basemapCustomizerUI: BasemapCustomizerUI | null = null;
  private mapExporter: MapExporter | null = null;
  private featureInspectorUI: FeatureInspectorUI;
  private guidedTourUI: GuidedTourUI | null = null;
  private swipeCompareManager: SwipeCompareManager | null = null;
  private swipeCompareUI: SwipeCompareUI | null = null;
  private commandPaletteUI: CommandPaletteUI | null = null;
  private errorHandler: ErrorHandler;

  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
    this.mapManager = new MapManager('map');
    this.sidebarUI = new SidebarUI();
    this.statusBarUI = new StatusBarUI();
    this.featureInspectorUI = new FeatureInspectorUI();
    this.dynamicLegendUI = new DynamicLegendUI('dynamic-legend-container', null, null, null);

    // Bind network changes to status bar
    this.errorHandler.onNetworkChange((online) => {
      this.statusBarUI.setOnlineStatus(online);
    });

    this.init();
  }

  private async init() {
    // 1. Build UI Component Views & Basemap Gallery immediately
    this.renderBasemapGallery();
    this.bindProjectionEvents();
    this.bindResetMapEvents();
    this.bindMeasureEvents();
    this.bindShareEvents();
    this.bindExportEvents();
    this.bindLegendEvents();
    this.bindTourEvents();
    this.bindSwipeEvents();
    this.bindCommandPaletteEvents();
    this.bindHeaderMoreEvents();
    this.bindUniversalEscape();

    // 2. Connect Telemetry & Feature Inspector
    this.mapManager.onMouseMove((info) => {
      this.statusBarUI.update(info);
    });

    this.mapManager.onFeatureClick((properties, layerName) => {
      if (this.swipeCompareManager?.isActive()) return;
      this.featureInspectorUI.show(properties, layerName);
    });

    // 3. Initialize MapLibre GL map (guaranteed to resolve only when map style is loaded)
    try {
      const map = await this.mapManager.initMap();

      this.geocoderTool = new GeocoderTool(map);
      new SearchUI(this.geocoderTool);
      this.measureTool = new MeasureTool(map);
      this.geojsonLoader = new GeoJsonLoader(map);
      this.geeLoader = new GEELoader(map);
      this.geePanelUI = new GEEPanelUI(this.geeLoader);
      this.pikselLoader = new PikselLoader(map);
      this.pikselPanelUI = new PikselPanelUI(this.pikselLoader);
      this.mapExporter = new MapExporter(map, this.pikselLoader);

      // Connect Dynamic Legend UI references
      this.dynamicLegendUI?.setPikselLoader(this.pikselLoader);
      this.dynamicLegendUI?.setGEELoader(this.geeLoader);
      this.dynamicLegendUI?.setGeoJSONLoader(this.geojsonLoader);

      // Instantiate Data Panel UI (GeoJSON Uploads & Vector Layers Manager)
      this.dataPanelUI = new DataPanelUI(
        this.geojsonLoader,
        this.sidebarUI,
        () => {
          this.mapManager.enforceLayerOrder();
          this.dynamicLegendUI?.render();
        }
      );

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
      this.mapManager.onStyleReady(() => {
        const bmId = this.mapManager.getCurrentBasemapId();
        this.basemapCustomizer?.setBasemapId(bmId);
        this.updateActiveBasemapCard();
      });
      this.mapManager.onStyleReady(() => this.dynamicLegendUI?.render());

      // Auto-enforce layer ordering & legend update on any layer state changes
      this.pikselLoader.onLayersChange(() => {
        this.mapManager.enforceLayerOrder();
        this.dynamicLegendUI?.render();
        this.permalinkManager?.scheduleHashUpdate();
      });
      this.geeLoader.onLayersChange(() => {
        this.mapManager.enforceLayerOrder();
        this.dynamicLegendUI?.render();
      });
      this.geojsonLoader.onLayersChange(() => {
        this.mapManager.enforceLayerOrder();
        this.dynamicLegendUI?.render();
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

      // Load lightweight sample cities vector layer & Piksel EO UI
      await this.geojsonLoader.loadSampleData();
      this.dataPanelUI.render();
      this.pikselPanelUI.init();
      this.geePanelUI.init();

      // Lazy-load GEE datasets on-demand when the GEE tab is selected
      this.sidebarUI.onTabChange((tabId) => {
        if (this.swipeCompareManager?.isActive()) {
          this.swipeCompareManager.deactivate();
        }
        if (tabId === 'gee') {
          this.geeLoader?.loadGEEDatasets();
          this.geePanelUI?.renderTimeSeriesChart();
        }
      });

      // Initialize Basemap Customizer Engine & UI
      this.basemapCustomizer = new BasemapCustomizer(map, this.mapManager);
      this.basemapCustomizerUI = new BasemapCustomizerUI(this.basemapCustomizer, this.mapManager, this.pikselLoader);

      // Initialize Interactive Guided Tour
      this.guidedTourUI = new GuidedTourUI(
        this.mapManager,
        this.pikselLoader,
        this.geeLoader,
        this.basemapCustomizer,
        this.sidebarUI
      );

      // Initialize Swipe / Split-Screen Comparison Mode
      this.swipeCompareManager = new SwipeCompareManager(
        map,
        this.mapManager,
        this.sidebarUI,
        this.pikselLoader
      );
      this.swipeCompareUI = new SwipeCompareUI(this.swipeCompareManager);

      // Initialize Spotlight Command Palette
      this.commandPaletteUI = new CommandPaletteUI(
        this.mapManager,
        this.pikselLoader,
        this.geeLoader,
        this.measureTool,
        this.sidebarUI,
        this.swipeCompareManager,
        this.guidedTourUI
      );

      // Enforce strict layer order and render initial legend
      this.mapManager.enforceLayerOrder();
      this.dynamicLegendUI?.render();

      // Initialize Permalink State Sync
      this.permalinkManager = new PermalinkManager(this.mapManager, this.pikselLoader, this.geeLoader, this.basemapCustomizer);
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
        if (globeLabel) globeLabel.innerText = 'Mode 3D Bola Dunia';
        if (globeBtn) globeBtn.classList.add('active');
      }
      if (urlState.terrain3D && this.basemapCustomizer) {
        this.basemapCustomizer.toggle3DTerrain(true);
      }
      if (urlState.terrainHillshade && this.basemapCustomizer) {
        this.basemapCustomizer.toggleTerrainHillshade(true);
      }
      if (urlState.basemapId && urlState.basemapId !== this.mapManager.getCurrentBasemapId()) {
        this.mapManager.setBasemap(urlState.basemapId);
      }
      if (urlState.basemapOpacity !== undefined) {
        this.mapManager.setBasemapOpacity(urlState.basemapOpacity);
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
        await this.geeLoader.loadGEEDatasets();
        ['lst', 'elevation', 'landcover', 'poi'].forEach(k => {
          const shouldBeActive = urlState.geeLayers!.includes(k);
          this.geeLoader?.toggleLayer(k as any, shouldBeActive);
        });
        if (urlState.geeOpacity !== undefined) {
          this.geeLoader.setOpacity(urlState.geeOpacity);
        }
        this.geePanelUI.init();
      }

      // Mobile UX Optimization: auto-collapse sidebar on initial mobile load
      if (window.innerWidth <= 768) {
        this.sidebarUI.setOpen(false);
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
        this.dynamicLegendUI?.render();
      });

      // Smoothly dismiss loading overlay now that full system initialization is stable
      const overlay = document.getElementById('map-loading-overlay');
      if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 400);
      }
    } catch (err) {
      logger.error('[WebGIS] Map initialization error:', err);
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
      label.innerText = current === 'globe' ? 'Mode 3D Bola Dunia' : 'Mode 2D Mercator';
      btn.classList.toggle('active', current === 'globe');
    };

    updateLabel();

    btn.addEventListener('click', () => {
      if (this.swipeCompareManager?.isActive()) {
        this.swipeCompareManager.deactivate();
      }
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
      this.dataPanelUI?.render();

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

      // 7. Reset Basemap Customizer (3D terrain & overlays off, all sublayers on)
      if (this.basemapCustomizer) {
        this.basemapCustomizer.toggle3DTerrain(false);
        this.basemapCustomizer.toggleTerrainHillshade(false);
        this.basemapCustomizer.toggle3DBuildings(false);
        this.basemapCustomizer.setAllSublayers(true);
        this.basemapCustomizerUI?.syncUI();
      }

      // 8. Deactivate Swipe Comparison Mode if active
      this.swipeCompareManager?.deactivate();

      // 9. Refresh Active Layers UI & Legend
      this.activeLayersUI?.render();
      this.dynamicLegendUI?.render();
    });
  }

  public updateActiveBasemapCard() {
    const currentId = this.mapManager.getCurrentBasemapId();
    const bm = BASEMAPS.find((b) => b.id === currentId);
    const titleEl = document.getElementById('active-bm-title');
    const badgeEl = document.getElementById('active-bm-type-badge');
    if (titleEl && bm) titleEl.textContent = bm.name;
    if (badgeEl && bm) badgeEl.textContent = bm.category;
  }

  private renderBasemapGallery() {
    this.updateActiveBasemapCard();
    const grid = document.getElementById('basemap-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const currentId = this.mapManager.getCurrentBasemapId();

    const groups: { key: 'recommended' | 'thematic' | 'canvas'; title: string; desc: string }[] = [
      { key: 'recommended', title: '⭐ Rekomendasi Utama', desc: 'Peta dasar satelit, jalan, dan peta resmi nasional BIG' },
      { key: 'thematic', title: '🎨 Tematik & Topografi', desc: 'Kontur elevasi, batimetri laut, dan gaya artistik' },
      { key: 'canvas', title: '🌓 Kanvas & Navigasi', desc: 'Latar kontras tinggi untuk visualisasi overlay data' }
    ];

    groups.forEach((grp) => {
      const groupBasemaps = BASEMAPS.filter((b) => (b.group || 'recommended') === grp.key);
      if (groupBasemaps.length === 0) return;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'basemap-gallery-group-header';
      groupHeader.innerHTML = `
        <div class="group-title-row" style="display:flex; justify-content:space-between; align-items:baseline; margin: 12px 0 6px 0; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px;">
          <h4 style="margin:0; font-size: 12.5px; font-weight:700; color: var(--text-main);">${grp.title}</h4>
          <span style="font-size: 10.5px; color: var(--text-muted);">${groupBasemaps.length} Pilihan</span>
        </div>
      `;
      grid.appendChild(groupHeader);

      const groupContainer = document.createElement('div');
      groupContainer.className = 'basemap-group-cards-grid';
      groupContainer.style.display = 'grid';
      groupContainer.style.gap = '8px';
      groupContainer.style.marginBottom = '12px';

      groupBasemaps.forEach((bm) => {
        const card = document.createElement('div');
        card.className = `basemap-card ${bm.id === currentId ? 'active' : ''}`;
        card.dataset.id = bm.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Pilih basemap ${bm.name} kategori ${bm.category}`);

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

        const selectBm = () => {
          document.querySelectorAll('.basemap-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          this.mapManager.setBasemap(bm.id);
          announceToScreenReader(`Peta dasar diubah ke ${bm.name} (${bm.category})`);
        };

        card.addEventListener('click', selectBm);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectBm();
          }
        });

        groupContainer.appendChild(card);
      });

      grid.appendChild(groupContainer);
    });
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
      if (this.swipeCompareManager?.isActive()) {
        this.swipeCompareManager.deactivate();
      }
      const current = this.measureTool.getMode();
      this.measureTool.setMode(current === 'distance' ? 'none' : 'distance');
      distBtn.classList.toggle('active', this.measureTool.getMode() === 'distance');
      areaBtn?.classList.remove('active');
      updateInstructionVisibility();
      this.dynamicLegendUI?.render();
    });

    areaBtn?.addEventListener('click', () => {
      if (!this.measureTool) return;
      if (this.swipeCompareManager?.isActive()) {
        this.swipeCompareManager.deactivate();
      }
      const current = this.measureTool.getMode();
      this.measureTool.setMode(current === 'area' ? 'none' : 'area');
      areaBtn.classList.toggle('active', this.measureTool.getMode() === 'area');
      distBtn?.classList.remove('active');
      updateInstructionVisibility();
      this.dynamicLegendUI?.render();
    });

    const finishBtn = document.getElementById('btn-measure-finish');
    finishBtn?.addEventListener('click', () => {
      this.measureTool?.finishMeasurement();
    });

    clearBtn?.addEventListener('click', () => {
      this.measureTool?.clear();
      distBtn?.classList.remove('active');
      areaBtn?.classList.remove('active');
      updateInstructionVisibility();
      const card = document.getElementById('measure-result-card');
      if (card) card.style.display = 'none';
      this.dynamicLegendUI?.render();
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

  private bindShareEvents() {
    const shareBtn = document.getElementById('btn-share-map');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', () => {
      this.handleShare();
    });
  }

  private handleShare() {
    if (!this.permalinkManager) return;
    const url = this.permalinkManager.getShareableUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Tautan peta & analisis aktif disalin ke clipboard!', 'success');
        announceToScreenReader('Tautan peta dan analisis aktif berhasil disalin ke clipboard.');
      }).catch(() => {
        prompt('Salin tautan peta berikut:', url);
      });
    } else {
      prompt('Salin tautan peta berikut:', url);
    }
  }

  private bindExportEvents() {
    const exportBtn = document.getElementById('btn-export-map') as HTMLButtonElement | null;
    exportBtn?.addEventListener('click', () => {
      this.handleExport(exportBtn);
    });
  }

  private handleExport(exportBtn?: HTMLButtonElement | null) {
    if (this.mapExporter) {
      if (this.pikselLoader) this.mapExporter.setPikselLoader(this.pikselLoader);
      this.mapExporter.exportPNG(exportBtn);
    }
  }

  private bindTourEvents() {
    const startTourBtn = document.getElementById('btn-start-tour');
    const quickTourBtn = document.getElementById('btn-quick-tour');
    const importBtn = document.getElementById('btn-quick-import');

    const handleStartTour = () => {
      if (this.swipeCompareManager?.isActive()) {
        this.swipeCompareManager.deactivate();
      }
      if (this.guidedTourUI) {
        this.guidedTourUI.startTour();
      }
    };

    startTourBtn?.addEventListener('click', handleStartTour);
    quickTourBtn?.addEventListener('click', handleStartTour);

    importBtn?.addEventListener('click', () => {
      if (this.swipeCompareManager?.isActive()) {
        this.swipeCompareManager.deactivate();
      }
      this.sidebarUI.setActiveTab('data');
      this.sidebarUI.setOpen(true);
    });
  }

  private bindSwipeEvents() {
    const dockSwipeBtn = document.getElementById('btn-dock-swipe');
    const sidebarSwipeBtn = document.getElementById('btn-sidebar-start-swipe');

    const handleToggleSwipe = () => {
      if (!this.swipeCompareManager) return;
      if (this.swipeCompareManager.isActive()) {
        this.swipeCompareManager.deactivate();
        showToast('Mode komparasi swipe ditutup', 'info');
      } else {
        this.swipeCompareManager.activate();
        showToast('Mode komparasi swipe aktif. Geser slider untuk membandingkan.', 'info');
      }
    };

    dockSwipeBtn?.addEventListener('click', handleToggleSwipe);
    sidebarSwipeBtn?.addEventListener('click', handleToggleSwipe);
  }

  private bindCommandPaletteEvents() {
    const cmdBtn = document.getElementById('btn-open-cmd-palette');
    cmdBtn?.addEventListener('click', () => {
      this.commandPaletteUI?.toggle();
    });
  }

  private bindHeaderMoreEvents() {
    const moreBtn = document.getElementById('btn-header-more-actions');
    const dropdown = document.getElementById('header-more-dropdown');
    if (!moreBtn || !dropdown) return;

    const toggleDropdown = () => {
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'flex';
      moreBtn.setAttribute('aria-expanded', String(!isOpen));
    };

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!moreBtn.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.style.display = 'none';
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Items
    document.getElementById('more-item-tour')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      moreBtn.setAttribute('aria-expanded', 'false');
      document.getElementById('btn-start-tour')?.click();
    });

    document.getElementById('more-item-reset')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      moreBtn.setAttribute('aria-expanded', 'false');
      document.getElementById('btn-reset-map')?.click();
    });

    document.getElementById('more-item-import')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      moreBtn.setAttribute('aria-expanded', 'false');
      document.getElementById('btn-quick-import')?.click();
    });

    document.getElementById('more-item-share')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      moreBtn.setAttribute('aria-expanded', 'false');
      this.handleShare();
    });

    document.getElementById('more-item-export')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      moreBtn.setAttribute('aria-expanded', 'false');
      this.handleExport();
    });
  }

  private bindUniversalEscape() {
    setupUniversalEscapeHandler([
      () => {
        // 1. Command Palette
        if (this.commandPaletteUI?.isPaletteOpen()) {
          this.commandPaletteUI.close();
          return true;
        }
        return false;
      },
      () => {
        // 2. Header More Dropdown
        const dropdown = document.getElementById('header-more-dropdown');
        if (dropdown && dropdown.style.display !== 'none') {
          dropdown.style.display = 'none';
          document.getElementById('btn-header-more-actions')?.setAttribute('aria-expanded', 'false');
          return true;
        }
        return false;
      },
      () => {
        // 3. Popovers
        let closed = false;
        ['basemap-popover', 'sublayers-popover', 'terrain-popover'].forEach((id) => {
          const pop = document.getElementById(id);
          if (pop && pop.style.display !== 'none') {
            pop.style.display = 'none';
            closed = true;
          }
        });
        if (closed) return true;
        return false;
      },
      () => {
        // 4. Feature Inspector & Floating Inspector
        const insp = document.getElementById('feature-inspector');
        if (insp && insp.style.display !== 'none') {
          insp.style.display = 'none';
          return true;
        }
        const floatInsp = document.getElementById('floating-inspector-card');
        if (floatInsp && floatInsp.classList.contains('active')) {
          floatInsp.classList.remove('active');
          return true;
        }
        return false;
      },
      () => {
        // 5. Cancel active measurement
        if (this.measureTool && this.measureTool.getMode() !== 'none') {
          this.measureTool.clear();
          document.getElementById('btn-measure-dist')?.classList.remove('active');
          document.getElementById('btn-measure-area')?.classList.remove('active');
          const card = document.getElementById('measure-result-card');
          if (card) card.style.display = 'none';
          const instructionBox = document.getElementById('measure-instruction-box');
          if (instructionBox) instructionBox.style.display = 'none';
          showToast('Mode pengukuran dibatalkan', 'info');
          return true;
        }
        return false;
      }
    ]);
  }

  public getSwipeCompareUI(): SwipeCompareUI | null {
    return this.swipeCompareUI;
  }

  public getCommandPaletteUI(): CommandPaletteUI | null {
    return this.commandPaletteUI;
  }
}

// Start application
new WebGISApp();
