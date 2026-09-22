import './style.css';
import { MapManager } from './map/map-manager';
import { SidebarUI, type TabId } from './ui/sidebar';
import { StatusBarUI } from './ui/status-bar';
import { GeocoderTool } from './tools/geocoder';
import { MeasureTool, type ElevationProfileSummary } from './tools/measure';
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
import { DEFAULT_BASEMAP_ID } from './config/basemaps';
import { MapExporter } from './tools/map-exporter';
import { DataPanelUI } from './ui/data-panel';
import { DynamicLegendUI } from './ui/dynamic-legend';
import { SearchUI } from './ui/search-ui';
import { GuidedTourUI } from './ui/guided-tour';
import { SwipeCompareManager } from './tools/swipe-compare';
import { SwipeCompareUI } from './ui/swipe-compare-ui';
import { CommandPaletteUI } from './ui/command-palette';
import { SpatialAnalysisUI } from './ui/spatial-analysis-ui';
import { BufferAnalysisUI } from './ui/buffer-analysis-ui';
import { AttributeTableUI } from './ui/attribute-table-panel';
import { ShortcutsModalUI } from './ui/shortcuts-modal';
import { OverviewMapUI } from './ui/overview-map';
import { ErrorHandler } from './utils/error-handler';
import { setupUniversalEscapeHandler, announceToScreenReader, closeMenu, toggleMenu } from './utils/a11y';
import { escapeHtml } from './utils/sanitize';
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
  private spatialAnalysisUI: SpatialAnalysisUI | null = null;
  private bufferAnalysisUI: BufferAnalysisUI | null = null;
  private attributeTableUI: AttributeTableUI | null = null;
  private shortcutsModalUI: ShortcutsModalUI | null = null;
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
    this.bindProjectionEvents();
    this.bindResetMapEvents();
    this.bindMeasureEvents();
    this.bindShareEvents();
    this.bindExportEvents();
    this.bindCitationEvents();
    this.bindLegendEvents();
    this.bindTourEvents();
    this.bindSwipeEvents();
    this.bindSavedProjectsEvents();
    this.bindCommandPaletteEvents();
    this.bindHeaderMoreEvents();
    this.bindGlobalKeyboardShortcuts();
    this.initServiceWorkerAndOfflineSync();
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
      this.basemapCustomizerUI?.setPikselLoader(this.pikselLoader);
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
          this.bufferAnalysisUI?.updateLayerSelect();
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

      // Instantiate Spatial Analysis & Zonal Statistics Module
      this.spatialAnalysisUI = new SpatialAnalysisUI(map, 'spatial-analysis-panel');
      this.spatialAnalysisUI.init();
      this.commandPaletteUI.setSpatialAnalysisUI(this.spatialAnalysisUI);

      // Instantiate Proximity Buffer Analysis Module
      this.bufferAnalysisUI = new BufferAnalysisUI(this.geojsonLoader, () => {
        this.dataPanelUI?.render();
        this.dynamicLegendUI?.render();
        this.mapManager.enforceLayerOrder();
      });
      this.bufferAnalysisUI.init();

      // Refresh buffer layers dropdown whenever analysis tab is opened
      this.sidebarUI.onTabChange((tabId) => {
        if (tabId === 'analysis') {
          this.bufferAnalysisUI?.updateLayerSelect();
        }
      });

      // Instantiate Attribute Table & Shortcuts Modal
      this.attributeTableUI = new AttributeTableUI(map, this.geojsonLoader);
      this.attributeTableUI.setOnSwitchToDataTab(() => this.sidebarUI.setActiveTab('data'));
      this.shortcutsModalUI = new ShortcutsModalUI();

      this.dataPanelUI.onOpenAttributeTable((layerId) => this.attributeTableUI?.open(layerId));
      this.dataPanelUI.onNavigateToBufferAnalysis((layerId) => {
        this.sidebarUI.setActiveTab('analysis');
        this.sidebarUI.setOpen(true);
        this.bufferAnalysisUI?.selectLayer(layerId);
        const container = document.getElementById('buffer-analysis-container');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        showToast('Lapisan dipilih di modul Analisis Zona Penyangga', 'info');
      });
      this.commandPaletteUI.setAttributeTableUI(this.attributeTableUI);
      this.commandPaletteUI.setShortcutsModalUI(this.shortcutsModalUI);

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

      // Instantiate Point Inspector & Overview Locator Inset Map
      this.pointInspector = new PointInspector(map, this.pikselLoader, this.geeLoader, this.geojsonLoader, this.measureTool);
      new OverviewMapUI(map);

      // Bind measurement callbacks
      this.measureTool.onResult((res) => {
        const card = document.getElementById('measure-result-card');
        const val = document.getElementById('measure-result-value');
        if (card && val) {
          card.style.display = res.text ? 'block' : 'none';
          val.innerText = res.text || '0';
        }
        this.renderElevationProfileChart(res.profile || null);
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
            <p>Pastikan peramban Anda mendukung akselerasi perangkat keras WebGL dan terhubung dengan internet.</p>
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
    if (!btn) return;

    const updateLabel = () => {
      const isGlobe = this.mapManager.getProjection() === 'globe';
      btn.classList.toggle('active', isGlobe);
      const label = document.getElementById('globe-btn-label');
      if (label) {
        label.innerText = isGlobe ? 'Proyeksi Mercator 2D' : 'Proyeksi Bola 3D';
      }
      btn.setAttribute('title', isGlobe ? 'Beralih ke Proyeksi Peta Datar (Mercator 2D)' : 'Beralih ke Proyeksi Bola Bumi (3D Globe)');
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

      const prevCenter = map.getCenter();
      const prevZoom = map.getZoom();
      const prevPitch = map.getPitch();
      const prevBearing = map.getBearing();

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
      if (globeLabel) globeLabel.innerText = 'Proyeksi Bola 3D';

      // 3. Reset basemap to default Esri Imagery and opacity to 100%
      this.mapManager.setBasemap(DEFAULT_BASEMAP_ID);
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

      showToast('Tampilan peta dikembalikan ke posisi awal', {
        type: 'info',
        durationMs: 6000,
        action: {
          label: '↩️ Urungkan',
          onClick: () => {
            map.flyTo({
              center: prevCenter,
              zoom: prevZoom,
              pitch: prevPitch,
              bearing: prevBearing,
              duration: 1500
            });
            showToast('Posisi kamera dipulihkan', 'info', 2000);
          }
        }
      });
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

    const exportGeoJsonBtn = document.getElementById('btn-measure-download-geojson');
    exportGeoJsonBtn?.addEventListener('click', () => {
      if (!this.measureTool || !this.measureTool.hasActiveMeasurement()) {
        showToast('Tidak ada geometri pengukuran untuk diunduh.', 'warning');
        return;
      }
      const ok = this.measureTool.exportGeoJSON();
      if (ok) {
        showToast('Geometri pengukuran berhasil diekspor sebagai GeoJSON!', 'success');
      }
    });

    const exportKmlBtn = document.getElementById('btn-measure-download-kml');
    exportKmlBtn?.addEventListener('click', () => {
      if (!this.measureTool || !this.measureTool.hasActiveMeasurement()) {
        showToast('Tidak ada geometri pengukuran untuk diunduh.', 'warning');
        return;
      }
      const ok = this.measureTool.exportKML();
      if (ok) {
        showToast('Geometri pengukuran berhasil diekspor sebagai KML!', 'success');
      }
    });

    const undoBtn = document.getElementById('btn-measure-undo');
    undoBtn?.addEventListener('click', () => {
      this.measureTool?.undoLastPoint();
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
        showToast('Tautan tampilan peta & analisis aktif berhasil disalin ke papan klip!', 'success');
        announceToScreenReader('Tautan tampilan peta & analisis aktif berhasil disalin ke papan klip.');
      }).catch(() => {
        prompt('Salin tautan bagikan peta:', url);
      });
    } else {
      prompt('Salin tautan bagikan peta:', url);
    }
  }

  private bindSavedProjectsEvents() {
    const saveBtn = document.getElementById('btn-save-current-project');
    const nameInput = document.getElementById('input-save-project-name') as HTMLInputElement | null;

    const renderProjects = () => {
      const container = document.getElementById('saved-projects-list');
      const countEl = document.getElementById('saved-projects-count');
      if (!container) return;

      const projects = PermalinkManager.getSavedProjects();
      if (countEl) countEl.innerText = `${projects.length} Tampilan`;

      if (projects.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 11px; padding: 6px 0; text-align: center;">Belum ada tampilan tersimpan.</div>`;
        return;
      }

      container.innerHTML = projects.map(p => `
        <div class="saved-project-item">
          <div class="saved-project-item-info">
            <strong class="saved-project-name">${escapeHtml(p.name)}</strong>
            <span class="saved-project-date">${escapeHtml(p.dateFormatted)}</span>
          </div>
          <div class="saved-project-actions">
            <button class="btn btn-secondary btn-sm btn-load-project" data-id="${p.id}" title="Buka tampilan ini">Buka</button>
            <button class="icon-btn-sm btn-del-project" data-id="${p.id}" title="Hapus tampilan" aria-label="Hapus tampilan ${escapeHtml(p.name)}">✕</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.btn-load-project').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id;
          if (id && this.permalinkManager) {
            const ok = await this.permalinkManager.loadSavedProject(id);
            if (ok) showToast('Tampilan peta tersimpan berhasil dimuat!', 'success');
          }
        });
      });

      container.querySelectorAll('.btn-del-project').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.id;
          if (id) {
            PermalinkManager.deleteSavedProject(id);
            renderProjects();
            showToast('Tampilan tersimpan berhasil dihapus.', 'info');
          }
        });
      });
    };

    saveBtn?.addEventListener('click', () => {
      const val = nameInput?.value?.trim();
      if (!val) {
        showToast('Silakan masukkan nama bookmark tampilan terlebih dahulu.', 'warning');
        return;
      }
      if (this.permalinkManager) {
        const p = this.permalinkManager.saveCurrentAsProject(val);
        if (p) {
          if (nameInput) nameInput.value = '';
          renderProjects();
          showToast(`Tampilan "${val}" berhasil disimpan!`, 'success');
        }
      }
    });

    renderProjects();
  }

  private bindExportEvents() {
    const exportBtn = document.getElementById('btn-export-map') as HTMLButtonElement | null;
    exportBtn?.addEventListener('click', () => {
      this.openExportModal();
    });

    const modal = document.getElementById('modal-map-export');
    const closeBtn = document.getElementById('btn-close-export-modal');
    const cancelBtn = document.getElementById('btn-cancel-export-modal');
    const confirmBtn = document.getElementById('btn-confirm-export-modal') as HTMLButtonElement | null;

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    confirmBtn?.addEventListener('click', () => {
      if (!this.mapExporter) return;
      if (this.pikselLoader) this.mapExporter.setPikselLoader(this.pikselLoader);

      const titleInput = document.getElementById('export-input-title') as HTMLInputElement | null;
      const subInput = document.getElementById('export-input-subtitle') as HTMLInputElement | null;
      const ratioSelect = document.getElementById('export-select-ratio') as HTMLSelectElement | null;
      const resSelect = document.getElementById('export-select-resolution') as HTMLSelectElement | null;
      const formatSelect = document.getElementById('export-select-format') as HTMLSelectElement | null;

      const chkNorth = document.getElementById('export-chk-north') as HTMLInputElement | null;
      const chkScale = document.getElementById('export-chk-scale') as HTMLInputElement | null;
      const chkLegend = document.getElementById('export-chk-legend') as HTMLInputElement | null;
      const chkMeta = document.getElementById('export-chk-meta') as HTMLInputElement | null;

      // Aggregate active legend items
      const legendItems: { label: string; color: string }[] = [];
      const pikselProduct = this.pikselLoader?.getActiveProduct();
      if (pikselProduct) {
        legendItems.push({ label: pikselProduct.name, color: '#38bdf8' });
      }
      const customLayers = this.geojsonLoader?.getLayers() || [];
      customLayers.forEach((l) => {
        legendItems.push({ label: l.name, color: l.color || '#a855f7' });
      });

      const options = {
        title: titleInput?.value || 'Digital Earth Indonesia WebGIS',
        subtitle: subInput?.value || undefined,
        aspectRatio: (ratioSelect?.value as any) || 'current',
        resolutionScale: parseInt(resSelect?.value || '1', 10) || 1,
        format: (formatSelect?.value as any) || 'image/png',
        includeNorthArrow: chkNorth ? chkNorth.checked : true,
        includeScaleBar: chkScale ? chkScale.checked : true,
        includeLegend: chkLegend ? chkLegend.checked : true,
        includeMetadata: chkMeta ? chkMeta.checked : true,
        legendItems
      };

      this.mapExporter.exportWithOptions(options, confirmBtn);
      setTimeout(() => closeModal(), 1200);
    });
  }

  public openExportModal() {
    const modal = document.getElementById('modal-map-export');
    if (!modal) return;

    const subInput = document.getElementById('export-input-subtitle') as HTMLInputElement | null;
    if (subInput && !subInput.value.trim()) {
      const activeProduct = this.pikselLoader?.getActiveProduct();
      const year = this.pikselLoader?.getSelectedYear() || '2025';
      if (activeProduct) {
        subInput.value = `${activeProduct.name} (${year}) • OGC WMS (${activeProduct.resolution || '10m'})`;
      }
    }

    modal.style.display = 'flex';
  }

  private handleExport() {
    this.openExportModal();
  }

  private bindCitationEvents() {
    document.querySelectorAll('.btn-copy-citation').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = (btn as HTMLElement).dataset.target;
        if (!targetId) return;
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;
        const text = targetEl.textContent || '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Sitasi berhasil disalin ke papan klip!', 'success');
            announceToScreenReader('Format sitasi berhasil disalin ke papan klip.');
          }).catch(() => {
            prompt('Salin teks sitasi:', text);
          });
        } else {
          prompt('Salin teks sitasi:', text);
        }
      });
    });
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
        showToast('Mode komparasi swipe aktif. Geser pembatas tengah untuk membandingkan.', 'info');
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
    bindItem('more-item-attr-table', () => this.attributeTableUI?.open());
    bindItem('more-item-shortcuts', () => this.shortcutsModalUI?.open());
    bindItem('more-item-export', () => this.handleExport());
  }

  private bindGlobalKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const distBtn = document.getElementById('btn-measure-dist');
        distBtn?.click();
      } else if (key === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.sidebarUI.setActiveTab('map');
        showToast('Mode Inspeksi Titik aktif: klik pada peta untuk memeriksa piksel & koordinat', 'info');
      } else if (key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const dockSwipe = document.getElementById('btn-dock-swipe');
        dockSwipe?.click();
      } else if (key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.attributeTableUI?.toggle();
      } else if (key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.sidebarUI.setActiveTab('map');
      } else if (key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.sidebarUI.setActiveTab('analysis');
      } else if (key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.sidebarUI.setActiveTab('data');
      } else if (key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.sidebarUI.setActiveTab('gee');
      }
    });
  }

  private initServiceWorkerAndOfflineSync() {
    // 1. Offline banner network listener
    const updateOfflineBanner = (online: boolean) => {
      const banner = document.getElementById('offline-banner');
      if (banner) {
        banner.style.display = online ? 'none' : 'flex';
      }
    };

    updateOfflineBanner(navigator.onLine);
    this.errorHandler.onNetworkChange((online) => {
      updateOfflineBanner(online);
      if (online) {
        showToast('Koneksi internet pulih kembali', 'success');
      } else {
        showToast('Mode offline aktif — koneksi internet terputus', 'warning');
      }
    });

    // 2. Service Worker registration for offline shell caching
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            logger.info('[ServiceWorker] Successfully registered with scope:', reg.scope);
          })
          .catch((err) => {
            logger.warn('[ServiceWorker] Registration failed:', err);
          });
      });
    }
  }

  private bindUniversalEscape() {
    setupUniversalEscapeHandler([
      () => {
        // 0. Spatial Attribute Table
        if (this.attributeTableUI?.isVisible()) {
          this.attributeTableUI.close();
          return true;
        }
        return false;
      },
      () => {
        // 1. Command Palette
        if (this.commandPaletteUI?.isPaletteOpen()) {
          this.commandPaletteUI.close();
          return true;
        }
        return false;
      },
      () => {
        // 1b. Modals (Export, GEE Setup, Shortcuts)
        let closed = false;
        ['modal-map-export', 'modal-gee-setup', 'modal-shortcuts'].forEach((id) => {
          const m = document.getElementById(id);
          if (m && m.style.display !== 'none') {
            m.style.display = 'none';
            closed = true;
          }
        });
        if (closed) return true;
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
          showToast('Mode pengukuran dibatalkan', 'info');
          return true;
        }
        return false;
      }
    ]);
  }

  private renderElevationProfileChart(profile: ElevationProfileSummary | null) {
    const profileSection = document.getElementById('measure-elevation-profile');
    if (!profileSection) return;

    if (!profile || !profile.points || profile.points.length < 2) {
      profileSection.style.display = 'none';
      return;
    }

    profileSection.style.display = 'block';

    const minEl = document.getElementById('profile-min-elev');
    const maxEl = document.getElementById('profile-max-elev');
    const gainEl = document.getElementById('profile-gain-elev');
    const lossEl = document.getElementById('profile-loss-elev');
    const badgeEl = document.getElementById('profile-status-badge');

    if (minEl) minEl.innerText = `${profile.minElevation.toLocaleString('id-ID')} mdpl`;
    if (maxEl) maxEl.innerText = `${profile.maxElevation.toLocaleString('id-ID')} mdpl`;
    if (gainEl) gainEl.innerText = `+${profile.totalGain.toLocaleString('id-ID')} m`;
    if (lossEl) lossEl.innerText = `-${profile.totalLoss.toLocaleString('id-ID')} m`;
    if (badgeEl) badgeEl.innerText = `${profile.points.length} Titik DEM`;

    const svg = document.getElementById('measure-elevation-svg') as SVGSVGElement | null;
    const tooltip = document.getElementById('profile-chart-tooltip');
    const container = document.getElementById('measure-elevation-chart-container');
    if (!svg) return;

    const width = 320;
    const height = 120;
    const padL = 34;
    const padR = 12;
    const padT = 14;
    const padB = 22;

    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const minElev = profile.minElevation;
    const maxElev = profile.maxElevation;
    const elevRange = Math.max(10, maxElev - minElev);
    const totalDist = profile.points[profile.points.length - 1].distanceKm || 1;

    // Build SVG path
    const coordsSvg = profile.points.map((pt) => {
      const x = padL + (pt.distanceKm / totalDist) * plotW;
      const y = padT + plotH - ((pt.elevationM - minElev) / elevRange) * plotH;
      return { x, y, pt };
    });

    const linePathD = coordsSvg.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaPathD = `${linePathD} L ${(padL + plotW).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${padL.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    const midElev = Math.round((minElev + maxElev) / 2);

    svg.innerHTML = `
      <defs>
        <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#00f0ff" stop-opacity="0.02"/>
        </linearGradient>
      </defs>

      <!-- Background grid lines -->
      <line x1="${padL}" y1="${padT}" x2="${padL + plotW}" y2="${padT}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2,2"/>
      <line x1="${padL}" y1="${padT + plotH / 2}" x2="${padL + plotW}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="2,2"/>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.15)"/>

      <!-- Y-Axis Labels -->
      <text x="${padL - 4}" y="${padT + 3}" fill="#94a3b8" font-size="8" text-anchor="end">${maxElev}</text>
      <text x="${padL - 4}" y="${padT + plotH / 2 + 3}" fill="#64748b" font-size="8" text-anchor="end">${midElev}</text>
      <text x="${padL - 4}" y="${padT + plotH + 3}" fill="#94a3b8" font-size="8" text-anchor="end">${minElev}</text>

      <!-- X-Axis Labels -->
      <text x="${padL}" y="${height - 6}" fill="#94a3b8" font-size="8" text-anchor="start">0 km</text>
      <text x="${padL + plotW}" y="${height - 6}" fill="#94a3b8" font-size="8" text-anchor="end">${totalDist.toFixed(1)} km</text>

      <!-- Area Fill -->
      <path d="${areaPathD}" fill="url(#elevGrad)"/>

      <!-- Glowing Line -->
      <path d="${linePathD}" fill="none" stroke="#00f0ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Interactive Crosshair Elements -->
      <g id="svg-interactive-cursor" style="display: none;">
        <line id="svg-cursor-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3,2"/>
        <circle id="svg-cursor-dot" cx="0" cy="0" r="4.5" fill="#00f0ff" stroke="#ffffff" stroke-width="1.8"/>
      </g>
    `;

    if (container) {
      const cursorGroup = svg.querySelector('#svg-interactive-cursor') as SVGGElement | null;
      const cursorLine = svg.querySelector('#svg-cursor-line') as SVGLineElement | null;
      const cursorDot = svg.querySelector('#svg-cursor-dot') as SVGCircleElement | null;

      const handleMove = (e: MouseEvent | TouchEvent) => {
        const rect = container.getBoundingClientRect();
        const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const relativeX = clientX - rect.left;
        const scaleX = width / (rect.width || 1);
        const svgX = relativeX * scaleX;

        // Clamp to plot area
        const clampedSvgX = Math.max(padL, Math.min(padL + plotW, svgX));
        const distRatio = (clampedSvgX - padL) / plotW;
        const targetDist = distRatio * totalDist;

        // Find nearest point
        let nearest = coordsSvg[0];
        let minDiff = Infinity;
        for (const item of coordsSvg) {
          const diff = Math.abs(item.pt.distanceKm - targetDist);
          if (diff < minDiff) {
            minDiff = diff;
            nearest = item;
          }
        }

        if (cursorGroup && cursorLine && cursorDot) {
          cursorGroup.style.display = 'block';
          cursorLine.setAttribute('x1', nearest.x.toFixed(1));
          cursorLine.setAttribute('x2', nearest.x.toFixed(1));
          cursorDot.setAttribute('cx', nearest.x.toFixed(1));
          cursorDot.setAttribute('cy', nearest.y.toFixed(1));
        }

        if (tooltip) {
          tooltip.style.display = 'block';
          tooltip.innerHTML = `<strong>${nearest.pt.elevationM.toLocaleString('id-ID')} mdpl</strong> &bull; ${nearest.pt.distanceKm.toFixed(2)} km`;
          const leftPercent = (nearest.x / width) * 100;
          tooltip.style.left = `${Math.max(10, Math.min(90, leftPercent))}%`;
        }

        this.measureTool?.highlightProfileCoordinate(nearest.pt.coord);
      };

      const handleLeave = () => {
        if (cursorGroup) cursorGroup.style.display = 'none';
        if (tooltip) tooltip.style.display = 'none';
        this.measureTool?.highlightProfileCoordinate(null);
      };

      container.onmousemove = handleMove;
      container.ontouchmove = handleMove;
      container.onmouseleave = handleLeave;
      container.ontouchend = handleLeave;
    }
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
