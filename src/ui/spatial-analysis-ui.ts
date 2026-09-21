import * as maplibregl from 'maplibre-gl';
import {
  SpatialAnalysisEngine,
  PRESET_REGIONS,
  ZonalAnalysisResult
} from '../tools/spatial-analysis';
import { polygon } from '@turf/helpers';
import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';

export class SpatialAnalysisUI {
  private map: maplibregl.Map;
  private containerId: string;
  private activeResult: ZonalAnalysisResult | null = null;
  private isDrawingAOI: boolean = false;
  private drawnPoints: [number, number][] = [];
  private onResultChangeCallbacks: Array<(res: ZonalAnalysisResult) => void> = [];
  private _boundMouseMove: ((e: any) => void) | null = null;

  constructor(map: maplibregl.Map, containerId: string = 'spatial-analysis-panel') {
    this.map = map;
    this.containerId = containerId;
  }

  public init() {
    this.initMapLayers();
    this.bindEvents();
    this.render();
  }

  private initMapLayers() {
    if (!this.map || !this.map.getStyle()) return;

    // AOI polygon fill & outline
    if (!this.map.getSource('aoi-analysis-source')) {
      this.map.addSource('aoi-analysis-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      this.map.addLayer({
        id: 'aoi-analysis-fill',
        type: 'fill',
        source: 'aoi-analysis-source',
        paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.25 }
      });

