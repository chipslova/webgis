import * as maplibregl from 'maplibre-gl';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { SidebarUI } from './sidebar';
import { showToast } from './toast';
import { escapeHtml } from '../utils/sanitize';
import { TrainingSampler } from '../tools/training-sampler';
import { getColumnMapperModal } from './column-mapper-modal';
import { parseExcelToGeoJSON } from '../utils/excel-parser';
import { parseGeoParquetToGeoJSON } from '../utils/geoparquet-parser';
import { parseCSVToGeoJSON } from '../utils/csv-parser';

export class DataPanelUI {
  private geojsonLoader: GeoJsonLoader;
  private sidebarUI: SidebarUI;
  private onLayerChange: () => void;
  private onOpenAttributeTableCb: ((layerId: string) => void) | null = null;
  private onNavigateToBufferAnalysisCb: ((layerId: string) => void) | null = null;
  private trainingSampler: TrainingSampler;
  private activeSubtab: 'layers' | 'training' = 'layers';

  constructor(
    geojsonLoader: GeoJsonLoader,
    sidebarUI: SidebarUI,
    onLayerChange: () => void,
    map?: maplibregl.Map,
    trainingSampler?: TrainingSampler
  ) {
    this.geojsonLoader = geojsonLoader;
    this.sidebarUI = sidebarUI;
    this.onLayerChange = onLayerChange;
    this.trainingSampler = trainingSampler || new TrainingSampler(map);

    this.bindEvents();
    this.bindTrainingEvents();
    this.render();
    this.renderTrainingUI();

    this.geojsonLoader.onLayersChange(() => {
      this.render();
    });

    this.trainingSampler.onSamplesChange(() => {
      this.renderTrainingUI();
    });
  }

  public getTrainingSampler(): TrainingSampler {
    return this.trainingSampler;
  }

  public getActiveSubtab(): 'layers' | 'training' {
    return this.activeSubtab;
  }

  public onOpenAttributeTable(cb: (layerId: string) => void) {
    this.onOpenAttributeTableCb = cb;
  }

  public onNavigateToBufferAnalysis(cb: (layerId: string) => void) {
    this.onNavigateToBufferAnalysisCb = cb;
  }

  public switchSubtab(subtab: 'layers' | 'training') {
    this.activeSubtab = subtab;
    const btnLayers = document.getElementById('subtab-btn-layers');
    const btnTraining = document.getElementById('subtab-btn-training');
    const contentLayers = document.getElementById('subtab-content-layers');
    const contentTraining = document.getElementById('subtab-content-training');

    if (subtab === 'layers') {
      btnLayers?.classList.add('active');
      btnLayers?.setAttribute('aria-selected', 'true');
      btnTraining?.classList.remove('active');
      btnTraining?.setAttribute('aria-selected', 'false');
      if (contentLayers) contentLayers.style.display = 'block';
      if (contentTraining) contentTraining.style.display = 'none';
    } else {
      btnTraining?.classList.add('active');
      btnTraining?.setAttribute('aria-selected', 'true');
      btnLayers?.classList.remove('active');
      btnLayers?.setAttribute('aria-selected', 'false');
      if (contentLayers) contentLayers.style.display = 'none';
      if (contentTraining) contentTraining.style.display = 'block';
      this.renderTrainingUI();
    }
  }

