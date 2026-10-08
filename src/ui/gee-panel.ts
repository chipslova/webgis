import { GEELoader } from '../tools/gee-loader';
import { showToast } from './toast';

export class GEEPanelUI {
  private geeLoader: GEELoader;
  private isInitialized: boolean = false;
  private isToggleEventsBound: boolean = false;
  private timelapseTimer: ReturnType<typeof setInterval> | null = null;
  private isRecording: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;

  constructor(geeLoader: GEELoader) {
    this.geeLoader = geeLoader;
  }

  public init() {
    this.syncCheckboxStates();

    if (!this.isInitialized) {
      this.bindLayerToggleEvents();
      this.bindPerLayerOpacityEvents();
      this.bindDownloadEvents();
      this.bindGEEComputeEvents();
      this.bindTileLoadingIndicator();

      this.geeLoader.onLayersChange(() => {
        this.syncCheckboxStates();
      });

      this.geeLoader.onStatusChange((status, metadata) => {
        this.updateStatusUI(status, metadata);
      });

      const map = this.geeLoader.getMap();
      if (map) {
        map.on('style.load', () => {
          this.syncCheckboxStates();
        });
      }

        window.addEventListener('gee-load-error', () => {
        showToast('Gagal memuat data MODIS LST. Periksa koneksi jaringan Anda.', 'error');
      }, { once: false });

      this.isInitialized = true;
    }
  }

  // ── Tile loading indicator ───────────────────────────────────────────────────

  private bindTileLoadingIndicator() {
    const map = this.geeLoader.getMap();
    if (!map) return;
    const show = () => { const el = document.getElementById('gee-tiles-loading'); if (el) el.style.display = 'flex'; };
    const hide = () => { const el = document.getElementById('gee-tiles-loading'); if (el) el.style.display = 'none'; };
    map.on('dataloading', (e: any) => { if (e.dataType === 'source') show(); });
    map.on('idle', hide);
    map.on('error', hide);
  }

  // ── Status pill ──────────────────────────────────────────────────────────────

  private updateStatusUI(status: string, metadata?: any) {
    const pill = document.getElementById('gee-live-status-pill');
    const desc = document.getElementById('gee-status-description');
    const datasetLabel = document.getElementById('gee-active-dataset-label');
    const computeStatus = document.getElementById('gee-compute-status');

    if (status === 'live') {
      if (pill) { pill.style.background = '#16a34a'; pill.innerText = '● LIVE GEE REDUCTION'; }
      if (desc) desc.innerText = `Menampilkan komposit 8-harian MODIS (${metadata?.period || 'Live'}) hasil reduksi Google Earth Engine API.`;
      if (datasetLabel) datasetLabel.innerHTML = `Dataset: <code>${metadata?.dataset || 'MODIS/061/MOD11A2 + MYD11A2'}</code> • Provider: NASA LP DAAC`;
      if (computeStatus) computeStatus.style.display = 'none';
    } else if (status === 'computing') {
      if (pill) { pill.style.background = '#d97706'; pill.innerText = '◌ MENGHITUNG KOMPOSIT GEE...'; }
      if (desc) desc.innerText = 'Memproses kalkulasi Google Earth Engine Cloud Compute...';
      if (computeStatus) { computeStatus.style.display = 'block'; computeStatus.innerText = 'Menghubungi GEE Serverless API...'; }
    } else if (status === 'error') {
      if (pill) { pill.style.background = '#ef4444'; pill.innerText = '✕ GEE TIDAK TERSEDIA'; }
      if (desc) desc.innerText = 'Layanan GEE Cloud Compute tidak dapat dihubungi. Menampilkan raster NASA GIBS WMS.';
      if (computeStatus) computeStatus.style.display = 'none';
    } else {
      if (pill) { pill.style.background = '#0284c7'; pill.innerText = '● NASA GIBS WMS (1 KM RASTER)'; }
      if (desc) desc.innerText = 'Aliran raster citra satelit NASA MODIS L3 Land Surface Temperature (Komposit 8-Harian 1 km). Bebas tutupan awan (Clear-Sky QA Masked).';
      if (computeStatus) computeStatus.style.display = 'none';
    }
  }

  // ── GEE compute button ───────────────────────────────────────────────────────