      this.map.addLayer({
        id: 'aoi-analysis-line',
        type: 'line',
        source: 'aoi-analysis-source',
        paint: { 'line-color': '#00f0ff', 'line-width': 2.5, 'line-dasharray': [3, 2] }
      });
    }

    // Vertex dots source
    if (!this.map.getSource('aoi-vertices-source')) {
      this.map.addSource('aoi-vertices-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      this.map.addLayer({
        id: 'aoi-vertices-layer',
        type: 'circle',
        source: 'aoi-vertices-source',
        paint: {
          'circle-radius': 5,
          'circle-color': '#00f0ff',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5
        }
      });
    }

    // Rubber-band preview line source
    if (!this.map.getSource('aoi-rubberband-source')) {
      this.map.addSource('aoi-rubberband-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      this.map.addLayer({
        id: 'aoi-rubberband-layer',
        type: 'line',
        source: 'aoi-rubberband-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.5,
          'line-opacity': 0.6,
          'line-dasharray': [4, 3]
        }
      });
    }
  }

  public bindEvents() {
    // Map click during custom AOI drawing
    this.map.on('click', (e) => {
      if (!this.isDrawingAOI) return;
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      this.drawnPoints.push(pt);
      this.updateDrawingVisuals();
      this.updateDrawStatus();
    });

    this.map.on('dblclick', (e) => {
      if (this.isDrawingAOI && this.drawnPoints.length >= 3) {
        e.preventDefault();
        this.finishDrawing();
      }
    });

    // Floating Drawing Pill Actions
    document.getElementById('btn-pill-undo')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.undoLastPoint();
    });
    document.getElementById('btn-pill-cancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.cancelDrawing();
    });
    document.getElementById('btn-pill-finish')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.finishDrawing();
    });
  }

  public startDrawing() {
    this.isDrawingAOI = true;
    this.drawnPoints = [];
    this.updateDrawingVisuals();

    document.body.classList.add('aoi-drawing-active');

    // Close any active point inspector so it doesn't obstruct drawing
    const inspectorCard = document.getElementById('floating-inspector-card');
    if (inspectorCard) {
      inspectorCard.classList.remove('active');
    }

    this.map.getCanvas().style.cursor = 'crosshair';
    showToast('Klik titik-titik pada peta untuk membentuk area analisis (AOI). Klik-Ganda untuk selesai.', 'info');
    announceToScreenReader('Mode menggambar area analisis aktif. Klik peta untuk membuat poligon.');

    // Auto-collapse sidebar so user has full unobstructed view of the map
    window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-for-drawing'));
    this.showFloatingDrawingPill();

    const drawBtn = document.getElementById('btn-start-draw-aoi');
    const finishBtn = document.getElementById('btn-finish-draw-aoi');
    const cancelBtn = document.getElementById('btn-cancel-draw-aoi');
    const undoBtn = document.getElementById('btn-undo-draw-aoi');
    const statusEl = document.getElementById('aoi-draw-status');

    if (drawBtn) drawBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'inline-flex';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (undoBtn) undoBtn.style.display = 'inline-flex';
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '🎯 <strong>Klik pada peta</strong> untuk membuat simpul batas wilayah analisis...';
    }

    // Start rubber-band tracking
    this._boundMouseMove = (e: any) => this.updateRubberband(e.lngLat);
    this.map.on('mousemove', this._boundMouseMove);
  }

  public finishDrawing() {
    if (this.drawnPoints.length < 3) {
      showToast('Minimal 3 titik koordinat diperlukan untuk membentuk poligon analisis!', 'warning');
      return;
    }

    const ring = [...this.drawnPoints, this.drawnPoints[0]];
    const polyFeature = polygon([ring]);

    this.isDrawingAOI = false;
    document.body.classList.remove('aoi-drawing-active');
    this.map.getCanvas().style.cursor = '';
    this.stopRubberband();
    this.clearAuxLayers();
    this.hideFloatingDrawingPill();

    // Restore sidebar so user sees the analysis result card
    window.dispatchEvent(new CustomEvent('webgis:restore-sidebar-after-drawing'));

    const drawBtn = document.getElementById('btn-start-draw-aoi');
    const finishBtn = document.getElementById('btn-finish-draw-aoi');
    const cancelBtn = document.getElementById('btn-cancel-draw-aoi');
    const undoBtn = document.getElementById('btn-undo-draw-aoi');
    const statusEl = document.getElementById('aoi-draw-status');

    if (drawBtn) drawBtn.style.display = 'inline-flex';
    if (finishBtn) finishBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (undoBtn) undoBtn.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';

    this.analyzeFeature(polyFeature, `Area Kustom (${this.drawnPoints.length} Simpul)`);
  }

  public cancelDrawing() {
    this.isDrawingAOI = false;
    document.body.classList.remove('aoi-drawing-active');
    this.drawnPoints = [];
    this.updateDrawingVisuals();
    this.map.getCanvas().style.cursor = '';
    this.stopRubberband();
    this.clearAuxLayers();
    this.hideFloatingDrawingPill();

    // Restore sidebar
    window.dispatchEvent(new CustomEvent('webgis:restore-sidebar-after-drawing'));

    const drawBtn = document.getElementById('btn-start-draw-aoi');
    const finishBtn = document.getElementById('btn-finish-draw-aoi');
    const cancelBtn = document.getElementById('btn-cancel-draw-aoi');
    const undoBtn = document.getElementById('btn-undo-draw-aoi');
    const statusEl = document.getElementById('aoi-draw-status');

    if (drawBtn) drawBtn.style.display = 'inline-flex';
    if (finishBtn) finishBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (undoBtn) undoBtn.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';

    showToast('Pembuatan area analisis dibatalkan', 'info');
  }

  public undoLastPoint() {
    if (!this.isDrawingAOI || this.drawnPoints.length === 0) return;
    this.drawnPoints.pop();
    this.updateDrawingVisuals();
    this.updateDrawStatus();
    showToast('Titik terakhir dihapus', 'info');
  }

  private showFloatingDrawingPill() {
    const pill = document.getElementById('aoi-floating-pill');
    if (pill) {
      pill.style.display = 'flex';
      this.updateFloatingDrawingPill();
    }
  }

  private hideFloatingDrawingPill() {
    const pill = document.getElementById('aoi-floating-pill');
    if (pill) {
      pill.style.display = 'none';
    }
  }

  private updateFloatingDrawingPill() {
    const statusText = document.getElementById('aoi-pill-status-text');
    if (!statusText) return;
    const n = this.drawnPoints.length;
    if (n === 0) {
      statusText.innerHTML = '🎯 <strong>Mode Gambar AOI:</strong> Klik peta untuk simpul batas...';
    } else if (n < 3) {
      statusText.innerHTML = `📍 <strong>${n} Simpul:</strong> Butuh minimal ${3 - n} titik lagi...`;
    } else {
      statusText.innerHTML = `✅ <strong>${n} Simpul:</strong> Klik-ganda atau tekan <strong>Selesai</strong>`;
    }
  }

  private updateDrawStatus() {
    this.updateFloatingDrawingPill();
    const statusEl = document.getElementById('aoi-draw-status');
    if (!statusEl) return;
    const n = this.drawnPoints.length;
    if (n === 0) {
      statusEl.innerHTML = '🎯 <strong>Klik pada peta</strong> untuk membuat simpul batas wilayah analisis...';
    } else if (n < 3) {
      statusEl.innerHTML = `📍 <strong>${n} Titik</strong> ditandai. Butuh minimal ${3 - n} lagi.`;
    } else {
      statusEl.innerHTML = `✅ <strong>${n} Titik Ditandai.</strong> Klik ganda atau tekan <strong>Selesai</strong>.`;
    }
  }

  private updateRubberband(lngLat: { lng: number; lat: number }) {
    if (!this.isDrawingAOI || this.drawnPoints.length === 0) return;
    const lastPt = this.drawnPoints[this.drawnPoints.length - 1];
    const src = this.map.getSource('aoi-rubberband-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [lastPt, [lngLat.lng, lngLat.lat]]
        },
        properties: {}
      });
    }
  }

  private stopRubberband() {
    if (this._boundMouseMove) {
      this.map.off('mousemove', this._boundMouseMove);
      this._boundMouseMove = null;
    }
    const src = this.map.getSource('aoi-rubberband-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  private clearAuxLayers() {
    const vSrc = this.map.getSource('aoi-vertices-source') as maplibregl.GeoJSONSource;
    if (vSrc && typeof vSrc.setData === 'function') {
      vSrc.setData({ type: 'FeatureCollection', features: [] });
    }
    this.stopRubberband();
  }

  private updateDrawingVisuals() {
    const src = this.map.getSource('aoi-analysis-source') as maplibregl.GeoJSONSource;
    if (!src || typeof src.setData !== 'function') return;

    if (this.drawnPoints.length >= 3) {
      const ring = [...this.drawnPoints, this.drawnPoints[0]];
      src.setData(polygon([ring]));
    } else {
      src.setData({ type: 'FeatureCollection', features: [] });
    }

    // Update vertex dots
    const vSrc = this.map.getSource('aoi-vertices-source') as maplibregl.GeoJSONSource;
    if (vSrc && typeof vSrc.setData === 'function') {
      vSrc.setData({
        type: 'FeatureCollection',
        features: this.drawnPoints.map(([lng, lat]) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {}
        }))
      });
    }
  }

  public selectPresetRegion(presetId: string) {
    const preset = PRESET_REGIONS.find((p) => p.id === presetId);
    if (!preset) return;

    this.map.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      duration: 1200
    });

    const polyFeature = polygon(preset.coordinates);
    const src = this.map.getSource('aoi-analysis-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData(polyFeature);
    }

    this.analyzeFeature(polyFeature, preset.name);
  }

  public async analyzeFeature(
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    label: string
  ) {
    const container = document.getElementById('aoi-analysis-results-container');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px 12px; background: rgba(0, 0, 0, 0.25); border-radius: 6px; border: 1px dashed rgba(56, 189, 248, 0.35);">
          <div class="hud-spinner" style="margin: 0 auto 10px auto; width: 22px; height: 22px; border-width: 2px; border-color: rgba(56, 189, 248, 0.3); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="font-size: 11.5px; font-weight: 600; color: #38bdf8;">Menganalisis Piksel Satelit & Suhu Permukaan...</div>
          <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 4px;">Memproses data raster Sentinel-2 10m LULC &amp; Open-Meteo Live LST...</div>
        </div>
      `;
    }

    const result = await SpatialAnalysisEngine.computeZonalStatsWithGEE(feature, label);
    this.activeResult = result;

    this.renderResult(result);
    if (result.isRealGEE) {
      showToast(`Analisis piksel real GEE selesai untuk ${label} (${result.totalPixelCount?.toLocaleString('id-ID')} piksel)`, 'success');
    } else if (result.isClientSampled) {
      showToast(`Sampling piksel Sentinel-2 10m selesai untuk ${label} (${result.totalPixelCount?.toLocaleString('id-ID')} piksel)`, 'success');
    } else {
      showToast(`Estimator spasial selesai untuk ${label}`, 'success');
    }
    announceToScreenReader(`Analisis spasial selesai. Luas wilayah ${result.totalAreaKm2} kilometer persegi.`);

    this.onResultChangeCallbacks.forEach(cb => cb(result));
  }

  public onResultChange(callback: (res: ZonalAnalysisResult) => void) {
    this.onResultChangeCallbacks.push(callback);
  }

  public render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="spatial-analysis-card" style="background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">📊</span>
            <span style="font-weight: 600; font-size: 12.5px; color: #fff;">Analisis Spasial Zonal (Sentinel-2 &amp; LST)</span>
          </div>
          <span style="font-size: 9.5px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
            100% Free &amp; Open
          </span>
        </div>

        <p style="font-size: 10.5px; color: var(--text-muted); line-height: 1.4; margin-bottom: 12px;">
          Analisis komposisi tutupan lahan dan statistik termal berbasis pembacaan piksel satelit Sentinel-2 10m &amp; suhu permukaan tanah Open-Meteo realtime.
        </p>

        <!-- 1. Selection & Drawing Controls -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-start-draw-aoi" class="btn btn-primary" style="font-size: 10.5px; padding: 6px 8px; justify-content: center; gap: 4px;">
              ✏️ Gambar AOI Bebas
            </button>
            <button id="btn-finish-draw-aoi" class="btn btn-success" style="font-size: 10.5px; padding: 6px 8px; justify-content: center; display: none; background: #10b981; color: #fff;">
              ✅ Selesai Gambar
            </button>
            <button id="btn-undo-draw-aoi" class="btn btn-secondary" style="font-size: 10.5px; padding: 6px 8px; justify-content: center; display: none;">
              ↩ Hapus Titik
            </button>
            <button id="btn-cancel-draw-aoi" class="btn btn-secondary" style="font-size: 10.5px; padding: 6px 8px; justify-content: center; display: none;">
              ❌ Batal
            </button>
            <select id="select-preset-aoi" class="form-select" style="font-size: 10.5px; padding: 5px 6px; background: #0f172a; color: #fff; border: 1px solid var(--border-color); border-radius: 4px;">
              <option value="" disabled selected>📍 Pilih Wilayah Prioritas...</option>
              ${PRESET_REGIONS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>

          <div id="aoi-draw-status" style="display: none; font-size: 10px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 6px 8px; border-radius: 4px; border: 1px dashed rgba(56, 189, 248, 0.4);"></div>
        </div>

        <!-- 2. Results Container -->
        <div id="aoi-analysis-results-container">
          <div style="text-align: center; padding: 22px 14px; border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(0, 0, 0, 0.25);">
            <div style="font-size: 28px; margin-bottom: 6px;">📐</div>
            <div style="font-size: 12.5px; font-weight: 600; color: #e2e8f0;">Belum Ada Area Analisis yang Dipilih</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; line-height: 1.45;">
              Gunakan tombol <strong>Gambar AOI Bebas</strong> atau pilih preset wilayah untuk memproses statistik spasial.
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindUIEvents();
    this.bindModalEvents();
  }

  private bindModalEvents() {
    const modal = document.getElementById('modal-gee-setup');
    const closeBtn = document.getElementById('btn-close-gee-modal');
    const doneBtn = document.getElementById('btn-done-gee-modal');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  private bindUIEvents() {
    document.getElementById('btn-start-draw-aoi')?.addEventListener('click', () => this.startDrawing());
    document.getElementById('btn-finish-draw-aoi')?.addEventListener('click', () => this.finishDrawing());
    document.getElementById('btn-cancel-draw-aoi')?.addEventListener('click', () => this.cancelDrawing());
    document.getElementById('btn-undo-draw-aoi')?.addEventListener('click', () => this.undoLastPoint());

    const presetSelect = document.getElementById('select-preset-aoi') as HTMLSelectElement;
    presetSelect?.addEventListener('change', () => {
      if (presetSelect.value) this.selectPresetRegion(presetSelect.value);
    });
  }

  private renderResult(res: ZonalAnalysisResult) {
    const container = document.getElementById('aoi-analysis-results-container');
    if (!container) return;

    const uhiRiskBadge = res.thermalStats.hotspotPercentage > 40
      ? '<span style="background: rgba(239, 68, 68, 0.25); color: #f87171; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid rgba(239, 68, 68, 0.45); white-space: nowrap; display: inline-block;">Tinggi (UHI Kritis)</span>'
      : res.thermalStats.hotspotPercentage > 20
      ? '<span style="background: rgba(245, 158, 11, 0.25); color: #fbbf24; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid rgba(245, 158, 11, 0.45); white-space: nowrap; display: inline-block;">Sedang</span>'
      : '<span style="background: rgba(16, 185, 129, 0.25); color: #34d399; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid rgba(16, 185, 129, 0.45); white-space: nowrap; display: inline-block;">Rendah / Sejuk</span>';

    const dominantItem = res.landCoverBreakdown.length > 0 ? res.landCoverBreakdown[0] : null;
    const dominantName = dominantItem ? dominantItem.nameId : (res.dominantClass.split('(')[0].trim() || 'Vegetasi');
    const dominantPct = dominantItem ? dominantItem.percentage : (res.dominantClass.match(/\(([\d.]+)%\)/)?.[1] || '');

    container.innerHTML = `
      <div style="background: rgba(10, 15, 30, 0.7); border-radius: 8px; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);">
        <!-- Region Title Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px;">
          <div style="min-width: 0; flex: 1;">
            <div style="font-size: 13px; font-weight: 700; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${res.regionName}">
              ${res.regionName}
            </div>
            <div style="font-size: 9px; color: var(--text-muted); margin-top: 1px;">
              Dianalisis: ${res.timestamp}
            </div>
          </div>
          <button id="btn-export-aoi-csv" class="btn btn-secondary" style="font-size: 9.5px; font-weight: 600; padding: 3px 7px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap;">
            📥 Unduh CSV
          </button>
        </div>

        ${res.isRealGEE ? `
        <!-- Real GEE Verified Banner -->
        <div role="note" aria-label="Verifikasi Piksel Asli GEE" style="
          margin-bottom: 6px;
          padding: 6px 8px;
          background: rgba(16, 185, 129, 0.14);
          border: 1px solid rgba(16, 185, 129, 0.45);
          border-left: 3px solid #10b981;
          border-radius: 6px;
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
            <div style="display: flex; align-items: center; gap: 5px; min-width: 0;">
              <span style="font-size: 13px; line-height: 1;">⚡</span>
              <span style="font-size: 11px; font-weight: 700; color: #34d399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                Piksel Asli Earth Engine
              </span>
            </div>
            <span style="font-size: 8px; font-weight: 700; color: #34d399; background: rgba(16, 185, 129, 0.2); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(16, 185, 129, 0.4); white-space: nowrap;">
              CLOUD
            </span>
          </div>
          <div style="font-size: 9.5px; color: #d1fae5; line-height: 1.35;">
            Reduksi superkomputer Google: <strong>${res.totalPixelCount?.toLocaleString('id-ID') || '-'} piksel</strong> (MODIS LST &amp; ESA WorldCover).
          </div>
        </div>` : res.isClientSampled ? `
        <!-- Real Client-Side Sentinel-2 10m Pixel Sampling Banner (100% Free) -->
        <div role="note" aria-label="Verifikasi Sampling Piksel Sentinel-2 10m" style="
          margin-bottom: 6px;
          padding: 6px 8px;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.45);
          border-left: 3px solid #38bdf8;
          border-radius: 6px;
        ">
          <!-- Title row -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
            <div style="display: flex; align-items: center; gap: 5px; min-width: 0;">
              <span style="font-size: 13px; flex-shrink: 0; line-height: 1;">🛰️</span>
              <span style="font-size: 11px; font-weight: 700; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                Sampling Piksel Satelit Asli
              </span>
            </div>
            <span style="font-size: 8px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.2); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(56, 189, 248, 0.4); white-space: nowrap; flex-shrink: 0;">
              100% FREE
            </span>
          </div>

          <!-- Description text -->
          <div style="font-size: 9.5px; color: #e0f2fe; line-height: 1.35; margin-bottom: 5px;">
            Dianalisis langsung dari <strong>${res.totalPixelCount?.toLocaleString('id-ID') || '-'} piksel</strong> citra Sentinel-2 (10m) &amp; suhu Open-Meteo.
          </div>

          <!-- Chips row -->
          <div style="display: flex; gap: 4px; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: 4px; align-items: center;">
              <span style="font-size: 8px; font-weight: 600; color: #7dd3fc; background: rgba(56, 189, 248, 0.2); padding: 1px 4px; border-radius: 3px; white-space: nowrap;">
                ✓ 10m
              </span>
              <span style="font-size: 8px; font-weight: 600; color: #7dd3fc; background: rgba(56, 189, 248, 0.2); padding: 1px 4px; border-radius: 3px; white-space: nowrap;">
                ✓ Bebas Biaya
              </span>
            </div>
            <button id="btn-open-gee-setup-modal" style="font-size: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18); color: #bae6fd; border-radius: 3px; padding: 1px 5px; cursor: pointer; white-space: nowrap;">
              Info GEE ↗
            </button>
          </div>
        </div>` : `
        <!-- Estimation Disclaimer Banner with Setup Button -->
        <div role="note" aria-label="Peringatan: data estimasi" style="
          margin-bottom: 6px;
          padding: 6px 8px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.45);
          border-left: 3px solid #f59e0b;
          border-radius: 6px;
        ">
          <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
            <span style="font-size: 13px; line-height: 1;">⚠️</span>
            <div style="font-size: 11px; font-weight: 700; color: #fbbf24;">
              Model Proxy Heuristik (Offline)
            </div>
          </div>
          <div style="font-size: 9.5px; color: #fef3c7; line-height: 1.35; margin-bottom: 4px;">
            Dihitung dari model profil spasial wilayah secara offline.
          </div>
          <button id="btn-open-gee-setup-modal" class="btn btn-outline btn-sm" style="font-size: 8px; padding: 1px 5px; border-color: rgba(245, 158, 11, 0.45); color: #fbbf24; cursor: pointer; white-space: nowrap;">
            ⚙️ Panduan Setup GEE Cloud
          </button>
        </div>`}

        <!-- 4 KPI Metrics: Row 1 (2 cols) + Row 2 (Dominant) + Row 3 (UHI) -->
        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">
          <!-- Row 1: Luas & Suhu side by side -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            <div style="background: rgba(15, 23, 42, 0.7); padding: 5px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
              <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">Luas Wilayah</div>
              <div style="font-size: 12.5px; font-weight: 700; color: #fff; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${res.totalAreaKm2.toLocaleString('id-ID')} km²">
                ${res.totalAreaKm2.toLocaleString('id-ID')} <span style="font-size: 9px; font-weight: 400; color: #94a3b8;">km²</span>
              </div>
              <div style="font-size: 8.5px; color: #38bdf8; margin-top: 1px;">(${res.totalAreaHa.toLocaleString('id-ID')} Ha)</div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.7); padding: 5px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
              <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">Suhu Rata-rata</div>
              <div style="font-size: 12.5px; font-weight: 700; color: #f59e0b; margin-top: 1px;">
                ${res.thermalStats.meanTempC}°C
              </div>
              <div style="font-size: 8.5px; color: #cbd5e1; margin-top: 1px; white-space: nowrap;">Rentang ${res.thermalStats.minTempC}°–${res.thermalStats.maxTempC}°C</div>
            </div>
          </div>

          <!-- Row 2: Kelas Dominan (Full Width) -->
          <div style="background: rgba(15, 23, 42, 0.7); padding: 5px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06); display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Tutupan Dominan</div>
              <div style="font-size: 11px; font-weight: 600; color: #34d399; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dominantName}">
                🌳 ${dominantName}
              </div>
            </div>
            ${dominantPct ? `
            <span style="color: #34d399; font-size: 10.5px; font-weight: 700; background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.35); padding: 1.5px 6px; border-radius: 3px; white-space: nowrap; flex-shrink: 0;">
              ${dominantPct}%
            </span>` : ''}
          </div>

          <!-- Row 3: Paparan Panas UHI (Full Width) -->
          <div style="background: rgba(15, 23, 42, 0.7); padding: 5px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06); display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Paparan Panas UHI</div>
              <div style="font-size: 9.5px; color: #cbd5e1; margin-top: 1px; white-space: nowrap;">
                Hotspot: <strong style="color: #fff;">${res.thermalStats.hotspotAreaKm2 >= 1000 ? Math.round(res.thermalStats.hotspotAreaKm2).toLocaleString('id-ID') : res.thermalStats.hotspotAreaKm2.toLocaleString('id-ID')} km²</strong> (${res.thermalStats.hotspotPercentage}%)
              </div>
            </div>
            <div style="flex-shrink: 0; white-space: nowrap;">
              ${uhiRiskBadge}
            </div>
          </div>
        </div>

        <!-- Donut & Bar Visual Breakdown -->
        <div style="margin-top: 2px;">
          <div style="font-size: 10px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: baseline;">
            <span>Tutupan Lahan (Sentinel-2 10m):</span>
            <span style="color: #94a3b8; font-weight: 400; font-size: 8.5px;">${res.landCoverBreakdown.length} Kelas</span>
          </div>
          
          <!-- Stacked Progress Bar -->
          <div style="height: 7px; border-radius: 3px; overflow: hidden; display: flex; width: 100%; margin-bottom: 5px; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
            ${res.landCoverBreakdown.map((b) => `
              <div style="background-color: ${b.color}; width: ${b.percentage}%; height: 100%;" title="${b.nameId}: ${b.percentage}% (${b.areaKm2 >= 1000 ? Math.round(b.areaKm2).toLocaleString('id-ID') : b.areaKm2.toFixed(1)} km²)"></div>
            `).join('')}
          </div>

          <!-- Class Percentage Breakdown List with Highly Visible Percentage Badge -->
          <div style="display: flex; flex-direction: column; gap: 2.5px; max-height: 160px; overflow-y: auto; padding-right: 2px;">
            ${res.landCoverBreakdown.map((b) => `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px; background: rgba(15, 23, 42, 0.45); padding: 2.5px 6px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.04); gap: 4px;">
                <!-- Left: Color Swatch + Class Name -->
                <div style="display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;">
                  <span style="width: 6px; height: 6px; border-radius: 2px; background-color: ${b.color}; display: inline-block; flex-shrink: 0; box-shadow: 0 0 2px ${b.color};"></span>
                  <span style="color: #f1f5f9; font-weight: 500; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${b.nameId}">${b.nameId}</span>
                </div>
                <!-- Right: Area km² and Bright Percentage Pill Badge -->
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                  <span style="font-size: 8px; color: #64748b; white-space: nowrap;">
                    ${b.areaKm2 >= 1000 ? Math.round(b.areaKm2).toLocaleString('id-ID') : (b.areaKm2 < 0.1 ? '<0.1' : b.areaKm2.toFixed(1))} km²
                  </span>
                  <span style="color: #38bdf8; font-size: 9px; font-weight: 700; min-width: 32px; text-align: center; white-space: nowrap; background: rgba(56, 189, 248, 0.15); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(56, 189, 248, 0.3);">
                    ${b.percentage}%
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-export-aoi-csv')?.addEventListener('click', () => {
      this.downloadCSV(res);
    });

    document.getElementById('btn-open-gee-setup-modal')?.addEventListener('click', () => {
      const modal = document.getElementById('modal-gee-setup');
      if (modal) modal.style.display = 'flex';
    });

    try {
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {
      // Ignore scroll errors in virtual or headless environments
    }
  }

  public downloadCSV(res: ZonalAnalysisResult) {
    const csvContent = SpatialAnalysisEngine.exportToCSV(res);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = res.regionName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `analisis_spasial_${safeName}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Laporan Analisis Spasial (CSV) berhasil diunduh!', 'success');
  }

  public getActiveResult(): ZonalAnalysisResult | null {
    return this.activeResult;
  }
}
