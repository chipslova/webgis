import { GeoJsonLoader } from '../tools/geojson-loader';
import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';

export class BufferAnalysisUI {
  private geojsonLoader: GeoJsonLoader;
  private onBufferCreatedCallback?: () => void;
  private lastIntersectedGeoJSON: GeoJSON.FeatureCollection | null = null;
  private selectedColor: string = '#8b5cf6';
  private selectedOpacity: number = 0.45;

  constructor(geojsonLoader: GeoJsonLoader, onBufferCreated?: () => void) {
    this.geojsonLoader = geojsonLoader;
    this.onBufferCreatedCallback = onBufferCreated;
  }

  public init() {
    this.bindEvents();
    this.updateLayerSelect();
  }

  public updateLayerSelect() {
    const select = document.getElementById('buffer-layer-select') as HTMLSelectElement | null;
    const overlaySelect = document.getElementById('buffer-overlay-select') as HTMLSelectElement | null;
    if (!select) return;

    const layers = this.geojsonLoader.getLayers();
    select.innerHTML = '';

    if (overlaySelect) {
      overlaySelect.innerHTML = '<option value="" selected>-- Tanpa Intersection (Hanya Poligon Buffer) --</option>';
    }

    if (layers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = 'Belum ada lapisan vektor (Upload file di tab Data)';
      select.appendChild(opt);
      return;
    }

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    defaultOpt.textContent = 'Pilih Lapisan Sumber Buffer...';
    select.appendChild(defaultOpt);

    layers.forEach((layer) => {
      // Source layer option
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = `${layer.name} (${layer.featureCount} fitur)`;
      select.appendChild(opt);

      // Overlay layer option
      if (overlaySelect) {
        const overlayOpt = document.createElement('option');
        overlayOpt.value = layer.id;
        overlayOpt.textContent = `🎯 ${layer.name} (${layer.featureCount} fitur)`;
        overlaySelect.appendChild(overlayOpt);
      }
    });
  }

  /**
   * Select a specific source layer in the buffer analysis dropdown
   */
  public selectLayer(layerId: string) {
    this.updateLayerSelect();
    const select = document.getElementById('buffer-layer-select') as HTMLSelectElement | null;
    if (select) {
      select.value = layerId;
    }
  }

  public getColor(): string {
    return this.selectedColor;
  }

  public setColor(color: string) {
    this.selectedColor = color;
  }

  public getOpacity(): number {
    return this.selectedOpacity;
  }

  public setOpacity(opacity: number) {
    this.selectedOpacity = opacity;
  }