  private bindGEEComputeEvents() {
    const btn = document.getElementById('btn-gee-compute');
    const satSelect = document.getElementById('gee-satellite-select') as HTMLSelectElement;
    const periodSelect = document.getElementById('gee-period-select') as HTMLSelectElement;
    const modeSelect = document.getElementById('gee-mode-select') as HTMLSelectElement;

    const handleParamChange = () => {
      const satellite = (satSelect?.value || 'terra') as 'terra' | 'aqua' | 'combined';
      const mode = (modeSelect?.value || 'day') as 'day' | 'night';
      const [start, end] = (periodSelect?.value || '2024-08-01|2024-08-31').split('|');
      this.geeLoader.setParams({ satellite, mode, start, end });
      if (this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst-night') || this.geeLoader.isLayerVisible('precipitation')) {
        btn?.click();
      }
    };

    if (satSelect) satSelect.addEventListener('change', handleParamChange);
    if (periodSelect) periodSelect.addEventListener('change', handleParamChange);
    if (modeSelect) modeSelect.addEventListener('change', handleParamChange);

    const timelapseBtn = document.getElementById('btn-gee-timelapse');
    if (timelapseBtn && periodSelect && btn) {
      timelapseBtn.addEventListener('click', () => {
        if (this.timelapseTimer) {
          clearInterval(this.timelapseTimer);
          this.timelapseTimer = null;
          timelapseBtn.innerHTML = '▶️ Animasi';
          timelapseBtn.classList.remove('active', 'btn-primary');
          timelapseBtn.classList.add('btn-secondary');
        } else {
          timelapseBtn.innerHTML = '⏹️ Hentikan';
          timelapseBtn.classList.remove('btn-secondary');
          timelapseBtn.classList.add('active', 'btn-primary');
          
          this.timelapseTimer = setInterval(async () => {
            // Auto increment period selection
            const currentIdx = periodSelect.selectedIndex;
            let nextIdx = currentIdx + 1;
            if (nextIdx >= periodSelect.options.length) {
              nextIdx = 0; // wrap around
            }
            periodSelect.selectedIndex = nextIdx;
            
            // Only trigger compute if layers are visible, otherwise just change the select visually
            if (this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst-night') || this.geeLoader.isLayerVisible('precipitation')) {
              await btn.click();
            } else {
              handleParamChange();
            }
          }, 8000); // 8 seconds per frame to allow tile loading
        }
      });
    }

    const recordBtn = document.getElementById('btn-gee-timelapse-record');
    if (recordBtn && timelapseBtn) {
      recordBtn.addEventListener('click', () => {
        if (this.isRecording) {
          // Stop recording
          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
          }
          this.isRecording = false;
          recordBtn.innerHTML = '🎥 Rekam';
          recordBtn.classList.remove('active');
          showToast('Rekaman selesai! Menyimpan video WebM...', 'success');
        } else {
          // Start recording
          const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement;
          if (!canvas) {
            showToast('Kanvas peta tidak ditemukan!', 'error');
            return;
          }
          
          try {
            const stream = canvas.captureStream(30);
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            const chunks: Blob[] = [];
            
            this.mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            
            this.mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `webgis_timelapse_${Date.now()}.webm`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            recordBtn.innerHTML = '🛑 Stop Rekam';
            recordBtn.classList.add('active');
            
            // Automatically start the animation if it's not playing
            if (!this.timelapseTimer) {
              timelapseBtn.click();
            }
            
            showToast('Memulai perekaman kanvas peta...', 'info');
          } catch (err: any) {
            showToast('Gagal memulai perekaman: ' + err.message, 'error');
          }
        }
      });
    }


