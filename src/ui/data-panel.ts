import { GeoJsonLoader } from '../tools/geojson-loader';
import { SidebarUI } from './sidebar';
import { showToast } from './toast';
import { escapeHtml } from '../utils/sanitize';

export class DataPanelUI {
  private geojsonLoader: GeoJsonLoader;
  private sidebarUI: SidebarUI;
  private onLayerChange: () => void;
  private onOpenAttributeTableCb: ((layerId: string) => void) | null = null;
  private onNavigateToBufferAnalysisCb: ((layerId: string) => void) | null = null;

  constructor(
    geojsonLoader: GeoJsonLoader,
    sidebarUI: SidebarUI,
    onLayerChange: () => void
  ) {
    this.geojsonLoader = geojsonLoader;
    this.sidebarUI = sidebarUI;
    this.onLayerChange = onLayerChange;
    this.bindEvents();
    this.render();

    this.geojsonLoader.onLayersChange(() => {
      this.render();
    });
  }

  public onOpenAttributeTable(cb: (layerId: string) => void) {
    this.onOpenAttributeTableCb = cb;
  }

  public onNavigateToBufferAnalysis(cb: (layerId: string) => void) {
    this.onNavigateToBufferAnalysisCb = cb;
  }

  public render() {
    const list = document.getElementById('layers-list');
    if (!list) return;

    const layers = this.geojsonLoader.getLayers();
    list.innerHTML = '';

    if (layers.length === 0) {
      list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;">Belum ada lapisan vektor kustom. Unggah file GeoJSON/KML atau muat sampel data.</div>';
      return;
    }

    layers.forEach((layer: any) => {
      const item = document.createElement('div');
      item.className = 'layer-card';
      const safeName = escapeHtml(layer.name);
      const layerTypeLabel = layer.type.toUpperCase();

      item.innerHTML = `
        <div class="layer-card-main">
          <div class="layer-card-left">
            <input type="checkbox" id="check-${layer.id}" class="layer-checkbox" ${layer.visible ? 'checked' : ''} aria-label="Toggle layer ${safeName}" />
            <span class="legend-symbol" style="background-color: ${layer.color};"></span>
            <div class="layer-title-group" style="cursor: pointer;" title="Klik untuk zoom ke lapisan">
              <span class="layer-title">${safeName}</span>
              <span class="layer-meta">${layer.featureCount} Fitur · ${layerTypeLabel}</span>
            </div>
          </div>
          <div class="layer-top-actions">
            <button class="icon-btn-sm btn-zoom-layer" data-id="${layer.id}" title="Zoom peta ke lapisan" aria-label="Zoom peta ke ${safeName}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            <button class="icon-btn-sm btn-delete-layer" data-id="${layer.id}" title="Hapus lapisan" aria-label="Hapus lapisan ${safeName}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="layer-card-toolbar">
          <button class="btn-layer-pill btn-open-table" data-id="${layer.id}" title="Buka Tabel Atribut untuk ${safeName}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            <span>Tabel</span>
          </button>
          <button class="btn-layer-pill-ghost btn-buffer-layer" data-id="${layer.id}" title="Buka Analisis Zona Penyangga (Buffer) untuk ${safeName}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
            <span>Buffer</span>
          </button>
          <div class="layer-export-btns">
            <button class="btn-layer-pill-ghost btn-export-layer" data-id="${layer.id}" title="Ekspor lapisan sebagai GeoJSON">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>GeoJSON</span>
            </button>
            <button class="btn-layer-pill-ghost btn-export-kml" data-id="${layer.id}" title="Ekspor lapisan sebagai KML (Google Earth / ArcGIS)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/></svg>
              <span>KML</span>
            </button>
          </div>
        </div>
      `;

      // Checkbox toggle
      const check = item.querySelector<HTMLInputElement>(`#check-${layer.id}`);
      if (check) {
        check.addEventListener('click', (e) => e.stopPropagation());
        check.addEventListener('change', (e) => {
          this.geojsonLoader.toggleLayerVisibility(layer.id, (e.target as HTMLInputElement).checked);
          this.onLayerChange();
        });
      }

      // Open attribute table button
      const tableBtn = item.querySelector<HTMLButtonElement>('.btn-open-table');
      if (tableBtn) {
        tableBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onOpenAttributeTableCb) {
            this.onOpenAttributeTableCb(layer.id);
          }
        });
      }

