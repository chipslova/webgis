import { GEELoader } from '../tools/gee-loader';
import { showToast } from './toast';

interface MODISTimeSeriesRecord {
  date: string;
  timestamp_ms: number;
  year?: number;
  month?: number;
  is_forecast?: boolean;
  jkt_day_lst_c?: number;
  jkt_night_lst_c?: number;
  bdg_day_lst_c?: number;
  bdg_night_lst_c?: number;
  ikn_day_lst_c?: number;
  ikn_night_lst_c?: number;
  uhi_delta_c?: number;
  jkt_air_temp_c?: number;
  jkt_surface_temp_c?: number;
  bdg_air_temp_c?: number;
  bdg_surface_temp_c?: number;
  urban_obs_c?: number;
  urban_fitted_c?: number;
  rural_obs_c?: number;
  rural_fitted_c?: number;
}

interface ChartPoint {
  x: number;
  date: string;
  isForecast: boolean;
  jktDay: number;
  bdgDay: number;
  jktNight: number;
  bdgNight: number;
}

export class GEEPanelUI {
  private geeLoader: GEELoader;
  private timeSeriesData: MODISTimeSeriesRecord[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private isInitialized: boolean = false;
  private isToggleEventsBound: boolean = false;
  private chartPoints: ChartPoint[] = [];
  private chartResizeObserver: ResizeObserver | null = null;
  private lastChartWidth: number = 0;

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
      this.bindAccessibleDataTableEvents();

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

      window.addEventListener('resize', () => {
        this.renderTimeSeriesChart();
      });

      window.addEventListener('gee-load-error', () => {
        showToast('Gagal memuat data MODIS LST. Periksa koneksi jaringan Anda.', 'error');
      }, { once: false });

      this.isInitialized = true;
    }

