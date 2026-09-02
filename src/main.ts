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
    this.bindExportEvents();
    this.bindInspectorEvents();

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

      // Auto-enforce layer ordering on any layer state changes across all tools
      this.pikselLoader.onLayersChange(() => this.mapManager.enforceLayerOrder());
      this.geeLoader.onLayersChange(() => this.mapManager.enforceLayerOrder());
      this.geojsonLoader.onLayersChange(() => this.mapManager.enforceLayerOrder());

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

      // Enforce strict layer order on initial load
      this.mapManager.enforceLayerOrder();

      // Bind measurement callbacks
      this.measureTool.onResult((res) => {
        const card = document.getElementById('measure-result-card');
        const val = document.getElementById('measure-result-value');
        if (card && val) {
          card.style.display = res.text ? 'block' : 'none';
          val.innerText = res.text || '0';
        }
        this.mapManager.enforceLayerOrder();
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

      // 6. Hide feature inspector
      const inspector = document.getElementById('feature-inspector');
      if (inspector) inspector.style.display = 'none';

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
      list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px;">No active custom vector layers</div>';
      return;
    }

    layers.forEach((layer) => {
      const item = document.createElement('div');
      item.className = 'layer-item';
      item.innerHTML = `
        <div class="layer-left" style="cursor: pointer;" title="Click to zoom to layer">
          <input type="checkbox" id="check-${layer.id}" ${layer.visible ? 'checked' : ''} />
          <span class="legend-symbol" style="background-color: ${layer.color};"></span>
          <span class="layer-title">${layer.name} (${layer.featureCount})</span>
        </div>
        <div class="layer-actions" style="display: flex; gap: 4px; align-items: center;">
          <button class="icon-btn-sm btn-zoom-layer" data-id="${layer.id}" title="Zoom to layer extent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
          <button class="icon-btn-sm btn-delete-layer" data-id="${layer.id}" title="Delete layer">
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
      dropdown.innerHTML = '<div class="search-result-item" style="color: var(--text-muted);">No locations found</div>';
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

    distBtn?.addEventListener('click', () => {
      if (!this.measureTool) return;
      const current = this.measureTool.getMode();
      this.measureTool.setMode(current === 'distance' ? 'none' : 'distance');
      distBtn.classList.toggle('active', this.measureTool.getMode() === 'distance');
      areaBtn?.classList.remove('active');
    });

    areaBtn?.addEventListener('click', () => {
      if (!this.measureTool) return;
      const current = this.measureTool.getMode();
      this.measureTool.setMode(current === 'area' ? 'none' : 'area');
      areaBtn.classList.toggle('active', this.measureTool.getMode() === 'area');
      distBtn?.classList.remove('active');
    });

    clearBtn?.addEventListener('click', () => {
      this.measureTool?.clear();
      distBtn?.classList.remove('active');
      areaBtn?.classList.remove('active');
      const card = document.getElementById('measure-result-card');
      if (card) card.style.display = 'none';
    });
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
          const canvas = map.getCanvas();
          const link = document.createElement('a');
          link.download = `webgis-indonesia-map-${Date.now()}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          showToast('Peta berhasil diekspor sebagai gambar PNG!', 'success');
        } catch (e) {
          showToast('Gagal mengekspor peta ke format gambar.', 'error');
        } finally {
          setTimeout(() => {
            exportBtn.innerHTML = originalHtml;
            (exportBtn as HTMLButtonElement).disabled = false;
          }, 1200);
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