  public render() {
    const list = document.getElementById('layers-list');
    if (!list) return;

    const layers = this.geojsonLoader.getLayers();
    list.innerHTML = '';

    if (layers.length === 0) {
      list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;">Belum ada lapisan vektor kustom. Unggah file Excel, GeoParquet, Shapefile, CSV, GeoJSON, atau KML.</div>';
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
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

      // Buffer layer button
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

  public renderTrainingUI() {
    const classList = document.getElementById('training-class-list');
    const totalBadge = document.getElementById('training-total-badge');
    const samplesList = document.getElementById('training-samples-list');
    const banner = document.getElementById('sampling-active-banner');
    const toggleBtn = document.getElementById('btn-toggle-sampling-mode');
    const modeLabel = document.getElementById('label-sampling-mode');

    if (!classList) return;

    const classes = this.trainingSampler.getClasses();
    const activeClassId = this.trainingSampler.getActiveClassId();
    const counts = this.trainingSampler.getClassCounts();
    const samples = this.trainingSampler.getSamples();
    const isSampling = this.trainingSampler.getSamplingActive();

    // Update banner & toggle button
    if (banner) {
      banner.style.display = isSampling ? 'flex' : 'none';
    }
    if (toggleBtn && modeLabel) {
      if (isSampling) {
        toggleBtn.style.background = '#eab308';
        toggleBtn.style.color = '#000';
        modeLabel.textContent = 'Nonaktifkan Mode Klik Sampel (Aktif)';
      } else {
        toggleBtn.style.background = '';
        toggleBtn.style.color = '';
        modeLabel.textContent = 'Aktifkan Mode Klik Sampel di Peta';
      }
    }

    if (totalBadge) {
      totalBadge.textContent = `${samples.length} Titik`;
    }

    // Render Class Selection Grid
    classList.innerHTML = classes.map((c) => {
      const isActive = c.id === activeClassId;
      const count = counts[c.id] || 0;
      return `
        <button class="training-class-btn ${isActive ? 'active' : ''}" data-class-id="${c.id}" type="button">
          <span class="training-class-dot" style="background-color: ${c.color};"></span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.name)}</span>
          <span class="training-count-pill">${count}</span>
        </button>
      `;
    }).join('');

    // Bind class click
    classList.querySelectorAll<HTMLButtonElement>('.training-class-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.classId || '1', 10);
        this.trainingSampler.setActiveClass(id);
      });
    });

