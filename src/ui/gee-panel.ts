import { GEELoader } from '../tools/gee-loader';
import { GEE_MULTI_REGION_DATA, GEE_TIMESERIES_DATA } from '../data/gee-datasets';
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
    this.updateRegionUI();

    if (!this.isInitialized) {
      this.bindRegionEvents();
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

  private bindRegionEvents() {
    const select = document.getElementById('gee-region-select') as HTMLSelectElement;
    if (select) {
      select.value = this.geeLoader.getActiveRegionId();
      select.addEventListener('change', () => {
        const regionId = select.value;
        this.geeLoader.setActiveRegion(regionId, true);
        this.updateRegionUI();
        const conf = this.geeLoader.getActiveRegionConfig();
        showToast(`Wilayah analisis GEE: ${conf.name}`, 'info');
      });
    }

    const focusBtn = document.getElementById('btn-focus-gee-area');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const regionId = select ? select.value : this.geeLoader.getActiveRegionId();
        this.geeLoader.setActiveRegion(regionId, true);
      });
    }
  }

  public updateRegionUI() {
    const conf = this.geeLoader.getActiveRegionConfig();
    const regData = GEE_MULTI_REGION_DATA[conf.id];

    // 1. Update Metrics Cards
    const uVal = document.getElementById('gee-urban-val');
    const uSub = document.getElementById('gee-urban-sub');
    const rVal = document.getElementById('gee-rural-val');
    const rSub = document.getElementById('gee-rural-sub');
    const uhiVal = document.getElementById('gee-uhi-val');
    const subtitle = document.getElementById('gee-chart-subtitle');

    if (uVal) uVal.innerText = `${conf.urban.lst.toFixed(2)} °C`;
    if (uSub) uSub.innerText = `${conf.urban.name} (${conf.urban.elv}m elev)`;
    if (rVal) rVal.innerText = `${conf.rural.lst.toFixed(2)} °C`;
    if (rSub) rSub.innerText = `${conf.rural.name} (${conf.rural.elv}m elev)`;
    if (uhiVal) uhiVal.innerText = `+${conf.delta_lst.toFixed(2)} °C Kontras Termal`;
    if (subtitle) subtitle.innerText = `Pola suhu musiman: ${conf.urban.name} vs ${conf.rural.name}`;

    // 2. Update POI Tags
    const pU = document.getElementById('poi-tag-urban');
    const pR = document.getElementById('poi-tag-rural');
    if (pU) pU.innerText = `🔴 Urban: ${conf.urban.name} (${conf.urban.lst}°C)`;
    if (pR) pR.innerText = `🟢 Rural: ${conf.rural.name} (${conf.rural.lst}°C)`;

    // 3. Update Time Series Data
    if (regData && regData.timeseries) {
      this.timeSeriesData = regData.timeseries;
      this.renderTimeSeriesChart();
    }
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

    this.isToggleEventsBound = true;
  }

  private bindDownloadEvents() {
    const btnGeoJSON = document.getElementById('btn-download-geojson');
    const btnCSV = document.getElementById('btn-download-csv');
    const btnTIFF = document.getElementById('btn-download-geotiff');

    if (btnGeoJSON) {
      btnGeoJSON.addEventListener('click', () => {
        const conf = this.geeLoader.getActiveRegionConfig();
        const regData = GEE_MULTI_REGION_DATA[conf.id];
        const blob = new Blob([JSON.stringify(regData.poi, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `gee_${conf.id}_urban_rural_poi.geojson`;
        link.click();
        showToast(`Mengunduh dataset POI Stasiun Observasi (${conf.name})...`, 'info');
      });
    }

    if (btnCSV) {
      btnCSV.addEventListener('click', () => {
        const conf = this.geeLoader.getActiveRegionConfig();
        const regData = GEE_MULTI_REGION_DATA[conf.id];
        const rows = (regData.timeseries || []).map((t: any) =>
          `${t.date},${t.timestamp_ms},${t.urban_obs_c},${t.urban_fitted_c},${t.rural_obs_c},${t.rural_fitted_c},${t.uhi_delta_c}`
        );
        const csvContent = 'Date,Timestamp_MS,Urban_LST_Observed_C,Urban_LST_Fitted_C,Rural_LST_Observed_C,Rural_LST_Fitted_C,UHI_Delta_C\n' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `gee_lst_timeseries_${conf.id}.csv`;
        link.click();
        showToast(`Mengunduh data deret waktu suhu LST (${conf.name})...`, 'info');
      });
    }

    if (btnTIFF) {
      btnTIFF.addEventListener('click', () => {
        const conf = this.geeLoader.getActiveRegionConfig();
        const logText = `GEE Export Task Completed: elevation_lst_${conf.id}_indonesia
Region: ${conf.name} (${conf.island})
Center: [${conf.center[0]}, ${conf.center[1]}]
Urban Core POI: ${conf.urban.name} (LST: ${conf.urban.lst}°C, Elevation: ${conf.urban.elv}m)
Rural Baseline POI: ${conf.rural.name} (LST: ${conf.rural.lst}°C, Elevation: ${conf.rural.elv}m)
UHI Thermal Delta: +${conf.delta_lst}°C
Sensor Collection: MODIS/061/MOD11A1 & USGS/SRTMGL1_003
CRS: EPSG:4326 (WGS84)
Export Timestamp: ${new Date().toISOString()}
Status: COMPLETED
`;
        const blob = new Blob([logText], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `elevation_lst_${conf.id}_export_log.txt`;
        link.click();
        showToast(`Mengunduh log metadata & spesifikasi ekspor (${conf.name})...`, 'info');
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
      ctx.fillStyle = 'rgba(220, 38, 38, 0.4)';
      ctx.beginPath();
      ctx.arc(x, yU, 2.5, 0, 2 * Math.PI);
      ctx.fill();

      // Rural point
      const yR = padding.top + chartH - ((rec.rural_obs_c - yMin) / (yMax - yMin)) * chartH;
      ctx.fillStyle = 'rgba(22, 163, 74, 0.4)';
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
