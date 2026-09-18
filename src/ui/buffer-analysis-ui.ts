import { GeoJsonLoader } from '../tools/geojson-loader';
import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';

export class BufferAnalysisUI {
  private geojsonLoader: GeoJsonLoader;
  private onBufferCreatedCallback?: () => void;

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
    if (!select) return;

    const layers = this.geojsonLoader.getLayers();
    select.innerHTML = '';

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
    defaultOpt.textContent = 'Pilih Lapisan Target...';
    select.appendChild(defaultOpt);

    layers.forEach((layer) => {
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = `${layer.name} (${layer.featureCount} fitur)`;
      select.appendChild(opt);
    });
  }

  private bindEvents() {
    // Preset chip buttons (1, 5, 10, 25, 50 km)
    const chips = document.querySelectorAll<HTMLButtonElement>('.buffer-preset-chips .btn-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const r = chip.dataset.radius;
        const input = document.getElementById('buffer-radius-input') as HTMLInputElement | null;
        if (input && r) {
          input.value = r;
        }
      });
    });

    // Run Buffer button
    const runBtn = document.getElementById('btn-run-buffer-analysis');
    if (runBtn) {
      runBtn.addEventListener('click', () => this.runBufferCalculation());
    }
  }

  private async runBufferCalculation() {
    const select = document.getElementById('buffer-layer-select') as HTMLSelectElement | null;
    const radiusInput = document.getElementById('buffer-radius-input') as HTMLInputElement | null;
    const statusBox = document.getElementById('buffer-analysis-status');

    const layerId = select?.value;
    if (!layerId) {
      showToast('Silakan pilih lapisan vektor terlebih dahulu dari daftar!', 'warning');
      if (statusBox) {
        statusBox.className = 'analysis-status-box warning';
        statusBox.style.display = 'block';
        statusBox.innerHTML = '⚠️ <strong>Pilih Lapisan:</strong> Belum ada layer yang dipilih. Unggah file GeoJSON/KML di tab Data bila list kosong.';
      }
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
      statusBox.innerHTML = `◌ <strong>Menghitung zona penyangga...</strong> (Radius: ${radius} km)`;
    }

    try {
      const res = await this.geojsonLoader.createBufferForLayer(layerId, radius, 'kilometers');
      if (res.success) {
        const areaFormatted = res.areaKm2 !== undefined ? res.areaKm2.toLocaleString('id-ID') : '-';
        showToast(`Zona penyangga ${radius} km berhasil dibuat! (Luas total: ${areaFormatted} km²)`, 'success');
        announceToScreenReader(`Zona penyangga ${radius} kilometer berhasil dibuat.`);

        if (statusBox) {
          statusBox.className = 'analysis-status-box success';
          statusBox.style.display = 'block';
          statusBox.innerHTML = `✅ <strong>Buffer Berhasil Dibuat:</strong> Radius ${radius} km · Luas polygon buffer: <strong>${areaFormatted} km²</strong>. Layer otomatis ditambahkan ke peta.`;
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
}
