import './style.css';
import { MapManager } from './map/map-manager';
import { SidebarUI, type TabId } from './ui/sidebar';
import { StatusBarUI } from './ui/status-bar';
import { GeocoderTool } from './tools/geocoder';
import { MeasureTool } from './tools/measure';
import { GeoJsonLoader } from './tools/geojson-loader';
import { GEELoader } from './tools/gee-loader';
import { GEEPanelUI } from './ui/gee-panel';
import { PikselLoader } from './tools/piksel-loader';
import { PikselPanelUI } from './ui/piksel-panel';
import { ActiveLayersUI } from './ui/active-layers';
import { showToast } from './ui/toast';
import { PermalinkManager } from './tools/permalink';
import { PointInspector } from './tools/point-inspector';
import { BasemapCustomizer } from './tools/basemap-customizer';
import { BasemapCustomizerUI } from './ui/basemap-customizer-panel';
import { MapExporter } from './tools/map-exporter';
import { DataPanelUI } from './ui/data-panel';
import { DynamicLegendUI } from './ui/dynamic-legend';
import { SearchUI } from './ui/search-ui';
import { GuidedTourUI } from './ui/guided-tour';
import { SwipeCompareManager } from './tools/swipe-compare';
import { SwipeCompareUI } from './ui/swipe-compare-ui';
import { CommandPaletteUI } from './ui/command-palette';
import { ErrorHandler } from './utils/error-handler';
import { setupUniversalEscapeHandler, announceToScreenReader, closeMenu, toggleMenu } from './utils/a11y';
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
    this.dynamicLegendUI = new DynamicLegendUI('dynamic-legend-container', null, null, null);

    // Bind network changes to status bar
    this.errorHandler.onNetworkChange((online) => {
      this.statusBarUI.setOnlineStatus(online);
    });

    this.bindGlobalEvents();
    this.init();
  }

  private bindGlobalEvents() {
    this.bindThemeEvents();
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

    // 3. Connect Telemetry & Unified Point Inspector
    this.mapManager.onMouseMove((info) => {
      this.statusBarUI.update(info);
    });

    this.mapManager.onFeatureClick((_properties, _layerName, coordinates) => {
      if (this.swipeCompareManager?.isActive()) return;
      if (this.pointInspector && coordinates) {
        this.pointInspector.inspectCoordinate(coordinates[0], coordinates[1]);
      }
    });
  }

  private async init() {
    // 1. Initialize Basemap Customizer Engine & UI immediately
    this.basemapCustomizer = new BasemapCustomizer(null, this.mapManager);
    this.basemapCustomizerUI = new BasemapCustomizerUI(this.basemapCustomizer, this.mapManager);

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
        (tabId: TabId) => this.sidebarUI.setActiveTab(tabId)
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

      // Connect Map instance to Basemap Customizer
      this.basemapCustomizer?.setMap(map);

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

      // Initialize Permalink State Sync & Apply URL state
      this.permalinkManager = new PermalinkManager(this.mapManager, this.pikselLoader, this.geeLoader, this.basemapCustomizer);
      this.permalinkManager.init();

      const urlState = PermalinkManager.parseHash();
      await PermalinkManager.applyInitialState(urlState, {
        mapManager: this.mapManager,
        pikselLoader: this.pikselLoader,
        geeLoader: this.geeLoader,
        basemapCustomizer: this.basemapCustomizer,
        geePanelUI: this.geePanelUI
      });

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

      // 2. Reset projection to 2D Mercator
      this.mapManager.setProjection('mercator');
      const globeBtn = document.getElementById('btn-toggle-globe');
      const globeLabel = document.getElementById('globe-btn-label');
      if (globeBtn) globeBtn.classList.remove('active');
      if (globeLabel) globeLabel.innerText = 'Mode 3D Bola Dunia';

      // 3. Reset basemap to default OSM and opacity to 100%
      this.mapManager.setBasemap('osm');
      this.mapManager.setBasemapOpacity(1.0);
      this.updateActiveBasemapCard();

      // 4. Clear active measurement
      this.measureTool?.clear();
      document.getElementById('btn-measure-dist')?.classList.remove('active');
      document.getElementById('btn-measure-area')?.classList.remove('active');
      const measureCard = document.getElementById('measure-result-card');
      if (measureCard) measureCard.style.display = 'none';

      // 5. Hide floating point & feature inspector
      this.pointInspector?.clear();

      // 6. Reset Basemap Customizer (3D terrain & overlays off, all sublayers on)
      if (this.basemapCustomizer) {
        this.basemapCustomizer.toggle3DTerrain(false);
        this.basemapCustomizer.toggleTerrainHillshade(false);
        this.basemapCustomizer.toggle3DBuildings(false);
        this.basemapCustomizer.setAllSublayers(true);
        this.basemapCustomizerUI?.syncUI();
      }

      // 7. Deactivate Swipe Comparison Mode if active
      this.swipeCompareManager?.deactivate();

      // 8. Refresh Active Layers UI & Legend
      this.activeLayersUI?.render();
      this.dynamicLegendUI?.render();

      showToast('Tampilan peta direset ke tampilan default', 'info');
    });
  }

  public updateActiveBasemapCard() {
    this.basemapCustomizerUI?.syncUI();
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

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(moreBtn, dropdown, 'flex');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!moreBtn.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        closeMenu(moreBtn, dropdown);
      }
    });

    // Sub-items
    const bindItem = (id: string, action: () => void) => {
      document.getElementById(id)?.addEventListener('click', () => {
        closeMenu(moreBtn, dropdown);
        action();
      });
    };

    bindItem('more-item-tour', () => document.getElementById('btn-start-tour')?.click());
    bindItem('more-item-reset', () => document.getElementById('btn-reset-map')?.click());
    bindItem('more-item-import', () => document.getElementById('btn-quick-import')?.click());
    bindItem('more-item-share', () => this.handleShare());
    bindItem('more-item-export', () => this.handleExport());
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
        // 4. Floating Point & Feature Inspector
        const floatInsp = document.getElementById('floating-inspector-card');
        if (floatInsp && floatInsp.classList.contains('active')) {
          this.pointInspector?.clear();
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