      // Buffer layer button (navigates seamlessly to unified Spatial Analysis panel)
      const bufferBtn = item.querySelector<HTMLButtonElement>('.btn-buffer-layer');
      if (bufferBtn) {
        bufferBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onNavigateToBufferAnalysisCb) {
            this.onNavigateToBufferAnalysisCb(layer.id);
          }
        });
      }

      // Zoom to layer button
      const zoomBtn = item.querySelector<HTMLButtonElement>('.btn-zoom-layer');
      if (zoomBtn) {
        zoomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.geojsonLoader.zoomToLayer(layer.id);
        });
      }

      // Click title group to zoom
      const titleGroup = item.querySelector<HTMLElement>('.layer-title-group');
      if (titleGroup) {
        titleGroup.addEventListener('click', () => {
          this.geojsonLoader.zoomToLayer(layer.id);
        });
      }

      // Export layer button
      const exportBtn = item.querySelector<HTMLButtonElement>('.btn-export-layer');
      if (exportBtn) {
        exportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const success = this.geojsonLoader.exportLayerGeoJSON(layer.id);
          if (success) {
            showToast(`Lapisan "${layer.name}" berhasil diekspor sebagai GeoJSON!`, 'success');
          } else {
            showToast(`Gagal mengekspor lapisan "${layer.name}".`, 'error');
          }
        });
      }

      // Export KML button
      const exportKmlBtn = item.querySelector<HTMLButtonElement>('.btn-export-kml');
      if (exportKmlBtn) {
        exportKmlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const success = this.geojsonLoader.exportLayerKML(layer.id);
          if (success) {
            showToast(`Lapisan "${layer.name}" berhasil diekspor sebagai KML!`, 'success');
          } else {
            showToast(`Gagal mengekspor KML untuk lapisan "${layer.name}".`, 'error');
          }
        });
      }

      // Delete layer
      const delBtn = item.querySelector<HTMLButtonElement>('.btn-delete-layer');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.geojsonLoader.removeLayer(layer.id);
          this.render();
          this.onLayerChange();
        });
      }

      list.appendChild(item);
    });
  }

  private bindEvents() {
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

    dropzone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
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
      this.geojsonLoader.loadSampleData();
      this.render();
      this.onLayerChange();
    });
  }

  private handleGeoJSONFile(file: File) {
    // 1. File size limit guard (25MB)
    const MAX_SIZE_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      showToast(`Ukuran berkas (${sizeMB} MB) melebihi batas maksimum 25 MB untuk stabilitas peramban.`, 'error', 5000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawText = e.target?.result as string;
        const result = this.geojsonLoader.loadFromFileText(file.name, rawText);
        if (result.success) {
          this.render();
          this.sidebarUI.setActiveTab('data');
          this.onLayerChange();
          const colInfo = result.detectedColumns ? ` [${result.detectedColumns.lat}, ${result.detectedColumns.lon}]` : '';
          showToast(`Lapisan "${file.name}" (${result.featureCount} fitur${colInfo}) berhasil ditambahkan!`, 'success');
        } else {
          showToast(result.error || `Gagal menambahkan lapisan "${file.name}".`, 'error', 5000);
        }
      } catch (err: any) {
        showToast(`Terjadi kesalahan saat memproses berkas: ${err.message || 'Format tidak valid'}`, 'error');
      }
    };
    reader.onerror = () => {
      showToast('Gagal membaca berkas dari sistem lokal.', 'error');
    };
    reader.readAsText(file);
  }
}
