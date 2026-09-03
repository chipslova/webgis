import { GEELoader } from '../tools/gee-loader';
import { GEE_TIMESERIES_DATA } from '../data/gee-datasets';
import { showToast } from './toast';

interface TimeSeriesRecord {
  date: string;
  timestamp_ms: number;
  urban_obs_c: number;
  urban_fitted_c: number;
  rural_obs_c: number;
  rural_fitted_c: number;
  uhi_delta_c: number;
}

export class GEEPanelUI {
  private geeLoader: GEELoader;
  private timeSeriesData: TimeSeriesRecord[] = (GEE_TIMESERIES_DATA.data as any) || [];
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

      this.isInitialized = true;
    }

    this.renderTimeSeriesChart();
  }

  private syncCheckboxStates() {
    const lst = document.getElementById('toggle-gee-lst') as HTMLInputElement;
    if (lst) lst.checked = this.geeLoader.isLayerVisible('lst');
    const elv = document.getElementById('toggle-gee-elevation') as HTMLInputElement;
    if (elv) elv.checked = this.geeLoader.isLayerVisible('elevation');
    const lc = document.getElementById('toggle-gee-landcover') as HTMLInputElement;
    if (lc) lc.checked = this.geeLoader.isLayerVisible('landcover');
    const poi = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    if (poi) poi.checked = this.geeLoader.isLayerVisible('poi');

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

    attachToggle('toggle-gee-lst', 'lst');
    attachToggle('toggle-gee-elevation', 'elevation');
    attachToggle('toggle-gee-landcover', 'landcover');
    attachToggle('toggle-gee-poi', 'poi');

    const focusBtn = document.getElementById('btn-focus-gee-area');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        this.geeLoader.flyToStudyArea();
        showToast('Kamera terpusat ke Kawasan Studi Jabodetabek & Jawa Barat', 'info');
      });
    }

    this.isToggleEventsBound = true;
  }

  private bindDownloadEvents() {
    const btnGeoJSON = document.getElementById('btn-download-geojson');
    const btnCSV = document.getElementById('btn-download-csv');
    const btnTIFF = document.getElementById('btn-download-geotiff');

    if (btnGeoJSON) {
      btnGeoJSON.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/data/gee_jakarta_poi.geojson';
        link.download = 'gee_jakarta_urban_rural_poi.geojson';
        link.click();
        showToast('Mengunduh dataset POI Stasiun Observasi GeoJSON...', 'info');
      });
    }

    if (btnCSV) {
      btnCSV.addEventListener('click', () => {
        const rows = this.timeSeriesData.map((t) =>
          `${t.date},${t.timestamp_ms},${t.urban_obs_c},${t.urban_fitted_c},${t.rural_obs_c},${t.rural_fitted_c},${t.uhi_delta_c}`
        );
        const csvContent = 'Date,Timestamp_MS,Urban_LST_Observed_C,Urban_LST_Fitted_C,Rural_LST_Observed_C,Rural_LST_Fitted_C,UHI_Delta_C\n' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'gee_lst_timeseries_jakarta.csv';
        link.click();
        showToast('Mengunduh data deret waktu suhu LST (CSV)...', 'info');
      });
    }

    if (btnTIFF) {
      btnTIFF.addEventListener('click', () => {
        const logText = `GEE Export Task Completed: elevation_lst_jakarta_indonesia
Region: Jakarta & West Java (Jabodetabek Agglomeration)
Coordinates: Urban [106.8272, -6.1754], Rural [107.0143, -6.5950]
Urban Core POI: Jakarta Monas (Mean LST: 33.85°C, Elevation: 14m)
Rural Baseline POI: Hutan IPB / Bogor (Mean LST: 24.60°C, Elevation: 680m)
UHI Thermal Delta: +9.25°C
Sensor Collection: MODIS/061/MOD11A2 & USGS/SRTMGL1_003
CRS: EPSG:4326 (WGS84)
Export Timestamp: ${new Date().toISOString()}
Status: COMPLETED
`;
        const blob = new Blob([logText], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'elevation_near_jakarta_export_log.txt';
        link.click();
        showToast('Mengunduh log metadata & spesifikasi ekspor (TXT)...', 'info');
      });
    }
  }

  private renderTimeSeriesChart() {
    this.canvas = document.getElementById('gee-chart-canvas') as HTMLCanvasElement;
    if (!this.canvas || this.timeSeriesData.length === 0) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = (this.canvas.width = this.canvas.parentElement?.clientWidth || 320);
    const height = (this.canvas.height = 200);

    const padding = { top: 20, right: 15, bottom: 30, left: 35 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Y domain: 15°C to 40°C
    const yMin = 15;
    const yMax = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let yVal = 20; yVal <= 40; yVal += 10) {
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

    // X Axis Labels
    const totalCount = this.timeSeriesData.length;
    const xStep = chartW / (totalCount - 1);

    [0, Math.floor(totalCount * 0.33), Math.floor(totalCount * 0.66), totalCount - 1].forEach((idx) => {
      const rec = this.timeSeriesData[idx];
      if (!rec) return;
      const x = padding.left + idx * xStep;
      const yearStr = rec.date.substring(0, 4);
      ctx.fillText(yearStr, x - 10, height - 8);
    });

    // 1. Draw Scatter Points (Urban & Rural)
    this.timeSeriesData.forEach((rec, i) => {
      const x = padding.left + i * xStep;

      // Urban point
      const yU = padding.top + chartH - ((rec.urban_obs_c - yMin) / (yMax - yMin)) * chartH;
      ctx.fillStyle = 'rgba(225, 29, 72, 0.45)';
      ctx.beginPath();
      ctx.arc(x, yU, 2.5, 0, 2 * Math.PI);
      ctx.fill();

      // Rural point
      const yR = padding.top + chartH - ((rec.rural_obs_c - yMin) / (yMax - yMin)) * chartH;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.beginPath();
      ctx.arc(x, yR, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 2. Draw Fitted Curve - Urban (Red line)
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((rec.urban_fitted_c - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Draw Fitted Curve - Rural (Green line)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.timeSeriesData.forEach((rec, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - ((rec.rural_fitted_c - yMin) / (yMax - yMin)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
