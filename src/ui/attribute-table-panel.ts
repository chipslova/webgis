import * as maplibregl from 'maplibre-gl';
import { GeoJsonLoader, CustomLayerItem } from '../tools/geojson-loader';
import { escapeHtml } from '../utils/sanitize';
import { logger } from '../utils/logger';
import { showToast } from './toast';

export class AttributeTableUI {
  private map: maplibregl.Map;
  private geojsonLoader: GeoJsonLoader;
  private containerEl: HTMLElement | null = null;
  private activeLayerId: string | null = null;
  private searchQuery: string = '';
  private sortColumn: string | null = null;
  private sortAsc: boolean = true;
  private isOpen: boolean = false;
  private isMinimized: boolean = false;
  private highlightMarker: maplibregl.Marker | null = null;

  private onSwitchToDataTabCb: (() => void) | null = null;

  constructor(map: maplibregl.Map, geojsonLoader: GeoJsonLoader) {
    this.map = map;
    this.geojsonLoader = geojsonLoader;
    this.initDOM();
    this.bindEvents();

    this.geojsonLoader.onLayersChange(() => {
      if (this.isOpen) {
        this.render();
      }
    });
  }

  public setOnSwitchToDataTab(cb: () => void) {
    this.onSwitchToDataTabCb = cb;
  }

  private initDOM() {
    let container = document.getElementById('attribute-table-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'attribute-table-container';
      container.className = 'attribute-table-container hidden';
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', 'Spatial Attribute Table');
      document.body.appendChild(container);
    }
    this.containerEl = container;
  }

  public open(layerId?: string) {
    const layers = this.geojsonLoader.getLayers();
    if (layers.length === 0) {
      showToast('No custom vector layers added yet. Opening Data Hub to upload GeoJSON/CSV/KML or load sample data.', 'info', 4000);
      if (this.onSwitchToDataTabCb) {
        this.onSwitchToDataTabCb();
      }
      return;
    }

    this.isOpen = true;
    this.isMinimized = false;
    this.activeLayerId = layerId || this.activeLayerId || layers[0].id;
    this.searchQuery = '';
    this.sortColumn = null;
    this.sortAsc = true;

    if (this.containerEl) {
      this.containerEl.classList.remove('hidden', 'minimized');
    }

    this.render();
  }

  public close() {
    this.isOpen = false;
    if (this.containerEl) {
      this.containerEl.classList.add('hidden');
    }
    this.clearHighlight();
  }

  public toggle(layerId?: string) {
    if (this.isOpen && (!layerId || layerId === this.activeLayerId)) {
      this.close();
    } else {
      this.open(layerId);
    }
  }

  public isVisible(): boolean {
    return this.isOpen;
  }

  private clearHighlight() {
    if (this.highlightMarker) {
      this.highlightMarker.remove();
      this.highlightMarker = null;
    }
  }

