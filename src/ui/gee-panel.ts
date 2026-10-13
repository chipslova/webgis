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

      this.updateThermalContrast();
      this.initRealtimeWeather();

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
      const satName = metadata?.satellite === 'aqua' ? 'Aqua (Siang 13:30)' : 'Terra (Pagi 10:30)';
      if (pill) { pill.style.background = '#16a34a'; pill.innerText = '● LIVE GEE REDUCTION'; }
      if (desc) desc.innerHTML = `Menampilkan citra Satelit <strong>${satName}</strong> • Periode: <strong>${metadata?.period || 'Live'}</strong> hasil reduksi Google Earth Engine API.`;
      if (datasetLabel) datasetLabel.innerHTML = `Dataset: <code>${metadata?.dataset || 'MODIS/061/MOD11A2'}</code> • Provider: NASA LP DAAC`;
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

  private getPeriodDates(val?: string): [string, string] {
    if (!val || val === 'live-recent' || !val.includes('|')) {
      const now = new Date();
      const end = now.toISOString().split('T')[0];
      const prev = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const start = prev.toISOString().split('T')[0];
      return [start, end];
    }
    return val.split('|') as [string, string];
  }

  // ── GEE compute button ───────────────────────────────────────────────────────

  private bindGEEComputeEvents() {
    const btn = document.getElementById('btn-gee-compute');
    const timeSelect = document.getElementById('gee-time-select') as HTMLSelectElement | null;
    const satSelect = document.getElementById('gee-satellite-select') as HTMLSelectElement | null;
    const periodSelect = document.getElementById('gee-period-select') as HTMLSelectElement | null;
    const modeSelect = document.getElementById('gee-mode-select') as HTMLSelectElement | null;

    const parseTime = (val: string): { satellite: 'terra' | 'aqua'; mode: 'day' | 'night' } => {
      switch (val) {
        case 'aqua-day':
          return { satellite: 'aqua', mode: 'day' };
        case 'terra-night':
          return { satellite: 'terra', mode: 'night' };
        case 'aqua-night':
          return { satellite: 'aqua', mode: 'night' };
        case 'terra-day':
        default:
          return { satellite: 'terra', mode: 'day' };
      }
    };

    const updateTimeSubtexts = (sat: string, mode: string = 'day') => {
      const daySub = document.getElementById('label-lst-day-subtext');
      if (daySub) {
        if (sat === 'aqua') {
          daySub.innerText = mode === 'day' ? '(Aqua · Puncak Panas 13:30)' : '(Aqua · Paling Dingin 01:30)';
        } else {
          daySub.innerText = mode === 'day' ? '(Terra · Pagi 10:30)' : '(Terra · Malam 22:30)';
        }
      }
    };

    // Restore user preferences from localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const savedTime = localStorage.getItem('webgis_gee_time');
        if (savedTime && timeSelect && Array.from(timeSelect.options).some(o => o.value === savedTime)) {
          timeSelect.value = savedTime;
          const parsed = parseTime(savedTime);
          if (satSelect) satSelect.value = parsed.satellite;
          if (modeSelect) modeSelect.value = parsed.mode;
        }
        const savedPeriod = localStorage.getItem('webgis_gee_period');
        if (savedPeriod && periodSelect && Array.from(periodSelect.options).some(o => o.value === savedPeriod)) {
          periodSelect.value = savedPeriod;
        }
      } catch (_) {}
    }

    const handleParamChange = async () => {
      let satellite: 'terra' | 'aqua' | 'combined' = 'terra';
      let mode: 'day' | 'night' = 'day';

      if (timeSelect && timeSelect.value) {
        const parsed = parseTime(timeSelect.value);
        satellite = parsed.satellite;
        mode = parsed.mode;
        if (satSelect) satSelect.value = satellite;
        if (modeSelect) modeSelect.value = mode;
        updateTimeSubtexts(satellite, mode);

        // Night / Day dynamic aesthetic on LST card
        const lstRow = document.getElementById('gee-layer-lst-day-row');
        if (lstRow) {
          if (mode === 'night') {
            lstRow.style.borderColor = 'rgba(129, 140, 248, 0.45)';
            lstRow.style.boxShadow = '0 0 14px rgba(99, 102, 241, 0.15)';
          } else {
            lstRow.style.borderColor = 'rgba(245, 158, 11, 0.35)';
            lstRow.style.boxShadow = '0 0 14px rgba(245, 158, 11, 0.12)';
          }
        }

        // Auto-switch layers if either LST layer is currently on
        if (this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst-night')) {
          if (mode === 'day') {
            await this.geeLoader.toggleLayer('lst-day', true);
            await this.geeLoader.toggleLayer('lst-night', false);
          } else {
            await this.geeLoader.toggleLayer('lst-night', true);
            await this.geeLoader.toggleLayer('lst-day', false);
          }
          this.syncCheckboxStates();
        }
      } else {
        satellite = (satSelect?.value || 'terra') as 'terra' | 'aqua' | 'combined';
        mode = (modeSelect?.value || 'day') as 'day' | 'night';
      }

      // Persist preferences
      if (typeof localStorage !== 'undefined') {
        try {
          if (timeSelect?.value) localStorage.setItem('webgis_gee_time', timeSelect.value);
          if (periodSelect?.value) localStorage.setItem('webgis_gee_period', periodSelect.value);
        } catch (_) {}
      }

      const [start, end] = this.getPeriodDates(periodSelect?.value);
      this.geeLoader.setParams({ satellite, mode, start, end });

      if (this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst-night') || this.geeLoader.isLayerVisible('precipitation')) {
        btn?.click();
      } else {
        this.updateThermalContrast();
      }
    };

    if (timeSelect) timeSelect.addEventListener('change', handleParamChange);
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
        let satellite = (satSelect?.value || 'terra') as 'terra' | 'aqua' | 'combined';
        let mode = (modeSelect?.value || 'day') as 'day' | 'night';
        if (timeSelect && timeSelect.value) {
          const parsed = parseTime(timeSelect.value);
          satellite = parsed.satellite;
          mode = parsed.mode;
        }
        const [start, end] = this.getPeriodDates(periodSelect?.value);
        btn.setAttribute('disabled', 'true');
        btn.innerText = 'Menghubungi GEE...';

        const tileLoading = document.getElementById('gee-tiles-loading');
        if (tileLoading) tileLoading.style.display = 'inline-flex';
        const statusHint = document.getElementById('gee-status-hint');
        if (statusHint) statusHint.innerHTML = '<span class="gee-spinner" style="width: 9px; height: 9px; border: 1.5px solid rgba(56, 189, 248, 0.3); border-top-color: #38bdf8; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span> <em style="color: #38bdf8;">Mengambil citra live GEE...</em>';

        // Automatically activate appropriate LST layer if user hasn't checked any thermal layer yet
        if (!this.geeLoader.isLayerVisible('lst-day') && !this.geeLoader.isLayerVisible('lst-night')) {
          if (mode === 'night') {
            await this.geeLoader.toggleLayer('lst-night', true);
          } else {
            await this.geeLoader.toggleLayer('lst-day', true);
          }
          this.syncCheckboxStates();
        }

        const satName = satellite === 'aqua' 
          ? (mode === 'day' ? 'Aqua (Siang 13:30)' : 'Aqua (Dini Hari 01:30)') 
          : (mode === 'day' ? 'Terra (Pagi 10:30)' : 'Terra (Malam 22:30)');
        const isRecent = periodSelect?.value === 'live-recent';
        const periodName = isRecent ? 'Terkini (Live 30 Hari)' :
          start.startsWith('2024-08') ? 'Kemarau (Agu 2024)' :
          start.startsWith('2024-01') ? 'Musim Hujan (Jan 2024)' :
          start.startsWith('2024-04') ? 'Pancaroba (Apr 2024)' : `${start}`;

        try {
          const [res] = await Promise.all([
            this.geeLoader.computeLiveGEE({ satellite, mode, start, end }),
            this.geeLoader.isLayerVisible('precipitation') ? this.geeLoader.computeLivePrecipitation(start) : Promise.resolve(null)
          ]);
          if (res && res.status === 'live') {
            showToast(`Citra GEE Live aktif: ${satName} · ${periodName}!`, 'success');
          } else {
            showToast('GEE API mengembalikan fallback WMS.', 'info');
          }
        } catch (e: any) {
          showToast(`Gagal memanggil GEE: ${e.message}`, 'error');
        } finally {
          btn.removeAttribute('disabled');
          btn.innerHTML = '⚡ Perbarui Peta GEE';
          if (tileLoading) tileLoading.style.display = 'none';
          if (statusHint) statusHint.innerHTML = '⚡ <em>Peta otomatis ter-update</em>';
          
          // Also update the UI contrast box when new parameters are applied
          this.updateThermalContrast();
        }
      });
    }
  }

  // ── Checkbox sync ────────────────────────────────────────────────────────────

  private syncCheckboxStates() {
    const isDay = this.geeLoader.isLayerVisible('lst-day');
    const isNight = this.geeLoader.isLayerVisible('lst-night');
    const isThermalActive = isDay || isNight;

    const mainLstToggle = document.getElementById('toggle-gee-lst') as HTMLInputElement | null;
    if (mainLstToggle) {
      mainLstToggle.checked = isThermalActive;
      const opRow = document.getElementById('gee-lst-opacity-row');
      if (opRow) opRow.style.display = isThermalActive ? 'flex' : 'none';
      const subcontrols = document.getElementById('gee-lst-subcontrols');
      if (subcontrols) subcontrols.style.display = isThermalActive ? 'block' : 'none';
    }

    const applyToggle = (id: string, layerKey: string, opRowId?: string, legendId?: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      const isOn = this.geeLoader.isLayerVisible(layerKey);
      el.checked = isOn;
      if (opRowId) { const r = document.getElementById(opRowId); if (r) r.style.display = isOn ? 'flex' : 'none'; }
      if (legendId) { const l = document.getElementById(legendId); if (l) l.style.display = isOn ? 'block' : 'none'; }
    };

    applyToggle('toggle-gee-elevation', 'lst-night', 'gee-lst-night-opacity-row');
    applyToggle('toggle-gee-surface', 'lst-night', 'gee-lst-night-opacity-row');
    applyToggle('toggle-gee-landcover', 'landcover', 'gee-lc-opacity-row', 'gee-lulc-legend');
    applyToggle('toggle-gee-precipitation', 'precipitation', 'gee-precip-opacity-row', 'gee-precip-legend');
    applyToggle('toggle-gee-rainfall', 'precipitation', 'gee-precip-opacity-row', 'gee-precip-legend');
    applyToggle('toggle-gee-stations', 'stations');

    const thermalLegendBox = document.getElementById('gee-thermal-legend-box');
    if (thermalLegendBox) {
      thermalLegendBox.style.display = isThermalActive ? 'block' : 'none';
    }
  }

  // ── Per-layer opacity sliders ────────────────────────────────────────────────

  private bindPerLayerOpacityEvents() {
    const daySlider = document.getElementById('gee-lst-day-opacity') as HTMLInputElement | null;
    const dayLabel = document.getElementById('gee-lst-day-opacity-val');
    if (daySlider) {
      daySlider.addEventListener('input', () => {
        const val = Number(daySlider.value);
        if (dayLabel) dayLabel.innerText = `${val}%`;
        this.geeLoader.setLayerOpacity('lst-day', val / 100);
        this.geeLoader.setLayerOpacity('lst-night', val / 100);
      });
    }

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

    const toggleLst = document.getElementById('toggle-gee-lst') as HTMLInputElement | null;
    const timeSelect = document.getElementById('gee-time-select') as HTMLSelectElement | null;

    if (toggleLst) {
      toggleLst.addEventListener('change', async () => {
        const isChecked = toggleLst.checked;
        const subcontrols = document.getElementById('gee-lst-subcontrols');
        if (subcontrols) subcontrols.style.display = isChecked ? 'block' : 'none';
        const isNight = timeSelect ? timeSelect.value.includes('night') : false;
        if (isChecked) {
          if (isNight) {
            await this.geeLoader.toggleLayer('lst-night', true);
            await this.geeLoader.toggleLayer('lst-day', false);
          } else {
            await this.geeLoader.toggleLayer('lst-day', true);
            await this.geeLoader.toggleLayer('lst-night', false);
          }
          const btn = document.getElementById('btn-gee-compute');
          btn?.click();
        } else {
          await this.geeLoader.toggleLayer('lst-day', false);
          await this.geeLoader.toggleLayer('lst-night', false);
        }
        this.syncCheckboxStates();
      });
    }

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

  // ── Dynamic Thermal Contrast ─────────────────────────────────────────────────

  private async updateThermalContrast() {
    try {
      const jakarta = { lat: -6.175, lon: 106.827 };
      const bandung = { lat: -6.914, lon: 107.609 };
      
      const periodSelect = document.getElementById('gee-period-select') as HTMLSelectElement | null;
      const [startDate, endDate] = this.getPeriodDates(periodSelect?.value);

      const satSelect = document.getElementById('gee-satellite-select') as HTMLSelectElement | null;
      const satellite = (satSelect?.value || 'terra') as 'terra' | 'aqua';

      const fetchTemp = async (coords: {lat: number, lon: number}) => {
        const res = await fetch('/api/gee-timeseries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: coords.lat, lon: coords.lon, startDate, endDate, satellite })
        });
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        const tsData = data.data || [];
        // Find the most recent valid LST reading in this period
        for (let i = tsData.length - 1; i >= 0; i--) {
          const val = tsData[i].day_c;
          if (val !== null && val !== undefined) {
            return val; // already in Celsius
          }
        }
        return null;
      };

      const [jktTemp, bdgTemp] = await Promise.all([
        fetchTemp(jakarta).catch(() => null),
        fetchTemp(bandung).catch(() => null)
      ]);

      const jktEl = document.getElementById('metric-jakarta-lst');
      const bdgEl = document.getElementById('metric-bandung-lst');
      const deltaEl = document.getElementById('metric-suhi-delta');
      const jktSrc = document.getElementById('metric-jkt-src');
      const bdgSrc = document.getElementById('metric-bdg-src');

      const satLabel = satellite === 'aqua' ? 'MODIS Aqua (Siang 13:30)' : 'MODIS Terra (Pagi 10:30)';

      if (jktTemp !== null && bdgTemp !== null) {
        if (jktEl) jktEl.innerHTML = `${jktTemp.toFixed(1)} <span class="gee-comp-unit">°C</span>`;
        if (bdgEl) bdgEl.innerHTML = `${bdgTemp.toFixed(1)} <span class="gee-comp-unit">°C</span>`;
        
        const delta = jktTemp - bdgTemp;
        if (deltaEl) {
          deltaEl.innerHTML = `Δ ${delta > 0 ? '+' : ''}${delta.toFixed(1)} <span class="gee-delta-unit">°C</span>`;
          deltaEl.style.color = '#ffffff';
          deltaEl.style.background = delta > 10 ? '#dc2626' : '#d97706';
          deltaEl.style.borderColor = delta > 10 ? '#ef4444' : '#f59e0b';
        }
        
        if (jktSrc) { jktSrc.innerText = `${satLabel} · Live GEE`; jktSrc.style.color = '#10b981'; }
        if (bdgSrc) { bdgSrc.innerText = `${satLabel} · Live GEE`; bdgSrc.style.color = '#10b981'; }
      } else {
        if (jktEl) jktEl.innerText = jktTemp !== null ? `${jktTemp.toFixed(1)} °C` : 'Berawan (N/A)';
        if (bdgEl) bdgEl.innerText = bdgTemp !== null ? `${bdgTemp.toFixed(1)} °C` : 'Berawan (N/A)';
        if (deltaEl) {
          deltaEl.innerText = 'Δ N/A';
          deltaEl.style.color = '#ffffff';
          deltaEl.style.background = '#475569';
          deltaEl.style.borderColor = '#64748b';
        }
        if (jktSrc) { jktSrc.innerText = `${satLabel} · Terhalang Awan`; jktSrc.style.color = '#fbbf24'; }
        if (bdgSrc) { bdgSrc.innerText = `${satLabel} · Terhalang Awan`; bdgSrc.style.color = '#fbbf24'; }
      }
    } catch (err) {
      console.warn('Failed to update thermal contrast:', err);
    }
  }

  // ── Pure Google Earth Engine (GEE) MODIS LST Point Temperature ───────────

  public async fetchLiveGEETemp(lat: number, lon: number, cityName: string): Promise<void> {
    const tempEl = document.getElementById('gee-weather-temp');
    const cityEl = document.getElementById('gee-weather-city');
    const dayEl = document.getElementById('gee-weather-day-temp') || document.getElementById('gee-weather-surface-temp');
    const nightEl = document.getElementById('gee-weather-night-temp') || document.getElementById('gee-weather-humidity');
    const deltaEl = document.getElementById('gee-weather-delta-temp') || document.getElementById('gee-weather-range');
    const iconEl = document.getElementById('gee-weather-icon');
    const timeEl = document.getElementById('gee-weather-time');

    if (timeEl) timeEl.innerText = 'Mengambil data GEE MODIS...';

    const timeSelect = document.getElementById('gee-time-select') as HTMLSelectElement | null;
    const satSelect = (document.getElementById('gee-satellite-select') || document.getElementById('gee-sat-select')) as HTMLSelectElement | null;
    const satellite = (timeSelect?.value.includes('aqua') || satSelect?.value === 'aqua') ? 'aqua' : 'terra';

    try {
      const res = await fetch('/api/gee-timeseries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          startDate: '2024-01-01',
          endDate: '2026-12-31',
          satellite
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const records: Array<{ date: string; day_c: number | null; night_c: number | null }> = json?.data || [];
      const validRecords = records.filter(r => r.day_c !== null || r.night_c !== null);
      const validDayRecords = records.filter(r => r.day_c !== null && r.day_c !== undefined);
      const validNightRecords = records.filter(r => r.night_c !== null && r.night_c !== undefined);

      if (validRecords.length > 0) {
        const latestRecord = validRecords[validRecords.length - 1];
        const latestDayRecord = validDayRecords[validDayRecords.length - 1];
        const latestNightRecord = validNightRecords[validNightRecords.length - 1];

        const dayVal = latestDayRecord?.day_c ?? null;
        const nightVal = latestNightRecord?.night_c ?? null;
        const mainTemp = dayVal ?? nightVal;
        const recDate = latestRecord?.date || latestDayRecord?.date || '';

        if (tempEl && mainTemp !== null && mainTemp !== undefined) {
          tempEl.innerText = `${mainTemp.toFixed(1)} °C`;
        }
        if (cityEl) {
          cityEl.innerText = `📍 ${cityName}`;
        }
        if (dayEl) {
          dayEl.innerText = dayVal !== null && dayVal !== undefined ? `${dayVal.toFixed(1)} °C` : '--.- °C';
        }
        if (nightEl) {
          nightEl.innerText = nightVal !== null && nightVal !== undefined ? `${nightVal.toFixed(1)} °C` : '--.- °C';
        }
        if (deltaEl) {
          if (dayVal !== null && dayVal !== undefined && nightVal !== null && nightVal !== undefined) {
            const delta = dayVal - nightVal;
            deltaEl.innerText = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} °C`;
          } else if (recDate) {
            deltaEl.innerText = recDate;
          } else {
            deltaEl.innerText = '--';
          }
        }
        if (iconEl && mainTemp !== null && mainTemp !== undefined) {
          if (mainTemp >= 35) iconEl.innerText = '🔥';
          else if (mainTemp >= 30) iconEl.innerText = '☀️';
          else if (mainTemp >= 24) iconEl.innerText = '🌤️';
          else iconEl.innerText = '❄️';
        }
        if (timeEl) {
          const satLabel = satellite === 'aqua' ? 'Aqua' : 'Terra';
          timeEl.innerText = `GEE ${recDate} · ${satLabel} LST`;
        }
      } else {
        if (cityEl) cityEl.innerText = `📍 ${cityName}`;
        if (timeEl) timeEl.innerText = 'GEE: Tutupan Awan';
      }
    } catch (e) {
      console.warn('Failed to fetch GEE LST temperature:', e);
      if (timeEl) timeEl.innerText = 'Gagal memuat data GEE';
    }
  }

  private initRealtimeWeather() {
    const chips = document.querySelectorAll('.gee-weather-chip');
    const mapCenterBtn = document.getElementById('btn-weather-map-center');

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.id === 'btn-weather-map-center') return;
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const lat = Number(chip.getAttribute('data-lat'));
        const lon = Number(chip.getAttribute('data-lon'));
        const city = chip.getAttribute('data-city') || 'Lokasi';
        if (!isNaN(lat) && !isNaN(lon)) {
          this.fetchLiveGEETemp(lat, lon, city);
        }
      });
    });

    if (mapCenterBtn) {
      mapCenterBtn.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        mapCenterBtn.classList.add('active');
        const map = this.geeLoader.getMap();
        if (map) {
          const center = map.getCenter();
          this.fetchLiveGEETemp(center.lat, center.lng, `Tengah Peta (${center.lat.toFixed(2)}°, ${center.lng.toFixed(2)}°)`);
        }
      });
    }

    // Default load Jakarta Pusat
    this.fetchLiveGEETemp(-6.175, 106.827, 'Jakarta Pusat');
  }
}