    // Render Recent Points List
    if (samplesList) {
      if (samples.length === 0) {
        samplesList.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 12px;">Belum ada titik sampel latih. Klik pada peta atau impor dari berkas.</div>';
      } else {
        const recent = [...samples].reverse().slice(0, 15);
        samplesList.innerHTML = recent.map((s) => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.06); font-size: 11px;">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${s.color}; flex-shrink: 0;"></span>
              <span style="font-weight: 600; color: #f1f5f9;">${escapeHtml(s.className)}</span>
              <span style="color: var(--text-muted); font-family: var(--font-mono, monospace); font-size: 10px;">[${s.coordinates[1].toFixed(4)}, ${s.coordinates[0].toFixed(4)}]</span>
            </div>
            <button class="icon-btn-sm btn-delete-sample" data-id="${s.id}" title="Hapus titik ini" style="color: #ef4444; padding: 2px;">
              ✕
            </button>
          </div>
        `).join('');

        samplesList.querySelectorAll<HTMLButtonElement>('.btn-delete-sample').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (id) this.trainingSampler.removeSample(id);
          });
        });
      }
    }
  }

  private bindTrainingEvents() {
    // Sub-tab switching
    const btnLayers = document.getElementById('subtab-btn-layers');
    const btnTraining = document.getElementById('subtab-btn-training');
    btnLayers?.addEventListener('click', () => this.switchSubtab('layers'));
    btnTraining?.addEventListener('click', () => this.switchSubtab('training'));

    // Toggle Sampling Mode
    const toggleBtn = document.getElementById('btn-toggle-sampling-mode');
    toggleBtn?.addEventListener('click', () => {
      const current = this.trainingSampler.getSamplingActive();
      this.trainingSampler.setSamplingActive(!current);
      if (!current) {
        showToast('Mode klik sampel aktif! Klik langsung pada peta untuk merekam titik ground truth.', 'info', 4000);
      }
    });

    // Add Custom Class
    const addClassBtn = document.getElementById('btn-add-custom-class');
    addClassBtn?.addEventListener('click', () => {
      const name = prompt('Masukkan nama kategori kelas tutupan lahan baru (misal: Mangrove / Lahan Basah):');
      if (name && name.trim()) {
        const hue = (this.trainingSampler.getClasses().length * 137.5) % 360;
        const color = `hsl(${Math.round(hue)}, 75%, 50%)`;
        this.trainingSampler.addClass(name.trim(), color);
        showToast(`Kelas "${name.trim()}" berhasil ditambahkan!`, 'success');
      }
    });

    // Export Buttons
    document.getElementById('btn-export-samples-csv')?.addEventListener('click', () => {
      try {
        this.trainingSampler.downloadSamples('csv');
        showToast('Dataset sampel berhasil diunduh dalam format CSV!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Gagal mengekspor CSV', 'error');
      }
    });

    document.getElementById('btn-export-samples-xlsx')?.addEventListener('click', () => {
      try {
        this.trainingSampler.downloadSamples('xlsx');
        showToast('Dataset sampel berhasil diunduh dalam format Excel (.xlsx)!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Gagal mengekspor Excel', 'error');
      }
    });

    document.getElementById('btn-export-samples-geojson')?.addEventListener('click', () => {
      try {
        this.trainingSampler.downloadSamples('geojson');
        showToast('Dataset sampel berhasil diunduh dalam format GeoJSON!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Gagal mengekspor GeoJSON', 'error');
      }
    });

    // Clear Samples
    document.getElementById('btn-clear-all-samples')?.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin menghapus seluruh titik sampel latihan yang telah terkumpul?')) {
        this.trainingSampler.clearSamples();
        showToast('Seluruh titik sampel latihan telah dibersihkan.', 'info');
      }
    });
  }

  private bindEvents() {
    const fileInput = document.getElementById('file-geojson-input') as HTMLInputElement;
    const dropzone = document.getElementById('geojson-dropzone');
    const quickImportBtn = document.getElementById('btn-quick-import');
    const sampleBtn = document.getElementById('btn-load-sample');

    quickImportBtn?.addEventListener('click', () => {
      this.sidebarUI.setActiveTab('data');
      this.switchSubtab('layers');
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
        this.handleUniversalFile(files[0]);
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
        this.handleUniversalFile(e.dataTransfer.files[0]);
      }
    });

    sampleBtn?.addEventListener('click', () => {
      this.geojsonLoader.loadSampleData();
      this.render();
      this.onLayerChange();
    });
  }

  public async handleUniversalFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const isZip = lowerName.endsWith('.zip');
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    const isParquet = lowerName.endsWith('.parquet') || lowerName.endsWith('.geoparquet');
    const isCSV = lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt');

    const MAX_SIZE_BYTES = isZip ? 50 * 1024 * 1024 : 35 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const limitMB = isZip ? 50 : 35;
      showToast(`Ukuran berkas (${sizeMB} MB) melebihi batas maksimum ${limitMB} MB untuk stabilitas peramban.`, 'error', 5000);
      return;
    }

    // 1. Handle ESRI Shapefile .zip
    if (isZip) {
      showToast(`Mengekstrak dan memproses Shapefile "${file.name}"...`, 'info', 3000);
      try {
        const buffer = await file.arrayBuffer();
        const res = await this.geojsonLoader.loadFromZipBuffer(file.name, buffer);
        if (res.success) {
          this.render();
          this.sidebarUI.setActiveTab('data');
          this.switchSubtab('layers');
          this.onLayerChange();
          const countStr = res.layersCreated && res.layersCreated.length > 1
            ? `${res.layersCreated.length} lapisan (${res.totalFeatures} total fitur)`
            : `${res.totalFeatures} fitur`;
          showToast(`Shapefile "${file.name}" berhasil diimpor: ${countStr}!`, 'success', 4500);
        } else {
          showToast(res.error || `Gagal memproses Shapefile "${file.name}".`, 'error', 5000);
        }
      } catch (err: any) {
        showToast(`Gagal membaca berkas Shapefile: ${err.message || 'Format tidak valid'}`, 'error');
      }
      return;
    }

    // 2. Handle Excel (.xlsx, .xls)
    if (isExcel) {
      showToast(`Membaca spreadsheet Excel "${file.name}"...`, 'info', 2500);
      try {
        const buffer = await file.arrayBuffer();
        const initialRes = parseExcelToGeoJSON(buffer);

        if (initialRes.needsMapping) {
          // Open interactive column mapper modal
          getColumnMapperModal().show({
            fileName: file.name,
            fileType: 'excel',
            totalRows: initialRes.totalRows,
            columns: initialRes.columns,
            previewRows: initialRes.previewRows,
            detectedLatCol: initialRes.detectedColumns?.lat,
            detectedLonCol: initialRes.detectedColumns?.lon,
            detectedClassCol: initialRes.detectedColumns?.classCol,
            sheets: initialRes.sheets,
            selectedSheet: initialRes.selectedSheet,
            onConfirm: (mapped) => {
              const mappedRes = parseExcelToGeoJSON(buffer, {
                sheetName: mapped.sheetName,
                latCol: mapped.latCol,
                lonCol: mapped.lonCol,
                classCol: mapped.classCol,
                targetCrs: mapped.targetCrs
              });

              if (!mappedRes.success || !mappedRes.data) {
                showToast(mappedRes.error || 'Gagal memproses data dengan pemetaan kolom yang dipilih.', 'error');
                return;
              }

              if (mapped.isTrainingSample) {
                const count = this.trainingSampler.importFromFeatureCollection(mappedRes.data, mapped.classCol);
                this.switchSubtab('training');
                showToast(`${count} titik dari Excel "${file.name}" berhasil diimpor sebagai Sampel Latih Ground Truth!`, 'success', 4500);
              } else {
                this.geojsonLoader.loadFromExcelBuffer(file.name, buffer, mapped);
                this.render();
                this.onLayerChange();
                showToast(`Lapisan Excel "${file.name}" (${mappedRes.importedCount} titik) berhasil ditambahkan!`, 'success');
              }
            }
          });
          return;
        }

        if (initialRes.success && initialRes.data) {
          const loadRes = this.geojsonLoader.loadFromExcelBuffer(file.name, buffer);
          if (loadRes.success) {
            this.render();
            this.sidebarUI.setActiveTab('data');
            this.switchSubtab('layers');
            this.onLayerChange();
            showToast(`Lapisan Excel "${file.name}" (${loadRes.importedCount} titik) berhasil dimuat!`, 'success');
          } else {
            showToast(loadRes.error || 'Gagal memuat layer Excel ke peta.', 'error');
          }
        } else {
          showToast(initialRes.error || 'Gagal memproses berkas Excel.', 'error');
        }
      } catch (err: any) {
        showToast(`Gagal membaca berkas Excel: ${err?.message || err}`, 'error');
      }
      return;
    }

    // 3. Handle GeoParquet (.parquet, .geoparquet)
    if (isParquet) {
      showToast(`Membaca dataset GeoParquet "${file.name}"...`, 'info', 2500);
      try {
        const buffer = await file.arrayBuffer();
        const initialRes = await parseGeoParquetToGeoJSON(buffer);

        if (initialRes.needsMapping) {
          getColumnMapperModal().show({
            fileName: file.name,
            fileType: 'parquet',
            totalRows: initialRes.totalRows,
            columns: initialRes.columns,
            previewRows: initialRes.previewRows,
            detectedLatCol: initialRes.detectedColumns?.lat,
            detectedLonCol: initialRes.detectedColumns?.lon,
            detectedClassCol: initialRes.detectedColumns?.classCol,
            onConfirm: async (mapped) => {
              const mappedRes = await parseGeoParquetToGeoJSON(buffer, {
                latCol: mapped.latCol,
                lonCol: mapped.lonCol,
                classCol: mapped.classCol,
                targetCrs: mapped.targetCrs
              });

              if (!mappedRes.success || !mappedRes.data) {
                showToast(mappedRes.error || 'Gagal memproses GeoParquet dengan pemetaan tersebut.', 'error');
                return;
              }

              if (mapped.isTrainingSample) {
                const count = this.trainingSampler.importFromFeatureCollection(mappedRes.data, mapped.classCol);
                this.switchSubtab('training');
                showToast(`${count} titik dari GeoParquet "${file.name}" berhasil diimpor sebagai Sampel Latih!`, 'success', 4500);
              } else {
                await this.geojsonLoader.loadFromParquetBuffer(file.name, buffer, mapped);
                this.render();
                this.onLayerChange();
                showToast(`Lapisan GeoParquet "${file.name}" (${mappedRes.importedCount} fitur) berhasil dimuat!`, 'success');
              }
            }
          });
          return;
        }

        if (initialRes.success && initialRes.data) {
          const loadRes = await this.geojsonLoader.loadFromParquetBuffer(file.name, buffer);
          if (loadRes.success) {
            this.render();
            this.sidebarUI.setActiveTab('data');
            this.switchSubtab('layers');
            this.onLayerChange();
            showToast(`Lapisan GeoParquet "${file.name}" (${loadRes.importedCount} fitur) berhasil dimuat!`, 'success');
          } else {
            showToast(loadRes.error || 'Gagal memuat layer GeoParquet ke peta.', 'error');
          }
        } else {
          showToast(initialRes.error || 'Gagal memproses berkas GeoParquet.', 'error');
        }
      } catch (err: any) {
        showToast(`Gagal membaca berkas GeoParquet: ${err?.message || err}`, 'error');
      }
      return;
    }

    // 4. Handle CSV / TSV with smart fallback to column mapper
    if (isCSV) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rawText = e.target?.result as string;
          const csvRes = parseCSVToGeoJSON(rawText);

          if (!csvRes.success || !csvRes.data) {
            // Unrecognized lat/lon headers -> show column mapper
            const firstLine = rawText.trim().split(/\r?\n/)[0] || '';
            const rawCols = firstLine.split(/[,;\t|]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
            const rowsPreview = rawText.trim().split(/\r?\n/).slice(1, 4).map((line) => {
              const cells = line.split(/[,;\t|]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
              const obj: Record<string, any> = {};
              rawCols.forEach((col, idx) => {
                obj[col] = cells[idx] || '';
              });
              return obj;
            });

            getColumnMapperModal().show({
              fileName: file.name,
              fileType: 'csv',
              totalRows: rawText.trim().split(/\r?\n/).length - 1,
              columns: rawCols,
              previewRows: rowsPreview,
              detectedLatCol: csvRes.detectedColumns?.lat,
              detectedLonCol: csvRes.detectedColumns?.lon,
              onConfirm: (mapped) => {
                const customCsvRes = parseCSVToGeoJSON(rawText, {
                  latCol: mapped.latCol,
                  lonCol: mapped.lonCol
                });

                if (!customCsvRes.success || !customCsvRes.data) {
                  showToast(customCsvRes.error || 'Gagal memproses CSV dengan pemetaan tersebut.', 'error');
                  return;
                }

                if (mapped.isTrainingSample) {
                  const count = this.trainingSampler.importFromFeatureCollection(customCsvRes.data, mapped.classCol);
                  this.switchSubtab('training');
                  showToast(`${count} titik dari CSV "${file.name}" berhasil diimpor sebagai Sampel Latih!`, 'success', 4500);
                } else {
                  const layerName = file.name.replace(/\.[^/.]+$/, '').trim();
                  const layerId = `layer-csv-${Date.now()}`;
                  this.geojsonLoader.addGeoJSONLayer(layerId, layerName, customCsvRes.data, '#3b82f6');
                  this.geojsonLoader.zoomToLayer(layerId);
                  this.render();
                  this.onLayerChange();
                  showToast(`Lapisan CSV "${file.name}" (${customCsvRes.importedCount} titik) berhasil ditambahkan!`, 'success');
                }
              }
            });
            return;
          }

          // CSV auto-detected successfully
          const result = this.geojsonLoader.loadFromFileText(file.name, rawText);
          if (result.success) {
            this.render();
            this.sidebarUI.setActiveTab('data');
            this.switchSubtab('layers');
            this.onLayerChange();
            const colInfo = result.detectedColumns ? ` [${result.detectedColumns.lat}, ${result.detectedColumns.lon}]` : '';
            showToast(`Lapisan "${file.name}" (${result.featureCount} fitur${colInfo}) berhasil ditambahkan!`, 'success');
          } else {
            showToast(result.error || `Gagal menambahkan lapisan "${file.name}".`, 'error', 5000);
          }
        } catch (err: any) {
          showToast(`Terjadi kesalahan saat memproses CSV: ${err.message || 'Format tidak valid'}`, 'error');
        }
      };
      reader.readAsText(file);
      return;
    }

    // 5. Default: GeoJSON, JSON, KML
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawText = e.target?.result as string;
        const result = this.geojsonLoader.loadFromFileText(file.name, rawText);
        if (result.success) {
          this.render();
          this.sidebarUI.setActiveTab('data');
          this.switchSubtab('layers');
          this.onLayerChange();
          showToast(`Lapisan "${file.name}" (${result.featureCount} fitur) berhasil ditambahkan!`, 'success');
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
