import { GEELoader } from '../tools/gee-loader';
import { showToast } from './toast';

interface CFSV2TimeSeriesRecord {
  date: string;
  iso?: string;
  timestamp_ms: number;
  hour_utc?: number;
  is_forecast?: boolean;
  jkt_air_temp_c?: number;
  jkt_surface_temp_c?: number;
  bdg_air_temp_c?: number;
  bdg_surface_temp_c?: number;
  ikn_air_temp_c?: number;
  delta_urban_rural_c?: number;
  // Compatibility
  urban_obs_c?: number;
  urban_fitted_c?: number;
  rural_obs_c?: number;
  rural_fitted_c?: number;
}

export class GEEPanelUI {
  private geeLoader: GEELoader;
  private timeSeriesData: CFSV2TimeSeriesRecord[] = [];
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

      // Listen to geeLoader state changes
      this.geeLoader.onLayersChange(() => {
        this.syncCheckboxStates();
      });

      const map = this.geeLoader.getMap();
      if (map) {
        map.on('style.load', () => {
          this.syncCheckboxStates();
        });
      }

      // Re-render chart on window resize
      window.addEventListener('resize', () => {
        this.renderTimeSeriesChart();
      });

      // Listen for GEE data load failures
      window.addEventListener('gee-load-error', () => {
        showToast('Failed to load NOAA CFSV2 GEE data. Please check your network connection.', 'error');
      }, { once: false });

      this.isInitialized = true;
    }

    this.renderTimeSeriesChart();
  }

  private syncCheckboxStates() {
    // Air temp / LST
    const airEl = (document.getElementById('toggle-gee-air') || document.getElementById('toggle-gee-lst')) as HTMLInputElement;
    if (airEl) airEl.checked = this.geeLoader.isLayerVisible('air-temp') || this.geeLoader.isLayerVisible('lst');

    // Surface temp / Elevation
    const surfEl = (document.getElementById('toggle-gee-surface') || document.getElementById('toggle-gee-elevation')) as HTMLInputElement;
    if (surfEl) surfEl.checked = this.geeLoader.isLayerVisible('surface-temp') || this.geeLoader.isLayerVisible('elevation');

    // Stations / POI
    const stEl = (document.getElementById('toggle-gee-stations') || document.getElementById('toggle-gee-poi')) as HTMLInputElement;
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

    // Support both new CFSV2 IDs and legacy IDs
    attachToggle('toggle-gee-air', 'air-temp');
    attachToggle('toggle-gee-lst', 'air-temp');

    attachToggle('toggle-gee-surface', 'surface-temp');
    attachToggle('toggle-gee-elevation', 'surface-temp');

    attachToggle('toggle-gee-stations', 'stations');
    attachToggle('toggle-gee-poi', 'stations');

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
        link.download = 'gee_cfsv2_climate_stations_indonesia.geojson';
        link.click();
        showToast('Downloading NOAA CFSV2 Climate Stations (GeoJSON)...', 'info');
      });
    }

    if (btnCSV) {
      btnCSV.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/downloads/gee_cfsv2_temperature_indonesia.csv';
        link.download = 'gee_cfsv2_temperature_indonesia.csv';
        link.click();
        showToast('Downloading NOAA CFSV2 6-Hourly Temperature (CSV)...', 'info');
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
        // Silently handle offline/mock test environments
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

    // Y domain: 15°C to 40°C
    const yMin = 15;
    const yMax = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let yVal = 15; yVal <= 40; yVal += 5) {
      const y = padding.top + chartH - ((yVal - yMin) / (yMax - yMin)) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${yVal}°C`, 5, y + 3);
    }

    const totalCount = this.timeSeriesData.length;
    const xStep = chartW / (totalCount - 1);

    // Draw X-axis timestamps
    [0, Math.floor(totalCount * 0.33), Math.floor(totalCount * 0.66), totalCount - 1].forEach((idx) => {
      const rec = this.timeSeriesData[idx];
      if (!rec) return;
      const x = padding.left + idx * xStep;
      const datePart = rec.date.substring(5, 10);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(datePart, Math.max(padding.left, x - 12), height - 8);
    });

    // 1. Draw Bandung Highland (Cooler - Green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const tempVal = rec.bdg_air_temp_c ?? rec.rural_obs_c ?? 22;
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 2. Draw IKN Nusantara (Purple)
    if (this.timeSeriesData[0]?.ikn_air_temp_c !== undefined) {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.timeSeriesData.forEach((rec, i) => {
        const tempVal = rec.ikn_air_temp_c ?? 28;
        const x = padding.left + i * xStep;
        const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // 3. Draw Jakarta Urban 2m Air Temp (Red/Orange)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const tempVal = rec.jkt_air_temp_c ?? rec.urban_obs_c ?? 32;
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 4. Draw Jakarta Surface Skin Temp (Dashed Orange)
    if (this.timeSeriesData[0]?.jkt_surface_temp_c !== undefined) {
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      this.timeSeriesData.forEach((rec, i) => {
        const tempVal = rec.jkt_surface_temp_c ?? 34;
        const x = padding.left + i * xStep;
        const y = padding.top + chartH - ((tempVal - yMin) / (yMax - yMin)) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]); // Reset
    }
  }
}
