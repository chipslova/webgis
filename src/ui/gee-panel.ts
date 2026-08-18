import { GEELoader } from '../tools/gee-loader';

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
  private timeSeriesData: TimeSeriesRecord[] = [];
  private canvas: HTMLCanvasElement | null = null;

  constructor(geeLoader: GEELoader) {
    this.geeLoader = geeLoader;
  }

  public async init() {
    this.bindLayerToggleEvents();
    this.bindDownloadEvents();

    try {
      const res = await fetch('/data/gee_lst_timeseries.json');
      const payload = await res.json();
      this.timeSeriesData = payload.data || [];
      this.renderTimeSeriesChart();
    } catch (err) {
      console.warn('Failed loading LST time-series JSON:', err);
    }
  }

  private bindLayerToggleEvents() {
    const lstToggle = document.getElementById('toggle-gee-lst') as HTMLInputElement;
    const elvToggle = document.getElementById('toggle-gee-elevation') as HTMLInputElement;
    const lcToggle = document.getElementById('toggle-gee-landcover') as HTMLInputElement;
    const poiToggle = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    const focusBtn = document.getElementById('btn-focus-gee-area');

    if (lstToggle) {
      lstToggle.addEventListener('change', (e) => {
        this.geeLoader.toggleLayer('lst', (e.target as HTMLInputElement).checked);
      });
    }

    if (elvToggle) {
      elvToggle.addEventListener('change', (e) => {
        this.geeLoader.toggleLayer('elevation', (e.target as HTMLInputElement).checked);
      });
    }

    if (lcToggle) {
      lcToggle.addEventListener('change', (e) => {
        this.geeLoader.toggleLayer('landcover', (e.target as HTMLInputElement).checked);
      });
    }

    if (poiToggle) {
      poiToggle.addEventListener('change', (e) => {
        this.geeLoader.toggleLayer('poi', (e.target as HTMLInputElement).checked);
      });
    }

    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        this.geeLoader.flyToStudyArea();
      });
    }
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
      });
    }

    if (btnCSV) {
      btnCSV.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/downloads/gee_lst_timeseries_jakarta.csv';
        link.download = 'gee_lst_timeseries_jakarta.csv';
        link.click();
      });
    }

    if (btnTIFF) {
      btnTIFF.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/downloads/my_export_jakarta_elevation.geotiff.txt';
        link.download = 'elevation_near_jakarta_export_log.txt';
        link.click();
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
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let yVal = 20; yVal <= 40; yVal += 10) {
      const y = padding.top + chartH - ((yVal - yMin) / (yMax - yMin)) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${yVal}°C`, 5, y + 3);
    }

    // X Axis Labels (2020, 2022, 2024, 2026)
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
      ctx.fillStyle = 'rgba(220, 38, 38, 0.4)'; // Red scatter
      ctx.beginPath();
      ctx.arc(x, yU, 2.5, 0, 2 * Math.PI);
      ctx.fill();

      // Rural point
      const yR = padding.top + chartH - ((rec.rural_obs_c - yMin) / (yMax - yMin)) * chartH;
      ctx.fillStyle = 'rgba(22, 163, 74, 0.4)'; // Green scatter
      ctx.beginPath();
      ctx.arc(x, yR, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 2. Draw Fitted Curve - Urban (Red line)
    ctx.strokeStyle = '#dc2626';
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
    ctx.strokeStyle = '#16a34a';
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