    this.renderTimeSeriesChart();
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
    };

    if (satSelect) satSelect.addEventListener('change', handleParamChange);
    if (periodSelect) periodSelect.addEventListener('change', handleParamChange);
    if (modeSelect) modeSelect.addEventListener('change', handleParamChange);

    if (btn) {
      btn.addEventListener('click', async () => {
        const satellite = (satSelect?.value || 'terra') as 'terra' | 'aqua' | 'combined';
        const mode = (modeSelect?.value || 'day') as 'day' | 'night';
        const [start, end] = (periodSelect?.value || '2024-08-01|2024-08-31').split('|');
        btn.setAttribute('disabled', 'true');
        btn.innerText = 'Menghubungi GEE...';

        try {
          const res = await this.geeLoader.computeLiveGEE({ satellite, mode, start, end });
          if (res && res.status === 'live') {
            showToast('Komposit GEE Live berhasil dihitung!', 'success');
          } else {
            showToast('GEE API mengembalikan fallback WMS.', 'info');
          }
        } catch (e: any) {
          showToast(`Gagal memanggil GEE: ${e.message}`, 'error');
        } finally {
          btn.removeAttribute('disabled');
          btn.innerHTML = '<span>⚡</span><span>Perbarui Layer WMS NASA</span>';
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
    applyToggle('toggle-gee-lc', 'landcover', 'gee-lc-opacity-row', 'gee-lulc-legend');
    applyToggle('toggle-gee-poi', 'stations');
    applyToggle('toggle-gee-stations', 'stations');
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

    // Chart PNG download
    document.getElementById('btn-download-chart-png')?.addEventListener('click', () => {
      const c = document.getElementById('gee-chart-canvas') as HTMLCanvasElement | null;
      if (!c) return;
      const a = document.createElement('a');
      a.download = `lst_timeseries_${Date.now()}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
      showToast('Chart berhasil diunduh sebagai PNG!', 'success');
    });
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
    attachToggle('toggle-gee-poi', 'stations');
    attachToggle('toggle-gee-stations', 'stations');

    document.getElementById('btn-focus-gee-area')?.addEventListener('click', () => this.geeLoader.flyToStudyArea());
    document.getElementById('btn-focus-gee-indonesia')?.addEventListener('click', () => this.geeLoader.flyToIndonesia());

    this.isToggleEventsBound = true;
  }

  // ── Download dataset events ───────────────────────────────────────────────────

  private bindDownloadEvents() {
    document.getElementById('btn-download-geojson')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = '/data/gee_cfsv2_stations.geojson';
      a.download = 'modis_lst_stations_indonesia.geojson';
      a.click();
      showToast('Mengunduh Stasiun MODIS LST (GeoJSON)...', 'info');
    });

    document.getElementById('btn-download-csv')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = '/downloads/gee_cfsv2_temperature_indonesia.csv';
      a.download = 'modis_lst_seasonal_timeseries_indonesia.csv';
      a.click();
      showToast('Mengunduh Deret Waktu Multi-Tahun MODIS LST (CSV)...', 'info');
    });
  }

  // ── Chart rendering ──────────────────────────────────────────────────────────

  public async renderTimeSeriesChart() {
    this.canvas = document.getElementById('gee-chart-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;
    if (this.canvas.parentElement && this.canvas.parentElement.clientWidth === 0) return;

    if (this.timeSeriesData.length === 0) {
      try {
        const res = await fetch('/data/gee_cfsv2_timeseries.json');
        if (res.ok) {
          const json = await res.json();
          this.timeSeriesData = (json.data as any[]) || [];
        }
      } catch (e) { /* fallback */ }
    }

    if (this.timeSeriesData.length === 0) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = (this.canvas.width = this.canvas.parentElement?.clientWidth || 320);
    const height = (this.canvas.height = 200);
    this.lastChartWidth = width;

    if (!this.chartResizeObserver && this.canvas.parentElement && typeof ResizeObserver !== 'undefined') {
      this.chartResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newW = entry.contentRect.width;
          if (newW > 50 && Math.abs(newW - this.lastChartWidth) > 8) {
            this.renderTimeSeriesChart();
          }
        }
      });
      this.chartResizeObserver.observe(this.canvas.parentElement);
    }

    const P = { top: 24, right: 15, bottom: 30, left: 35 };
    const cW = width - P.left - P.right;
    const cH = height - P.top - P.bottom;
    const yMin = 10, yMax = 40;
    const toY = (v: number) => P.top + cH - ((v - yMin) / (yMax - yMin)) * cH;
    const total = this.timeSeriesData.length;
    const xStep = cW / (total - 1);

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.lineWidth = 1;
    for (let yV = 10; yV <= 40; yV += 10) {
      const y = toY(yV);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(width - P.right, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${yV}°C`, 5, y + 3);
    }

    // Build chart points
    this.chartPoints = this.timeSeriesData.map((rec, i) => ({
      x: P.left + i * xStep,
      date: rec.date?.substring(0, 10) || '',
      isForecast: Boolean(rec.is_forecast),
      jktDay: rec.jkt_day_lst_c ?? rec.jkt_air_temp_c ?? rec.urban_obs_c ?? 34,
      bdgDay: rec.bdg_day_lst_c ?? rec.bdg_air_temp_c ?? 25,
      jktNight: rec.jkt_night_lst_c ?? rec.jkt_surface_temp_c ?? 24,
      bdgNight: rec.bdg_night_lst_c ?? rec.bdg_surface_temp_c ?? 15,
    }));

    // X-axis year labels
    [0, Math.floor(total * 0.33), Math.floor(total * 0.66), total - 1].forEach((idx) => {
      const pt = this.chartPoints[idx];
      if (!pt) return;
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter, sans-serif';
      ctx.fillText(pt.date.substring(0, 4), Math.max(P.left, pt.x - 12), height - 8);
    });

    this.drawLines(ctx, toY);
    this.updateForecastDisclaimer();
    this.setupChartTooltip(ctx, P, cH, yMin, yMax, toY);
  }

  private drawLines(ctx: CanvasRenderingContext2D, toY: (v: number) => number, highlight?: ChartPoint | null) {
    const series: Array<{ color: string; lw: number; dash: number[]; get: (p: ChartPoint) => number }> = [
      { color: '#06b6d4', lw: 1.8, dash: [4, 3], get: (p) => p.bdgNight },
      { color: '#10b981', lw: 2.0, dash: [],     get: (p) => p.bdgDay   },
      { color: '#f59e0b', lw: 1.8, dash: [4, 3], get: (p) => p.jktNight },
      { color: '#ef4444', lw: 2.5, dash: [],     get: (p) => p.jktDay   },
    ];

    const forecastIdx = this.chartPoints.findIndex((p) => p.isForecast);

    series.forEach(({ color, lw, dash, get }) => {
      if (forecastIdx !== -1 && forecastIdx > 0) {
        // 1. Observed segment (solid / base dash)
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i <= forecastIdx; i++) {
          const pt = this.chartPoints[i];
          const y = toY(get(pt));
          if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
        }
        ctx.stroke();

        // 2. Forecast segment (distinct dashed line)
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = forecastIdx - 1; i < this.chartPoints.length; i++) {
          const pt = this.chartPoints[i];
          const y = toY(get(pt));
          if (i === forecastIdx - 1) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Single segment
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
        ctx.beginPath();
        this.chartPoints.forEach((pt, i) => {
          const y = toY(get(pt));
          if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
        });
        ctx.stroke(); ctx.setLineDash([]);
      }
    });

    // Draw vertical dividing line between real observations and climate forecast
    if (forecastIdx !== -1 && this.chartPoints[forecastIdx]) {
      const dividerX = this.chartPoints[forecastIdx].x;
      const P = { top: 24, bottom: 30 };
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(dividerX, P.top);
      ctx.lineTo(dividerX, (this.canvas?.height || 200) - P.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#c084fc';
      ctx.font = '700 8.5px Inter, sans-serif';
      ctx.fillText('🔮 CFSv2', Math.max(35, dividerX - 18), P.top - 5);
    }

    if (highlight) {
      const canvas = this.canvas!;
      const h = canvas.height;
      const P = { top: 24, bottom: 30 };

      // Vertical crosshair
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(highlight.x, P.top); ctx.lineTo(highlight.x, h - P.bottom); ctx.stroke();
      ctx.setLineDash([]);

      // Dots
      [{ c: '#ef4444', v: highlight.jktDay }, { c: '#10b981', v: highlight.bdgDay },
       { c: '#f59e0b', v: highlight.jktNight }, { c: '#06b6d4', v: highlight.bdgNight }].forEach(({ c, v }) => {
        ctx.beginPath(); ctx.arc(highlight.x, toY(v), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = c; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      });
    }
  }

  private setupChartTooltip(
    _ctx: CanvasRenderingContext2D,
    P: { top: number; right: number; bottom: number; left: number },
    _cH: number,
    yMin: number,
    yMax: number,
    toY: (v: number) => number
  ) {
    if (!this.canvas) return;
    const tooltip = document.getElementById('gee-chart-tooltip');
    if (!tooltip) return;

    const onMove = (e: MouseEvent) => {
      const rect = this.canvas!.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (this.canvas!.width / rect.width);

      let nearest: ChartPoint | null = null;
      let minD = Infinity;
      for (const pt of this.chartPoints) {
        const d = Math.abs(pt.x - mouseX);
        if (d < minD) { minD = d; nearest = pt; }
      }

      const ctx2 = this.canvas!.getContext('2d')!;
      const w = this.canvas!.width, h = this.canvas!.height;
      ctx2.clearRect(0, 0, w, h);

      // Re-draw grid + lines
      ctx2.lineWidth = 1;
      for (let yV = yMin; yV <= yMax; yV += 10) {
        const y = toY(yV);
        ctx2.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx2.beginPath(); ctx2.moveTo(P.left, y); ctx2.lineTo(w - P.right, y); ctx2.stroke();
        ctx2.fillStyle = '#94a3b8'; ctx2.font = '10px Inter, sans-serif';
        ctx2.fillText(`${yV}°C`, 5, y + 3);
      }
      const total = this.chartPoints.length;
      [0, Math.floor(total * 0.33), Math.floor(total * 0.66), total - 1].forEach((idx) => {
        const pt = this.chartPoints[idx]; if (!pt) return;
        ctx2.fillStyle = '#94a3b8'; ctx2.font = '10px Inter, sans-serif';
        ctx2.fillText(pt.date.substring(0, 4), Math.max(P.left, pt.x - 12), h - 8);
      });
      this.drawLines(ctx2, toY, minD < 16 ? nearest : null);

      if (nearest && minD < 16) {
        const isForecast = nearest.isForecast;
        tooltip.innerHTML = `
          <div class="gee-tooltip-header">
            <span class="gee-tooltip-date ${isForecast ? 'is-forecast' : ''}">${nearest.date}</span>
            <span class="gee-tooltip-badge ${isForecast ? 'cfsv2' : 'modis'}">
              ${isForecast ? '🔮 PROYEKSI CFSv2' : '🛰️ OBSERVASI MODIS'}
            </span>
          </div>
          ${isForecast ? '<div class="gee-tooltip-model-note">Model Numerik Iklim (Bukan Observasi Aktual)</div>' : ''}
          <div class="gee-tooltip-grid">
            <span class="gee-tooltip-val-jkt-day">■ JKT Day</span><span>${nearest.jktDay.toFixed(1)}°C</span>
            <span class="gee-tooltip-val-jkt-night">- JKT Night</span><span>${nearest.jktNight.toFixed(1)}°C</span>
            <span class="gee-tooltip-val-bdg-day">■ BDG Day</span><span>${nearest.bdgDay.toFixed(1)}°C</span>
            <span class="gee-tooltip-val-bdg-night">- BDG Night</span><span>${nearest.bdgNight.toFixed(1)}°C</span>
          </div>`;

        const canvasRect = this.canvas!.getBoundingClientRect();
        const scaleX = canvasRect.width / this.canvas!.width;
        const scaleY = canvasRect.height / this.canvas!.height;
        const tipX = nearest.x * scaleX;
        const tipY = toY(nearest.jktDay) * scaleY;
        const tipW = 168;
        tooltip.style.left = `${tipX + 8 + tipW > canvasRect.width ? tipX - tipW - 8 : tipX + 8}px`;
        tooltip.style.top = `${Math.max(0, tipY - 44)}px`;
        tooltip.style.display = 'block';
      } else {
        tooltip.style.display = 'none';
      }
    };

    const onLeave = () => {
      tooltip.style.display = 'none';
      const ctx2 = this.canvas!.getContext('2d')!;
      const w = this.canvas!.width, h = this.canvas!.height;
      ctx2.clearRect(0, 0, w, h);
      for (let yV = yMin; yV <= yMax; yV += 10) {
        const y = toY(yV);
        ctx2.strokeStyle = 'rgba(255,255,255,0.08)'; ctx2.lineWidth = 1;
        ctx2.beginPath(); ctx2.moveTo(P.left, y); ctx2.lineTo(w - P.right, y); ctx2.stroke();
        ctx2.fillStyle = '#94a3b8'; ctx2.font = '10px Inter, sans-serif'; ctx2.fillText(`${yV}°C`, 5, y + 3);
      }
      const total = this.chartPoints.length;
      [0, Math.floor(total * 0.33), Math.floor(total * 0.66), total - 1].forEach((idx) => {
        const pt = this.chartPoints[idx]; if (!pt) return;
        ctx2.fillStyle = '#94a3b8'; ctx2.font = '10px Inter, sans-serif';
        ctx2.fillText(pt.date.substring(0, 4), Math.max(P.left, pt.x - 12), h - 8);
      });
      this.drawLines(ctx2, toY, null);
    };

    // Remove old listeners and re-attach fresh
    this.canvas.removeEventListener('mousemove', onMove);
    this.canvas.removeEventListener('mouseleave', onLeave);
    this.canvas.addEventListener('mousemove', onMove);
    this.canvas.addEventListener('mouseleave', onLeave);
  }

  private updateForecastDisclaimer() {
    const disclaimerEl = document.getElementById('gee-forecast-disclaimer');
    if (!disclaimerEl) return;

    const forecastIdx = this.chartPoints.findIndex((p) => p.isForecast);

    if (forecastIdx !== -1 && forecastIdx > 0) {
      const lastObsPoint = this.chartPoints[forecastIdx - 1];
      const formattedDate = this.formatDateIndonesian(lastObsPoint?.date || '');
      disclaimerEl.style.display = 'block';

      const dateLabel = document.getElementById('gee-forecast-date-label');
      if (dateLabel) {
        dateLabel.textContent = formattedDate;
      } else {
        disclaimerEl.innerHTML = `
          <strong class="gee-forecast-title">📌 Catatan Khusus (Proyeksi Model):</strong> Segmen garis putus-putus setelah <span id="gee-forecast-date-label" class="gee-forecast-date-highlight">${formattedDate}</span> merupakan simulasi model iklim numerik <em>NOAA NCEP CFSv2</em>, bukan observasi satelit aktual.
        `;
      }
    } else if (forecastIdx === 0) {
      disclaimerEl.style.display = 'block';
      disclaimerEl.innerHTML = `
        <strong class="gee-forecast-title">📌 Catatan Khusus (Proyeksi Model):</strong> Seluruh data deret waktu merupakan simulasi model iklim numerik <em>NOAA NCEP CFSv2</em>.
      `;
    } else {
      // Jika semua data observasi riil (tidak ada proyeksi masa depan sama sekali)
      disclaimerEl.style.display = 'none';
    }
  }

  private formatDateIndonesian(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const months = [
          'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        if (y && m >= 1 && m <= 12 && d) {
          return `${d} ${months[m - 1]} ${y}`;
        }
      }
    } catch { /* ignore */ }
    return dateStr;
  }

  private bindAccessibleDataTableEvents() {
    const toggleBtn = document.getElementById('btn-toggle-gee-chart-table');
    const tableContainer = document.getElementById('gee-chart-table-container');
    const canvasContainer = document.querySelector('.gee-chart-container') as HTMLElement;

    if (!toggleBtn || !tableContainer) return;

    toggleBtn.addEventListener('click', () => {
      const isVisible = tableContainer.style.display !== 'none';
      if (isVisible) {
        tableContainer.style.display = 'none';
        if (canvasContainer) canvasContainer.style.display = 'block';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          <span>Tabel Data</span>
        `;
      } else {
        this.renderAccessibleDataTable(tableContainer);
        tableContainer.style.display = 'block';
        if (canvasContainer) canvasContainer.style.display = 'none';
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Grafik</span>
        `;
      }
    });
  }

  private renderAccessibleDataTable(container: HTMLElement) {
    if (!this.chartPoints || this.chartPoints.length === 0) {
      container.innerHTML = '<p class="gee-chart-sub text-center">Data deret waktu belum tersedia.</p>';
      return;
    }

    const rows = this.chartPoints.map((pt) => {
      const formattedDate = this.formatDateIndonesian(pt.date);
      const typeBadge = pt.isForecast 
        ? '<span class="gee-badge-cfsv2-table">CFSv2 Model (2m Air)</span>' 
        : '<span class="gee-badge-modis-table">MODIS LST (Skin)</span>';
      return `
        <tr>
          <td class="cell-date">${formattedDate}</td>
          <td class="cell-jkt-day">${pt.jktDay.toFixed(1)}°C</td>
          <td class="cell-jkt-night">${pt.jktNight.toFixed(1)}°C</td>
          <td class="cell-bdg-day">${pt.bdgDay.toFixed(1)}°C</td>
          <td class="cell-bdg-night">${pt.bdgNight.toFixed(1)}°C</td>
          <td class="cell-type">${typeBadge}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="gee-data-table" aria-label="Tabel Deret Waktu Suhu LST Komposit 8-Harian">
        <thead>
          <tr>
            <th>Tanggal Komposit</th>
            <th class="align-right">JKT Siang</th>
            <th class="align-right">JKT Malam</th>
            <th class="align-right">BDG Siang</th>
            <th class="align-right">BDG Malam</th>
            <th>Tipe Data</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }
}

