import * as maplibregl from 'maplibre-gl';
import { GeoJsonLoader, CustomLayerItem } from '../tools/geojson-loader';
import { escapeHtml } from '../utils/sanitize';
import { logger } from '../utils/logger';
import { showToast } from './toast';

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'not_empty';

export interface AttributeFilter {
  field: string;
  operator: FilterOperator;
  value: string;
}

/** Pure expression parser: recognizes query syntax like "populasi > 500000" or "kategori = 'Kota'" */
export function parseExpressionQuery(query: string, availableFields: string[]): AttributeFilter | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const regex = /^([a-zA-Z0-9_\-]+)\s*(>=|<=|!=|==|=|~>|>|<|contains|mengandung)\s*(.*)$/i;
  const match = trimmed.match(regex);
  if (match) {
    const rawField = match[1];
    const rawOp = match[2].toLowerCase();
    let rawVal = match[3].trim();

    // Strip optional surrounding quotes
    if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
      rawVal = rawVal.slice(1, -1);
    }

    const matchedField = availableFields.find((f) => f.toLowerCase() === rawField.toLowerCase());
    if (matchedField) {
      let op: FilterOperator = 'contains';
      if (rawOp === '>' || rawOp === '~>') op = 'gt';
      else if (rawOp === '>=') op = 'gte';
      else if (rawOp === '<') op = 'lt';
      else if (rawOp === '<=') op = 'lte';
      else if (rawOp === '=' || rawOp === '==') op = 'equals';
      else if (rawOp === '!=') op = 'not_equals';
      else if (rawOp === 'contains' || rawOp === 'mengandung') op = 'contains';

      return {
        field: matchedField,
        operator: op,
        value: rawVal
      };
    }
  }

  return null;
}

/** Pure feature filter evaluator */
export function evaluateFeatureWithFilter(
  feature: GeoJSON.Feature,
  filter: AttributeFilter | null,
  rawSearchQuery: string
): boolean {
  if (!feature.properties) return false;

  // 1. If explicit filter rule is active
  if (filter) {
    const { field, operator, value } = filter;

    if (field === 'all') {
      if (operator === 'is_empty') {
        return Object.values(feature.properties).every((v) => v === null || v === undefined || v === '');
      }
      if (operator === 'not_empty') {
        return Object.values(feature.properties).some((v) => v !== null && v !== undefined && v !== '');
      }
      const q = value.toLowerCase();
      return Object.values(feature.properties).some((v) => {
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(q);
      });
    }

    const propVal = feature.properties[field];

    if (operator === 'is_empty') {
      return propVal === null || propVal === undefined || propVal === '';
    }
    if (operator === 'not_empty') {
      return propVal !== null && propVal !== undefined && propVal !== '';
    }

    if (propVal === null || propVal === undefined) {
      return false;
    }

    const numProp = Number(propVal);
    const numTarget = Number(value);
    const isBothNumeric = !isNaN(numProp) && !isNaN(numTarget) && value.trim() !== '';

    switch (operator) {
      case 'gt':
        return isBothNumeric ? numProp > numTarget : String(propVal) > value;
      case 'gte':
        return isBothNumeric ? numProp >= numTarget : String(propVal) >= value;
      case 'lt':
        return isBothNumeric ? numProp < numTarget : String(propVal) < value;
      case 'lte':
        return isBothNumeric ? numProp <= numTarget : String(propVal) <= value;
      case 'equals':
        if (isBothNumeric) return numProp === numTarget;
        return String(propVal).toLowerCase() === value.toLowerCase();
      case 'not_equals':
        if (isBothNumeric) return numProp !== numTarget;
        return String(propVal).toLowerCase() !== value.toLowerCase();
      case 'contains':
      default:
        return String(propVal).toLowerCase().includes(value.toLowerCase());
    }
  }

  // 2. Fallback to basic text search across all properties
  if (rawSearchQuery.trim()) {
    const q = rawSearchQuery.toLowerCase();
    return Object.values(feature.properties).some((val) => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(q);
    });
  }

  return true;
}

