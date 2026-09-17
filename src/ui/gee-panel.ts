import { GEELoader } from '../tools/gee-loader';
import { showToast } from './toast';

interface MODISTimeSeriesRecord {
  date: string;
  timestamp_ms: number;
  year?: number;
  month?: number;
  jkt_day_lst_c?: number;
  jkt_night_lst_c?: number;
  bdg_day_lst_c?: number;
  bdg_night_lst_c?: number;
  ikn_day_lst_c?: number;
  ikn_night_lst_c?: number;
  uhi_delta_c?: number;
  // Aliases
  jkt_air_temp_c?: number;
  jkt_surface_temp_c?: number;
  bdg_air_temp_c?: number;
  bdg_surface_temp_c?: number;
  urban_obs_c?: number;
  urban_fitted_c?: number;
  rural_obs_c?: number;
  rural_fitted_c?: number;
}

export class GEEPanelUI {
  private geeLoader: GEELoader;
  private timeSeriesData: MODISTimeSeriesRecord[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private isInitialized: boolean = false;
  private isToggleEventsBound: boolean = false;

  constructor(geeLoader: GEELoader) {
    this.geeLoader = geeLoader;
  }

  public init() {
    this.syncCheckboxStates();

    if (!this.isInitialized) {
      this.bindLayerToggleEvents();
      this.bindOpacityEvents();
      this.bindDownloadEvents();

      this.geeLoader.onLayersChange(() => {
        this.syncCheckboxStates();
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
        showToast('Failed to load MODIS LST data. Please check your network connection.', 'error');
      }, { once: false });

      this.isInitialized = true;
    }

    this.renderTimeSeriesChart();
  }

  private syncCheckboxStates() {
    const dayEl = (document.getElementById('toggle-gee-lst') || document.getElementById('toggle-gee-air')) as HTMLInputElement;
    if (dayEl) dayEl.checked = this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst');

    const nightEl = (document.getElementById('toggle-gee-elevation') || document.getElementById('toggle-gee-surface')) as HTMLInputElement;
    if (nightEl) nightEl.checked = this.geeLoader.isLayerVisible('lst-night') || this.geeLoader.isLayerVisible('elevation');

    const stEl = (document.getElementById('toggle-gee-poi') || document.getElementById('toggle-gee-stations')) as HTMLInputElement;
    if (stEl) stEl.checked = this.geeLoader.isLayerVisible('stations') || this.geeLoader.isLayerVisible('poi');

    const opacitySlider = document.getElementById('gee-opacity-slider') as HTMLInputElement;
    const opacityVal = document.getElementById('gee-opacity-val');
    const pct = Math.round(this.geeLoader.getOpacity() * 100);
    if (opacitySlider) opacitySlider.value = String(pct);
    if (opacityVal) opacityVal.innerText = `${pct}%`;
  }

  private bindOpacityEvents() {
    const slider = document.getElementById('gee-opacity-slider') as HTMLInputElement;
    const valLabel = document.getElementById('gee-opacity-val');
    if (slider) {
      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        if (valLabel) valLabel.innerText = `${val}%`;
        this.geeLoader.setOpacity(val / 100);
      });
    }
  }

  private bindLayerToggleEvents() {
    if (this.isToggleEventsBound) return;

    const attachToggle = (id: string, key: string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) {
        el.addEventListener('change', () => {
          this.geeLoader.toggleLayer(key, el.checked);
        });
      }
    };

    attachToggle('toggle-gee-lst', 'lst-day');
    attachToggle('toggle-gee-air', 'lst-day');

    attachToggle('toggle-gee-elevation', 'lst-night');
    attachToggle('toggle-gee-surface', 'lst-night');

    attachToggle('toggle-gee-poi', 'stations');
    attachToggle('toggle-gee-stations', 'stations');

    const focusBtn = document.getElementById('btn-focus-gee-area');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        this.geeLoader.flyToStudyArea();
      });
    }

    const focusIdnBtn = document.getElementById('btn-focus-gee-indonesia');
    if (focusIdnBtn) {
      focusIdnBtn.addEventListener('click', () => {
        this.geeLoader.flyToIndonesia();
      });
    }

    this.isToggleEventsBound = true;
  }

  private bindDownloadEvents() {
    const btnGeoJSON = document.getElementById('btn-download-geojson');
    const btnCSV = document.getElementById('btn-download-csv');

    if (btnGeoJSON) {
      btnGeoJSON.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/data/gee_cfsv2_stations.geojson';
        link.download = 'modis_lst_stations_indonesia.geojson';
        link.click();
        showToast('Downloading MODIS LST Stations (GeoJSON)...', 'info');
      });
    }

    if (btnCSV) {
      btnCSV.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/downloads/gee_cfsv2_temperature_indonesia.csv';
        link.download = 'modis_lst_seasonal_timeseries_indonesia.csv';
        link.click();
        showToast('Downloading MODIS LST Multi-Year Time Series (CSV)...', 'info');
      });
    }
  }

  public async renderTimeSeriesChart() {
    this.canvas = document.getElementById('gee-chart-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    if (this.canvas.parentElement && this.canvas.parentElement.clientWidth === 0) {
      return;
    }

    if (this.timeSeriesData.length === 0) {
      try {
        const res = await fetch('/data/gee_cfsv2_timeseries.json');
        if (res.ok) {
          const json = await res.json();
          this.timeSeriesData = (json.data as any) || [];
        }
      } catch (e) {
        // Fallback
      }
    }

    if (this.timeSeriesData.length === 0) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = (this.canvas.width = this.canvas.parentElement?.clientWidth || 320);
    const height = (this.canvas.height = 200);

    const padding = { top: 24, right: 15, bottom: 30, left: 35 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Y domain: 10°C to 40°C
    const yMin = 10;
    const yMax = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let yVal = 10; yVal <= 40; yVal += 10) {
      const y = padding.top + chartH - ((yVal - yMin) / (yMax - yMin)) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${yVal}°C`, 5, y + 3);
    }

    const totalCount = this.timeSeriesData.length;
    const xStep = chartW / (totalCount - 1);

    // X Axis Years
    [0, Math.floor(totalCount * 0.33), Math.floor(totalCount * 0.66), totalCount - 1].forEach((idx) => {
      const rec = this.timeSeriesData[idx];
      if (!rec) return;
      const x = padding.left + idx * xStep;
      const yearStr = rec.date.substring(0, 4);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(yearStr, Math.max(padding.left, x - 12), height - 8);
    });

    // 1. Bandung Highland Night LST (Coolest - Cyan line)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const tempVal = rec.bdg_night_lst_c ?? rec.bdg_surface_temp_c ?? 15;
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 2. Bandung Highland Day LST (Green line)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const tempVal = rec.bdg_day_lst_c ?? rec.bdg_air_temp_c ?? 25;
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Jakarta Urban Night LST (Amber dashed)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const tempVal = rec.jkt_night_lst_c ?? rec.jkt_surface_temp_c ?? 24;
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Jakarta Urban Day LST (Red solid line)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const tempVal = rec.jkt_day_lst_c ?? rec.jkt_air_temp_c ?? rec.urban_obs_c ?? 34;
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