  private zoomToFeature(feat: GeoJSON.Feature) {
    if (!feat || !feat.geometry) return;
    this.clearHighlight();

    try {
      const geom = feat.geometry;
      if (geom.type === 'Point') {
        const coords = geom.coordinates as [number, number];
        this.map.flyTo({ center: coords, zoom: 14, essential: true });

        try {
          const el = document.createElement('div');
          el.className = 'feature-highlight-pulse';
          this.highlightMarker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(this.map);
          setTimeout(() => this.clearHighlight(), 5000);
        } catch {
          // Fallback if headless mock map doesn't support DOM markers
        }
      } else if (geom.type === 'LineString' || geom.type === 'Polygon' || geom.type === 'MultiPolygon' || geom.type === 'MultiLineString') {
        const coords: number[][] = [];
        const extractCoords = (c: any) => {
          if (Array.isArray(c) && typeof c[0] === 'number') {
            coords.push(c);
          } else if (Array.isArray(c)) {
            c.forEach(extractCoords);
          }
        };
        extractCoords(geom.coordinates);

        if (coords.length > 0) {
          const bounds = coords.reduce(
            (b, coord) => b.extend(coord as [number, number]),
            new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number])
          );
          this.map.fitBounds(bounds, { padding: 80, maxZoom: 16, essential: true });

          try {
            const center = bounds.getCenter();
            const el = document.createElement('div');
            el.className = 'feature-highlight-pulse';
            this.highlightMarker = new maplibregl.Marker({ element: el })
              .setLngLat(center)
              .addTo(this.map);
            setTimeout(() => this.clearHighlight(), 5000);
          } catch {
            // Fallback if headless mock map doesn't support DOM markers
          }
        }
      }
      showToast('Feature highlighted on map', 'info');
    } catch (err) {
      logger.error('Error zooming to feature:', err);
      showToast('Failed to center on feature geometry', 'error');
    }
  }

  private exportCurrentToCSV(layer: CustomLayerItem, filteredFeatures: GeoJSON.Feature[]) {
    if (filteredFeatures.length === 0) {
      showToast('No feature data to export', 'warning');
      return;
    }

    const allKeys = new Set<string>();
    filteredFeatures.forEach((f) => {
      if (f.properties) {
        Object.keys(f.properties).forEach((k) => allKeys.add(k));
      }
    });

    const headers = Array.from(allKeys);
    const csvRows: string[] = [];

    // Header row
    csvRows.push(['#', ...headers, 'Geometry_Type'].map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

    // Data rows
    filteredFeatures.forEach((f, idx) => {
      const row: string[] = [(idx + 1).toString()];
      headers.forEach((h) => {
        const val = f.properties?.[h];
        if (val === null || val === undefined) {
          row.push('""');
        } else if (typeof val === 'object') {
          row.push(`"${JSON.stringify(val).replace(/"/g, '""')}"`);
        } else {
          row.push(`"${String(val).replace(/"/g, '""')}"`);
        }
      });
      row.push(`"${f.geometry ? f.geometry.type : 'Unknown'}"`);
      csvRows.push(row.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${layer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_attribute_table.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Attribute table downloaded as CSV (${filteredFeatures.length} rows)`, 'success');
  }

  private render() {
    if (!this.containerEl) return;

    const layers = this.geojsonLoader.getLayers();
    if (layers.length === 0) {
      this.close();
      return;
    }

    let currentLayer = layers.find((l) => l.id === this.activeLayerId);
    if (!currentLayer) {
      currentLayer = layers[0];
      this.activeLayerId = currentLayer.id;
    }

    const rawFeatures = currentLayer.data?.features || [];

    // Extract all unique property keys
    const propertyKeysSet = new Set<string>();
    rawFeatures.forEach((f) => {
      if (f.properties) {
        Object.keys(f.properties).forEach((k) => propertyKeysSet.add(k));
      }
    });
    const propertyKeys = Array.from(propertyKeysSet);

    // Filter features by searchQuery
    let filtered = rawFeatures.filter((f) => {
      if (!this.searchQuery.trim()) return true;
      const q = this.searchQuery.toLowerCase();
      if (!f.properties) return false;
      return Object.values(f.properties).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });

    // Sort features if column specified
    if (this.sortColumn) {
      const col = this.sortColumn;
      const asc = this.sortAsc;
      filtered.sort((a, b) => {
        const valA = a.properties?.[col];
        const valB = b.properties?.[col];

        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return asc ? 1 : -1;
        if (valB === undefined || valB === null) return asc ? -1 : 1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return asc ? valA - valB : valB - valA;
        }
        return asc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    // Build Header HTML
    const layerOptionsHtml = layers
      .map(
        (l) =>
          `<option value="${escapeHtml(l.id)}" ${l.id === this.activeLayerId ? 'selected' : ''}>${escapeHtml(l.name)} (${l.featureCount} features)</option>`
      )
      .join('');

    const headersHtml = `
      <th class="col-idx">#</th>
      <th class="col-action">Action</th>
      <th class="col-geom">Geometry</th>
      ${propertyKeys
        .map((k) => {
          const isSorted = this.sortColumn === k;
          const sortIcon = isSorted ? (this.sortAsc ? ' ▲' : ' ▼') : '';
          return `<th class="sortable-th" data-col="${escapeHtml(k)}" title="Click to sort">${escapeHtml(k)}${sortIcon}</th>`;
        })
        .join('')}
    `;

    // Build Rows HTML
    const rowsHtml = filtered
      .map((f, idx) => {
        const geomType = f.geometry ? f.geometry.type : 'N/A';
        const colsHtml = propertyKeys
          .map((k) => {
            const rawVal = f.properties?.[k];
            let displayVal = '-';
            if (rawVal !== undefined && rawVal !== null) {
              displayVal = typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal);
            }
            return `<td title="${escapeHtml(displayVal)}">${escapeHtml(displayVal)}</td>`;
          })
          .join('');

        return `
        <tr data-row-idx="${idx}">
          <td class="col-idx">${idx + 1}</td>
          <td class="col-action">
            <button class="btn-zoom-feature" data-row-idx="${idx}" title="Zoom to this feature on map" aria-label="Zoom to feature">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              <span>Zoom</span>
            </button>
          </td>
          <td class="col-geom"><span class="badge-geom">${escapeHtml(geomType)}</span></td>
          ${colsHtml}
        </tr>
      `;
      })
      .join('');

    this.containerEl.innerHTML = `
      <div class="attr-table-header">
        <div class="attr-table-title-group">
          <div class="attr-table-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="3" y1="15" x2="21" y2="15"></line>
              <line x1="9" y1="3" x2="9" y2="21"></line>
              <line x1="15" y1="3" x2="15" y2="21"></line>
            </svg>
          </div>
          <div class="attr-table-info">
            <h3>Spatial Attribute Table</h3>
            <span class="attr-table-subtitle">Showing ${filtered.length} of ${rawFeatures.length} features</span>
          </div>
          <div class="attr-layer-select-wrap">
            <label for="attr-layer-select" class="sr-only">Select Layer</label>
            <select id="attr-layer-select" class="attr-layer-select" aria-label="Select Active Layer">
              ${layerOptionsHtml}
            </select>
          </div>
        </div>

        <div class="attr-table-controls">
          <div class="attr-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="attr-table-search" placeholder="Search attribute data..." value="${escapeHtml(this.searchQuery)}" aria-label="Search attribute data" />
            ${this.searchQuery ? `<button id="btn-clear-attr-search" class="btn-clear-search" title="Clear search">×</button>` : ''}
          </div>

          <button id="btn-export-attr-csv" class="btn-attr-action" title="Download filtered table as CSV format">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export CSV</span>
          </button>

          <button id="btn-minimize-attr-table" class="btn-attr-icon" title="${this.isMinimized ? 'Expand' : 'Minimize'}" aria-label="Minimize Table">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${this.isMinimized ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
            </svg>
          </button>

          <button id="btn-close-attr-table" class="btn-attr-icon btn-close" title="Close Attribute Table (Esc)" aria-label="Close Attribute Table">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="attr-table-body-wrap">
        ${
          filtered.length === 0
            ? `<div class="attr-table-empty">No features match the search query "${escapeHtml(this.searchQuery)}"</div>`
            : `
          <table class="attr-table">
            <thead>
              <tr>${headersHtml}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        `
        }
      </div>
    `;

    // Bind dynamic elements
    const selectEl = this.containerEl.querySelector<HTMLSelectElement>('#attr-layer-select');
    selectEl?.addEventListener('change', (e) => {
      this.activeLayerId = (e.target as HTMLSelectElement).value;
      this.searchQuery = '';
      this.sortColumn = null;
      this.render();
    });

    const searchInput = this.containerEl.querySelector<HTMLInputElement>('#attr-table-search');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
      // Keep input focused
      const updatedInput = this.containerEl?.querySelector<HTMLInputElement>('#attr-table-search');
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
      }
    });

    const clearSearchBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-clear-attr-search');
    clearSearchBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      this.render();
    });

    const exportBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-export-attr-csv');
    exportBtn?.addEventListener('click', () => {
      if (currentLayer) {
        this.exportCurrentToCSV(currentLayer, filtered);
      }
    });

    const minBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-minimize-attr-table');
    minBtn?.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.containerEl?.classList.toggle('minimized', this.isMinimized);
      this.render();
    });

    const closeBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-close-attr-table');
    closeBtn?.addEventListener('click', () => {
      this.close();
    });

    // Column sorting headers
    const sortHeaders = this.containerEl.querySelectorAll<HTMLElement>('.sortable-th');
    sortHeaders.forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        if (!col) return;
        if (this.sortColumn === col) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortColumn = col;
          this.sortAsc = true;
        }
        this.render();
      });
    });

    // Feature zoom buttons
    const zoomBtns = this.containerEl.querySelectorAll<HTMLButtonElement>('.btn-zoom-feature');
    zoomBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-row-idx'));
        if (!isNaN(idx) && filtered[idx]) {
          this.zoomToFeature(filtered[idx]);
        }
      });
    });
  }

  private bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }
}