    if (btn) {
      btn.addEventListener('click', async () => {
        const satellite = (satSelect?.value || 'terra') as 'terra' | 'aqua' | 'combined';
        const mode = (modeSelect?.value || 'day') as 'day' | 'night';
        const [start, end] = (periodSelect?.value || '2024-08-01|2024-08-31').split('|');
        btn.setAttribute('disabled', 'true');
        btn.innerText = 'Menghubungi GEE...';

        try {
          const [res] = await Promise.all([
            this.geeLoader.computeLiveGEE({ satellite, mode, start, end }),
            this.geeLoader.isLayerVisible('precipitation') ? this.geeLoader.computeLivePrecipitation(start) : Promise.resolve(null)
          ]);
          if (res && res.status === 'live') {
            showToast('Komposit GEE Live berhasil dihitung!', 'success');
          } else {
            showToast('GEE API mengembalikan fallback WMS.', 'info');
          }
        } catch (e: any) {
          showToast(`Gagal memanggil GEE: ${e.message}`, 'error');
        } finally {
          btn.removeAttribute('disabled');
          btn.innerHTML = '⚡ Terapkan Analisis Langsung';
        }
      });
    }
  }

  // ── Checkbox sync ────────────────────────────────────────────────────────────

  private syncCheckboxStates() {
    const applyToggle = (id: string, layerKey: string, opRowId?: string, legendId?: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      const isOn = this.geeLoader.isLayerVisible(layerKey);
      el.checked = isOn;
      if (opRowId) { const r = document.getElementById(opRowId); if (r) r.style.display = isOn ? 'flex' : 'none'; }
      if (legendId) { const l = document.getElementById(legendId); if (l) l.style.display = isOn ? 'block' : 'none'; }
    };

    applyToggle('toggle-gee-lst', 'lst-day', 'gee-lst-opacity-row');
    applyToggle('toggle-gee-air', 'lst-day', 'gee-lst-opacity-row');
    applyToggle('toggle-gee-elevation', 'lst-night', 'gee-lst-night-opacity-row');
    applyToggle('toggle-gee-surface', 'lst-night', 'gee-lst-night-opacity-row');
    applyToggle('toggle-gee-landcover', 'landcover', 'gee-lc-opacity-row', 'gee-lulc-legend');
    applyToggle('toggle-gee-precipitation', 'precipitation', 'gee-precip-opacity-row', 'gee-precip-legend');
    applyToggle('toggle-gee-rainfall', 'precipitation', 'gee-precip-opacity-row', 'gee-precip-legend');

    applyToggle('toggle-gee-stations', 'stations');

    const isThermalActive = this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst-night');
    const thermalLegendBox = document.getElementById('gee-thermal-legend-box');
    if (thermalLegendBox) {
      thermalLegendBox.style.display = isThermalActive ? 'block' : 'none';
    }
  }

  // ── Per-layer opacity sliders ────────────────────────────────────────────────

  private bindPerLayerOpacityEvents() {
    const bind = (sliderId: string, valId: string, layerKey: string) => {
      const slider = document.getElementById(sliderId) as HTMLInputElement | null;
      const label = document.getElementById(valId);
      if (!slider) return;
      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        if (label) label.innerText = `${val}%`;
        this.geeLoader.setLayerOpacity(layerKey, val / 100);
      });
    };

    bind('gee-lst-day-opacity', 'gee-lst-day-opacity-val', 'lst-day');
    bind('gee-lst-night-opacity', 'gee-lst-night-opacity-val', 'lst-night');
    bind('gee-landcover-opacity', 'gee-landcover-opacity-val', 'landcover');
    bind('gee-precip-opacity', 'gee-precip-opacity-val', 'precipitation');


  }

  // ── Layer toggle events ──────────────────────────────────────────────────────

  private bindLayerToggleEvents() {
    if (this.isToggleEventsBound) return;

    const attachToggle = (elemId: string, layerKey: string) => {
      const el = document.getElementById(elemId) as HTMLInputElement | null;
      if (!el) return;
      el.addEventListener('change', () => {
        this.geeLoader.toggleLayer(layerKey, el.checked);
      });
    };

    attachToggle('toggle-gee-lst', 'lst-day');
    attachToggle('toggle-gee-lst-day', 'lst-day');
    attachToggle('toggle-gee-air', 'lst-day');
    attachToggle('toggle-gee-elevation', 'lst-night');
    attachToggle('toggle-gee-lst-night', 'lst-night');
    attachToggle('toggle-gee-surface', 'lst-night');
    attachToggle('toggle-gee-landcover', 'landcover');
    attachToggle('toggle-gee-lc', 'landcover');
    attachToggle('toggle-gee-precipitation', 'precipitation');
    attachToggle('toggle-gee-rainfall', 'precipitation');

    attachToggle('toggle-gee-stations', 'stations');

    document.getElementById('btn-focus-gee-area')?.addEventListener('click', () => this.geeLoader.flyToStudyArea());
    document.getElementById('btn-focus-gee-indonesia')?.addEventListener('click', () => this.geeLoader.flyToIndonesia());

    this.isToggleEventsBound = true;
  }

  // ── Download dataset events ───────────────────────────────────────────────────

  private bindDownloadEvents() {

    document.getElementById('btn-download-geotiff')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      
      // Determine active dataset
      let dataset = '';
      if (this.geeLoader.isLayerVisible('lst-day')) {
        dataset = 'modis-lst-day';
      } else if (this.geeLoader.isLayerVisible('lst-night')) {
        dataset = 'modis-lst-night';
      } else if (this.geeLoader.isLayerVisible('precipitation')) {
        dataset = 'chirps-precip';
      } else if (this.geeLoader.isLayerVisible('landcover')) {
        dataset = 'esa-landcover';
      }

      if (!dataset) {
        showToast('Nyalakan salah satu lapisan Satelit terlebih dahulu (LST Siang, LST Malam, Tutupan Lahan, atau Curah Hujan)', 'warning');
        return;
      }

      const map = this.geeLoader.getMap();
      const bounds = map.getBounds();
      const bboxStr = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      
      // Get period
      const periodSelect = document.getElementById('gee-period-select') as HTMLSelectElement | null;
      let startDate = '2024-08-01';
      let endDate = '2024-08-31';
      if (periodSelect && periodSelect.value) {
        const parts = periodSelect.value.split('|');
        if (parts.length === 2) {
          startDate = parts[0];
          endDate = parts[1];
        }
      }

      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Menghubungi Google Earth Engine...';
      btn.disabled = true;

      try {
        const qs = new URLSearchParams({
          dataset,
          bbox: bboxStr,
          startDate,
          endDate,
          scale: '1000'
        });

        const res = await fetch(`/api/gee-export-tiff?${qs.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP Error ${res.status}`);
        }

        const data = await res.json();
        if (data.downloadUrl) {
          showToast('Permintaan berhasil! Mengunduh GeoTIFF...', 'success');
          const a = document.createElement('a');
          a.href = data.downloadUrl;
          a.download = `export_${dataset}.tif`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          throw new Error('URL Unduhan tidak diterima.');
        }
      } catch (err: any) {
        showToast(`Gagal mengunduh GeoTIFF: ${err.message}`, 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  }
}