  private bindEvents() {
    const input = document.getElementById('buffer-radius-input') as HTMLInputElement | null;
    const slider = document.getElementById('buffer-radius-slider') as HTMLInputElement | null;

    if (input && slider) {
      slider.addEventListener('input', () => {
        input.value = slider.value;
      });
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        if (!isNaN(val) && val >= 0.5 && val <= 50) {
          slider.value = String(val);
        }
      });
    }

    // Preset chip buttons (1, 5, 10, 25, 50 km)
    const chips = document.querySelectorAll<HTMLButtonElement>('.buffer-preset-chips .btn-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const r = chip.dataset.radius;
        if (r) {
          if (input) input.value = r;
          if (slider) slider.value = r;
        }
      });
    });

    // Buffer Color Swatch chips
    const colorSwatches = document.querySelectorAll<HTMLButtonElement>('.buffer-color-chip');
    const customColorInput = document.getElementById('buffer-color-custom') as HTMLInputElement | null;

    colorSwatches.forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        e.preventDefault();
        colorSwatches.forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.dataset.color || '#8b5cf6';
        this.selectedColor = color;
        if (customColorInput) customColorInput.value = color;
      });
    });

    if (customColorInput) {
      customColorInput.addEventListener('input', () => {
        colorSwatches.forEach((s) => s.classList.remove('active'));
        this.selectedColor = customColorInput.value;
      });
    }

    // Buffer Opacity Slider
    const opacitySlider = document.getElementById('buffer-opacity-slider') as HTMLInputElement | null;
    const opacityValEl = document.getElementById('buffer-opacity-val');

    if (opacitySlider) {
      opacitySlider.addEventListener('input', () => {
        const pct = parseInt(opacitySlider.value, 10);
        this.selectedOpacity = pct / 100;
        if (opacityValEl) {
          opacityValEl.innerText = `${pct}%`;
        }
      });
    }

    // Run Buffer button
    const runBtn = document.getElementById('btn-run-buffer-analysis');
    if (runBtn) {
      runBtn.addEventListener('click', () => this.runBufferCalculation());
    }

    // Clear Buffer button
    const clearBtn = document.getElementById('btn-clear-buffer-analysis');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllBuffers());
    }
  }

  public clearAllBuffers() {
    const removedCount = this.geojsonLoader.removeBufferLayers();
    const statusBox = document.getElementById('buffer-analysis-status');
    this.lastIntersectedGeoJSON = null;

    if (removedCount > 0) {
      showToast(`Berhasil menghapus ${removedCount} layer buffer dari peta.`, 'info');
      announceToScreenReader(`Seluruh layer buffer telah dihapus.`);
      if (statusBox) {
        statusBox.className = 'analysis-status-box';
        statusBox.style.display = 'block';
        statusBox.innerHTML = `🧹 <strong>Buffer Dibersihkan:</strong> ${removedCount} layer buffer telah dihapus dari peta.`;
      }
      this.updateLayerSelect();
      if (this.onBufferCreatedCallback) {
        this.onBufferCreatedCallback();
      }
    } else {
      showToast('Tidak ada layer buffer aktif di peta.', 'info');
      if (statusBox) {
        statusBox.style.display = 'none';
      }
    }
  }

  private async runBufferCalculation() {
    const select = document.getElementById('buffer-layer-select') as HTMLSelectElement | null;
    const overlaySelect = document.getElementById('buffer-overlay-select') as HTMLSelectElement | null;
    const radiusInput = document.getElementById('buffer-radius-input') as HTMLInputElement | null;
    const statusBox = document.getElementById('buffer-analysis-status');

    const layerId = select?.value;
    if (!layerId) {
      showToast('Silakan pilih lapisan sumber terlebih dahulu dari daftar!', 'warning');
      if (statusBox) {
        statusBox.className = 'analysis-status-box warning';
        statusBox.style.display = 'block';
        statusBox.innerHTML = '⚠️ <strong>Pilih Lapisan:</strong> Belum ada layer yang dipilih. Unggah file GeoJSON/KML di tab Data bila list kosong.';
      }
      return;
    }

    const overlayLayerId = overlaySelect?.value || undefined;
    if (overlayLayerId && overlayLayerId === layerId) {
      showToast('Lapisan sumber buffer dan lapisan overlay tidak boleh sama!', 'warning');
      return;
    }

    const radius = parseFloat(radiusInput?.value || '0');
    if (isNaN(radius) || radius <= 0) {
      showToast('Radius buffer harus berupa angka positif lebih dari 0!', 'warning');
      return;
    }

    if (radius > 500) {
      showToast('Radius buffer maksimum adalah 500 km.', 'warning');
      return;
    }

    if (statusBox) {
      statusBox.className = 'analysis-status-box';
      statusBox.style.display = 'block';
      statusBox.innerHTML = `◌ <strong>Menghitung zona penyangga${overlayLayerId ? ' & spatial intersection' : ''}...</strong> (Radius: ${radius} km)`;
    }

    try {
      // Auto-replace previous buffer layers if toggle is checked
      const autoReplaceCheck = document.getElementById('buffer-auto-replace') as HTMLInputElement | null;
      const shouldAutoReplace = autoReplaceCheck ? autoReplaceCheck.checked : false;
      if (shouldAutoReplace) {
        this.geojsonLoader.removeBufferLayers();
      }

      const res = await this.geojsonLoader.createBufferForLayer(
        layerId,
        radius,
        'kilometers',
        overlayLayerId,
        this.selectedColor,
        this.selectedOpacity
      );
      if (res.success) {
        const areaFormatted = res.areaKm2 !== undefined ? res.areaKm2.toLocaleString('id-ID') : '-';
        showToast(`Zona penyangga ${radius} km berhasil dibuat! (Luas total: ${areaFormatted} km²)`, 'success');
        announceToScreenReader(`Zona penyangga ${radius} kilometer berhasil dibuat.`);

        if (statusBox) {
          statusBox.className = 'analysis-status-box success';
          statusBox.style.display = 'block';

          let html = `
            <div style="margin-bottom: 6px;">
              ✅ <strong>Buffer Berhasil Dibuat:</strong> Radius ${radius} km · Luas area buffer: <strong>${areaFormatted} km²</strong>.
            </div>
          `;

          if (res.warning) {
            html += `<div style="font-size: 10px; color: #fbbf24; margin-bottom: 6px;">⚠️ ${res.warning}</div>`;
          }

          // If spatial intersection query was performed
          if (res.intersection) {
            this.lastIntersectedGeoJSON = res.intersection.insideFeatures;
            const isect = res.intersection;
            html += `
              <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 8px; margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <strong style="color: #38bdf8; font-size: 11px;">🎯 Hasil Spatial Intersection:</strong>
                  <span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 9.5px; padding: 1px 6px; border-radius: 3px;">
                    ${isect.insideCount} / ${isect.totalTargetFeatures} Fitur (${isect.insidePercentage}%)
                  </span>
                </div>
                <div style="font-size: 10.5px; color: #cbd5e1; margin-bottom: 6px;">
                  Sebanyak <strong>${isect.insideCount} objek</strong> dari layer <em>${isect.targetLayerName}</em> berada di dalam radius penyangga ${radius} km.
                </div>
            `;

            if (isect.featureSummaries.length > 0) {
              html += `<div style="max-height: 80px; overflow-y: auto; font-size: 9.5px; color: var(--text-muted); background: rgba(0,0,0,0.25); padding: 4px 6px; border-radius: 4px; margin-bottom: 6px;">`;
              isect.featureSummaries.slice(0, 10).forEach((s) => {
                html += `<div>• ${s.name} (${s.type})</div>`;
              });
              if (isect.featureSummaries.length > 10) {
                html += `<div style="font-style: italic;">...dan ${isect.featureSummaries.length - 10} objek lainnya</div>`;
              }
              html += `</div>`;
            }

            if (isect.insideCount > 0) {
              html += `
                <button id="btn-download-intersected-geojson" class="btn btn-outline btn-sm full-width" style="font-size: 10px; padding: 4px 8px; gap: 4px; justify-content: center; border-color: rgba(56, 189, 248, 0.5); color: #38bdf8;">
                  💾 Unduh Fitur Terdampak (.GeoJSON)
                </button>
              `;
            }

            html += `</div>`;
          }

          statusBox.innerHTML = html;

          // Bind download button if present
          const dlBtn = document.getElementById('btn-download-intersected-geojson');
          if (dlBtn && this.lastIntersectedGeoJSON) {
            dlBtn.addEventListener('click', () => this.downloadIntersectedGeoJSON(res.intersection?.targetLayerName || 'intersection'));
          }
        }

        this.updateLayerSelect();
        if (this.onBufferCreatedCallback) {
          this.onBufferCreatedCallback();
        }
      } else {
        showToast(res.error || 'Gagal menghitung zona penyangga.', 'error');
        if (statusBox) {
          statusBox.className = 'analysis-status-box warning';
          statusBox.style.display = 'block';
          statusBox.innerHTML = `❌ <strong>Gagal:</strong> ${res.error || 'Terjadi kesalahan kalkulasi spasial.'}`;
        }
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Kalkulasi buffer gagal'}`, 'error');
    }
  }

  private downloadIntersectedGeoJSON(targetName: string) {
    if (!this.lastIntersectedGeoJSON) return;
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.lastIntersectedGeoJSON, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `intersected_${targetName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.geojson`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('File GeoJSON fitur terdampak berhasil diunduh!', 'success');
    } catch (e: any) {
      showToast(`Gagal mengunduh file: ${e?.message || 'Error'}`, 'error');
    }
  }
}

