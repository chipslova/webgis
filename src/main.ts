import './style.css';
import { MapManager } from './map/map-manager';
import { SidebarUI } from './ui/sidebar';
import { StatusBarUI } from './ui/status-bar';
import { GeocoderTool, SearchResult } from './tools/geocoder';
import { MeasureTool } from './tools/measure';
import { GeoJsonLoader } from './tools/geojson-loader';
import { GEELoader } from './tools/gee-loader';
import { GEEPanelUI } from './ui/gee-panel';
import { BASEMAPS } from './config/basemaps';

class WebGISApp {
  private mapManager: MapManager;
  private sidebarUI: SidebarUI;
  private statusBarUI: StatusBarUI;
  private geocoderTool: GeocoderTool | null = null;
  private measureTool: MeasureTool | null = null;
  private geojsonLoader: GeoJsonLoader | null = null;
  private geeLoader: GEELoader | null = null;
  private geePanelUI: GEEPanelUI | null = null;

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

    // 3. Initialize MapLibre GL map
    try {
      const map = await this.mapManager.initMap();

      map.on('load', async () => {
        this.geocoderTool = new GeocoderTool(map);
        this.measureTool = new MeasureTool(map);
        this.geojsonLoader = new GeoJsonLoader(map);
        this.geeLoader = new GEELoader(map);
        this.geePanelUI = new GEEPanelUI(this.geeLoader);

        // Load sample cities vector layer & GEE Earth Engine datasets
        this.geojsonLoader.loadSampleData();
        await this.geeLoader.loadGEEDatasets();
        await this.geePanelUI.init();
        this.renderLayersList();

        // Bind measurement callbacks
        this.measureTool.onResult((res) => {
          const card = document.getElementById('measure-result-card');
          const val = document.getElementById('measure-result-value');
          if (card && val) {
            card.style.display = res.text ? 'block' : 'none';
            val.innerText = res.text || '0';
          }
        });
      });
    } catch (err) {
      console.warn('Map initialization notice:', err);
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
        <div class="layer-left">
          <input type="checkbox" id="check-${layer.id}" ${layer.visible ? 'checked' : ''} />
          <span class="legend-symbol" style="background-color: ${layer.color};"></span>
          <span class="layer-title">${layer.name} (${layer.featureCount})</span>
        </div>
        <button class="icon-btn-sm btn-delete-layer" data-id="${layer.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      `;

      // Checkbox toggle
      const check = item.querySelector<HTMLInputElement>(`#check-${layer.id}`);
      if (check) {
        check.addEventListener('change', (e) => {
          this.geojsonLoader?.toggleLayerVisibility(layer.id, (e.target as HTMLInputElement).checked);
        });
      }

      // Delete layer
      const delBtn = item.querySelector<HTMLButtonElement>('.btn-delete-layer');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
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
      fileInput?.click();
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
        const layerId = `custom-${Date.now()}`;
        const name = file.name.replace(/\.[^/.]+$/, '');
        this.geojsonLoader?.addGeoJSONLayer(layerId, name, json, '#10b981');
        this.renderLayersList();
        this.sidebarUI.setActiveTab('layers');
      } catch (err) {
        alert('Invalid GeoJSON file structure');
      }
    };
    reader.readAsText(file);
  }

  private bindExportEvents() {
    const exportBtn = document.getElementById('btn-export-map');
    exportBtn?.addEventListener('click', () => {
      const map = this.mapManager.getMap();
      if (!map) return;

      map.once('render', () => {
        const canvas = map.getCanvas();
        const link = document.createElement('a');
        link.download = `webgis-map-export-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
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
    closeBtn?.addEventListener('click', () => {
      const card = document.getElementById('feature-inspector');
      if (card) card.style.display = 'none';
    });
  }
}

// Start application
new WebGISApp();
