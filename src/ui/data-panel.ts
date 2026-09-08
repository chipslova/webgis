import { GeoJsonLoader } from '../tools/geojson-loader';
import { SidebarUI } from './sidebar';
import { showToast } from './toast';

export class DataPanelUI {
  private geojsonLoader: GeoJsonLoader;
  private sidebarUI: SidebarUI;
  private onLayerChange: () => void;

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
  }

  public render() {
    const list = document.getElementById('layers-list');
    if (!list) return;

    const layers = this.geojsonLoader.getLayers();
    list.innerHTML = '';

    if (layers.length === 0) {
      list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;">Belum ada layer vektor kustom. Unggah file GeoJSON atau muat data sampel.</div>';
      return;
    }

    layers.forEach((layer: any) => {
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
          this.geojsonLoader.toggleLayerVisibility(layer.id, (e.target as HTMLInputElement).checked);
          this.onLayerChange();
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

      // Click title to zoom
      const titleEl = item.querySelector<HTMLElement>('.layer-title');
      if (titleEl) {
        titleEl.addEventListener('click', () => {
          this.geojsonLoader.zoomToLayer(layer.id);
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
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as GeoJSON.FeatureCollection;
        if (!json || (!json.type && !Array.isArray((json as any).features))) {
          throw new Error('Invalid GeoJSON');
        }
        const layerId = `custom-${Date.now()}`;
        const name = file.name.replace(/\.[^/.]+$/, '');
        this.geojsonLoader.addGeoJSONLayer(layerId, name, json, '#10b981');
        this.render();
        this.sidebarUI.setActiveTab('data');
        this.onLayerChange();
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
}