export class AttributeTableUI {
  private map: maplibregl.Map;
  private geojsonLoader: GeoJsonLoader;
  private containerEl: HTMLElement | null = null;
  private activeLayerId: string | null = null;
  private searchQuery: string = '';
  private activeFilter: AttributeFilter | null = null;
  private isFilterBuilderOpen: boolean = false;
  private sortColumn: string | null = null;
  private sortAsc: boolean = true;
  private isOpen: boolean = false;
  private isMinimized: boolean = false;
  private highlightMarker: maplibregl.Marker | null = null;
  private bulkMarkers: maplibregl.Marker[] = [];

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
      showToast('Belum ada lapisan vektor kustom. Buka tab Data untuk mengunggah GeoJSON/CSV/KML atau muat sampel data.', 'info', 4000);
      if (this.onSwitchToDataTabCb) {
        this.onSwitchToDataTabCb();
      }
      return;
    }

    this.isOpen = true;
    this.isMinimized = false;
    this.activeLayerId = layerId || this.activeLayerId || layers[0].id;
    this.searchQuery = '';
    this.activeFilter = null;
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

  public setFilter(filter: AttributeFilter | null) {
    this.activeFilter = filter;
    this.render();
  }

  public getFilter(): AttributeFilter | null {
    return this.activeFilter;
  }

  private clearHighlight() {
    if (this.highlightMarker) {
      try {
        this.highlightMarker.remove();
      } catch {}
      this.highlightMarker = null;
    }
    this.bulkMarkers.forEach((m) => {
      try {
        m.remove();
      } catch {}
    });
    this.bulkMarkers = [];
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
          // Fallback
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
            // Fallback
          }
        }
      }
      showToast('Objek/fitur disorot pada peta', 'info');
    } catch (err) {
      logger.error('Error zooming to feature:', err);
      showToast('Gagal memusatkan peta ke geometri fitur', 'error');
    }
  }

  /** Zoom and fit map to all currently filtered features */
  public zoomToAllFeatures(features: GeoJSON.Feature[]) {
    if (!features || features.length === 0) {
      showToast('Tidak ada fitur hasil filter untuk disorot', 'warning');
      return;
    }

    this.clearHighlight();

    try {
      const allCoords: [number, number][] = [];
      const extractCoords = (c: any) => {
        if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
          allCoords.push([c[0], c[1]]);
        } else if (Array.isArray(c)) {
          c.forEach(extractCoords);
        }
      };

      features.forEach((f) => {
        if (f.geometry) {
          extractCoords(f.geometry.coordinates);
        }
      });

      if (allCoords.length === 0) {
        showToast('Geometri fitur tidak valid', 'warning');
        return;
      }

      const bounds = allCoords.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(allCoords[0], allCoords[0])
      );

      this.map.fitBounds(bounds, { padding: 70, maxZoom: 15, essential: true });

      // Add temporary highlight markers for point features (up to 20 points)
      features.slice(0, 20).forEach((f) => {
        if (f.geometry && f.geometry.type === 'Point') {
          try {
            const el = document.createElement('div');
            el.className = 'feature-highlight-pulse';
            const m = new maplibregl.Marker({ element: el })
              .setLngLat(f.geometry.coordinates as [number, number])
              .addTo(this.map);
            this.bulkMarkers.push(m);
          } catch {}
        }
      });

      if (this.bulkMarkers.length > 0) {
        setTimeout(() => this.clearHighlight(), 5000);
      }

      showToast(`Memusatkan peta ke ${features.length} fitur hasil filter`, 'success');
    } catch (e) {
      logger.error('Error fitting bounds to all features:', e);
      showToast('Gagal memusatkan peta ke hasil filter', 'error');
    }
  }

  private exportCurrentToCSV(layer: CustomLayerItem, filteredFeatures: GeoJSON.Feature[]) {
    if (filteredFeatures.length === 0) {
      showToast('Tidak ada data fitur untuk diekspor', 'warning');
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
    showToast(`Tabel atribut berhasil diunduh sebagai CSV (${filteredFeatures.length} baris)`, 'success');
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

    // Auto-detect expression if typed in the search bar (e.g. "populasi > 500000")
    let effectiveFilter = this.activeFilter;
    if (!effectiveFilter && this.searchQuery.trim()) {
      const parsed = parseExpressionQuery(this.searchQuery, propertyKeys);
      if (parsed) {
        effectiveFilter = parsed;
      }
    }

    // Filter features
    let filtered = rawFeatures.filter((f) => {
      return evaluateFeatureWithFilter(f, effectiveFilter, this.searchQuery);
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
          `<option value="${escapeHtml(l.id)}" ${l.id === this.activeLayerId ? 'selected' : ''}>${escapeHtml(l.name)} (${l.featureCount} fitur)</option>`
      )
      .join('');

    const headersHtml = `
      <th class="col-idx">#</th>
      <th class="col-action">Aksi</th>
      <th class="col-geom">Geometri</th>
      ${propertyKeys
        .map((k) => {
          const isSorted = this.sortColumn === k;
          const sortIcon = isSorted ? (this.sortAsc ? ' ▲' : ' ▼') : '';
          return `<th class="sortable-th" data-col="${escapeHtml(k)}" title="Klik untuk mengurutkan">${escapeHtml(k)}${sortIcon}</th>`;
        })
        .join('')}
    `;

    // Filter builder field options
    const filterFieldOptionsHtml = `
      <option value="all" ${!this.activeFilter || this.activeFilter.field === 'all' ? 'selected' : ''}>Semua Kolom (Global)</option>
      ${propertyKeys
        .map(
          (k) =>
            `<option value="${escapeHtml(k)}" ${this.activeFilter?.field === k ? 'selected' : ''}>${escapeHtml(k)}</option>`
        )
        .join('')}
    `;

    const operatorOptionsHtml = `
      <option value="contains" ${this.activeFilter?.operator === 'contains' ? 'selected' : ''}>Mengandung (contains)</option>
      <option value="equals" ${this.activeFilter?.operator === 'equals' ? 'selected' : ''}>Sama dengan (=)</option>
      <option value="not_equals" ${this.activeFilter?.operator === 'not_equals' ? 'selected' : ''}>Tidak sama (!=)</option>
      <option value="gt" ${this.activeFilter?.operator === 'gt' ? 'selected' : ''}>Lebih besar (&gt;)</option>
      <option value="gte" ${this.activeFilter?.operator === 'gte' ? 'selected' : ''}>Lebih besar / sama (&gt;=)</option>
      <option value="lt" ${this.activeFilter?.operator === 'lt' ? 'selected' : ''}>Lebih kecil (&lt;)</option>
      <option value="lte" ${this.activeFilter?.operator === 'lte' ? 'selected' : ''}>Lebih kecil / sama (&lt;=)</option>
      <option value="is_empty" ${this.activeFilter?.operator === 'is_empty' ? 'selected' : ''}>Kosong (is empty)</option>
      <option value="not_empty" ${this.activeFilter?.operator === 'not_empty' ? 'selected' : ''}>Terisi (not empty)</option>
    `;

    // Active Filter Pill
    const activeFilterPillHtml = effectiveFilter
      ? `
      <div class="attr-active-filter-badge">
        <span class="filter-badge-label">Filter: <strong>${escapeHtml(effectiveFilter.field)} ${escapeHtml(effectiveFilter.operator)} ${escapeHtml(effectiveFilter.value || '')}</strong></span>
        <button id="btn-clear-active-filter" class="btn-clear-filter-pill" title="Hapus filter ekspresi">&times;</button>
      </div>
    `
      : '';

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
            <button class="btn-zoom-feature" data-row-idx="${idx}" title="Zoom ke fitur ini pada peta" aria-label="Zoom to feature">
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
            <h3>Tabel Atribut Spasial <span style="font-size: 11px; opacity: 0.7; font-weight: normal;">(Spatial Attribute Table)</span></h3>
            <span class="attr-table-subtitle">Menampilkan ${filtered.length} dari ${rawFeatures.length} fitur</span>
          </div>
          <div class="attr-layer-select-wrap">
            <label for="attr-layer-select" class="sr-only">Pilih Lapisan</label>
            <select id="attr-layer-select" class="attr-layer-select" aria-label="Pilih Lapisan Aktif">
              ${layerOptionsHtml}
            </select>
          </div>
          ${activeFilterPillHtml}
        </div>

        <div class="attr-table-controls">
          <div class="attr-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="attr-table-search" placeholder="Cari teks atau ekspresi (mis: populasi > 500k)..." value="${escapeHtml(this.searchQuery)}" aria-label="Cari data atribut atau kueri ekspresi" />
            ${this.searchQuery ? `<button id="btn-clear-attr-search" class="btn-clear-search" title="Bersihkan pencarian">×</button>` : ''}
          </div>

          <button id="btn-toggle-filter-builder" class="btn-attr-action ${this.isFilterBuilderOpen ? 'active' : ''}" title="Buka panel pembuat kueri ekspresi terstruktur">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <span>Filter Kueri</span>
          </button>

          <button id="btn-zoom-all-filtered" class="btn-attr-action" title="Sorot dan pusatkan seluruh fitur hasil filter pada peta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"></path>
              <line x1="8" y1="2" x2="8" y2="18"></line>
              <line x1="16" y1="6" x2="16" y2="22"></line>
            </svg>
            <span>Sorot di Peta (${filtered.length})</span>
          </button>

          <button id="btn-export-attr-csv" class="btn-attr-action" title="Unduh tabel hasil filter sebagai format CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Ekspor CSV</span>
          </button>

          <button id="btn-minimize-attr-table" class="btn-attr-icon" title="${this.isMinimized ? 'Perbesar' : 'Kecilkan'}" aria-label="Kecilkan Tabel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${this.isMinimized ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
            </svg>
          </button>

          <button id="btn-close-attr-table" class="btn-attr-icon btn-close" title="Tutup Tabel Atribut (Esc)" aria-label="Tutup Tabel Atribut">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Structured Filter Builder Row -->
      <div id="attr-filter-builder-bar" class="attr-filter-builder-bar" style="display: ${this.isFilterBuilderOpen ? 'flex' : 'none'};">
        <div class="filter-builder-label">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <span>Kueri Ekspresi:</span>
        </div>
        <div class="filter-builder-controls">
          <select id="attr-filter-field" class="attr-filter-select" aria-label="Pilih kolom filter">
            ${filterFieldOptionsHtml}
          </select>
          <select id="attr-filter-operator" class="attr-filter-select" aria-label="Pilih operator filter">
            ${operatorOptionsHtml}
          </select>
          <input type="text" id="attr-filter-value" class="attr-filter-input" placeholder="Nilai target..." value="${escapeHtml(this.activeFilter?.value || '')}" aria-label="Nilai target filter" />
          <button id="btn-apply-filter-builder" class="btn-attr-action btn-apply-filter">Terapkan Filter</button>
          <button id="btn-reset-filter-builder" class="btn-attr-icon" title="Reset filter ekspresi">Reset</button>
        </div>
      </div>

      <div class="attr-table-body-wrap">
        ${
          filtered.length === 0
            ? `<div class="attr-table-empty">Tidak ada fitur yang cocok dengan filter / kueri pencarian aktif</div>`
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
      this.activeFilter = null;
      this.sortColumn = null;
      this.render();
    });

    const searchInput = this.containerEl.querySelector<HTMLInputElement>('#attr-table-search');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
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

    const clearFilterPillBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-clear-active-filter');
    clearFilterPillBtn?.addEventListener('click', () => {
      this.activeFilter = null;
      this.searchQuery = '';
      this.render();
    });

    const toggleFilterBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-toggle-filter-builder');
    toggleFilterBtn?.addEventListener('click', () => {
      this.isFilterBuilderOpen = !this.isFilterBuilderOpen;
      this.render();
    });

    const applyFilterBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-apply-filter-builder');
    applyFilterBtn?.addEventListener('click', () => {
      const fieldEl = this.containerEl?.querySelector<HTMLSelectElement>('#attr-filter-field');
      const opEl = this.containerEl?.querySelector<HTMLSelectElement>('#attr-filter-operator');
      const valEl = this.containerEl?.querySelector<HTMLInputElement>('#attr-filter-value');

      if (fieldEl && opEl) {
        this.activeFilter = {
          field: fieldEl.value,
          operator: opEl.value as FilterOperator,
          value: valEl?.value.trim() || ''
        };
        this.render();
        showToast(`Filter ekspresi diterapkan: ${this.activeFilter.field} ${this.activeFilter.operator} ${this.activeFilter.value}`, 'info');
      }
    });

    const resetFilterBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-reset-filter-builder');
    resetFilterBtn?.addEventListener('click', () => {
      this.activeFilter = null;
      this.searchQuery = '';
      this.render();
      showToast('Filter ekspresi dikembalikan ke semula', 'info');
    });

    const zoomAllBtn = this.containerEl.querySelector<HTMLButtonElement>('#btn-zoom-all-filtered');
    zoomAllBtn?.addEventListener('click', () => {
      this.zoomToAllFeatures(filtered);
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
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    }
  }
}

