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

  public analyzeFeature(
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    label: string
  ) {
    const result = SpatialAnalysisEngine.computeZonalStats(feature, label);
    this.activeResult = result;

    this.renderResult(result);
    showToast(`Analisis Statistik Spasial selesai untuk ${label}`, 'success');
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
            <span style="font-weight: 600; font-size: 12.5px; color: #fff;">Estimator Zonal Cepat (Heuristic Regional Proxy)</span>
          </div>
          <span style="font-size: 9.5px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
            Model Heuristik Empiris
          </span>
        </div>

        <p style="font-size: 10.5px; color: var(--text-muted); line-height: 1.4; margin-bottom: 12px;">
          Estimasi cepat profil tutupan lahan dan indikator termal mikro berbasis posisi koordinat geografis dan lanskap regional (bukan pembacaan piksel mentah GEE).
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
          <div style="text-align: center; padding: 18px 10px; border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 6px; background: rgba(0, 0, 0, 0.2);">
            <div style="font-size: 24px; margin-bottom: 4px;">📐</div>
            <div style="font-size: 11px; font-weight: 600; color: #cbd5e1;">Belum Ada Area Analisis yang Dipilih</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
              Gunakan tombol <strong>Gambar AOI</strong> atau pilih preset wilayah untuk memproses statistik zonal spasial.
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindUIEvents();
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
      ? '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 6px; border-radius: 3px; font-size: 9.5px; border: 1px solid rgba(239, 68, 68, 0.4);">Tinggi (UHI Kritis)</span>'
      : res.thermalStats.hotspotPercentage > 20
      ? '<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 6px; border-radius: 3px; font-size: 9.5px; border: 1px solid rgba(245, 158, 11, 0.4);">Sedang</span>'
      : '<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 3px; font-size: 9.5px; border: 1px solid rgba(16, 185, 129, 0.4);">Rendah / Sejuk</span>';

    container.innerHTML = `
      <div style="background: rgba(0, 0, 0, 0.3); border-radius: 6px; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.06);">
        <!-- Region Title Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <div style="font-size: 12px; font-weight: 700; color: #38bdf8;">${res.regionName}</div>
            <div style="font-size: 9px; color: var(--text-muted);">Dianalisis: ${res.timestamp}</div>
          </div>
          <button id="btn-export-aoi-csv" class="btn btn-secondary" style="font-size: 9.5px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;">
            📥 Unduh CSV
          </button>
        </div>

        ${res.isEstimated ? `
        <!-- Estimation Disclaimer Banner — always shown when isEstimated: true -->
        <div role="note" aria-label="Peringatan: data estimasi" style="
          margin-bottom: 10px;
          padding: 7px 10px;
          background: rgba(245, 158, 11, 0.10);
          border: 1px solid rgba(245, 158, 11, 0.40);
          border-left: 3px solid #f59e0b;
          border-radius: 5px;
          display: flex;
          gap: 7px;
          align-items: flex-start;
        ">
          <span style="font-size: 14px; flex-shrink: 0; line-height: 1;">⚠️</span>
          <div>
            <div style="font-size: 10px; font-weight: 700; color: #fbbf24; margin-bottom: 2px;">
              Estimasi Kasar — Bukan Sampling Piksel GEE
            </div>
            <div style="font-size: 9.5px; color: #fde68a; line-height: 1.45;">
              Angka luas tutupan lahan &amp; suhu di sini dihitung dari <strong>heuristik berbasis koordinat &amp; nama wilayah</strong>, bukan dari pembacaan piksel MODIS LST atau Sentinel-2 LULC secara langsung. Jangan gunakan untuk analisis ilmiah atau laporan resmi.
            </div>
          </div>
        </div>` : ''}

        <!-- 4 KPI Metrics Tiles -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;">
          <div style="background: rgba(15, 23, 42, 0.6); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase;">Luas Wilayah</div>
            <div style="font-size: 13px; font-weight: 700; color: #fff;">${res.totalAreaKm2.toLocaleString('id-ID')} <span style="font-size: 10px; font-weight: 400; color: #94a3b8;">km²</span></div>
            <div style="font-size: 9px; color: #38bdf8;">(${res.totalAreaHa.toLocaleString('id-ID')} Ha)</div>
          </div>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase;">Suhu Rata-rata LST</div>
            <div style="font-size: 13px; font-weight: 700; color: #f59e0b;">${res.thermalStats.meanTempC}°C</div>
            <div style="font-size: 9px; color: #94a3b8;">Rentang: ${res.thermalStats.minTempC}° – ${res.thermalStats.maxTempC}°C</div>
          </div>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase;">Kelas Dominan</div>
            <div style="font-size: 11px; font-weight: 600; color: #10b981; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${res.dominantClass}">
              ${res.dominantClass}
            </div>
            <div style="font-size: 9px; color: #94a3b8;">Tutupan Terbesar</div>
          </div>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="font-size: 8.5px; color: var(--text-muted); text-transform: uppercase;">Paparan Panas UHI</div>
            <div style="margin-top: 3px;">${uhiRiskBadge}</div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">${res.thermalStats.hotspotAreaKm2} km² (${res.thermalStats.hotspotPercentage}%)</div>
          </div>
        </div>

        <!-- Donut & Bar Visual Breakdown -->
        <div style="margin-bottom: 10px;">
          <div style="font-size: 10px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; display: flex; justify-content: space-between;">
            <span>Komposisi Tutupan Lahan (Sentinel-2 10m):</span>
            <span style="color: #94a3b8; font-weight: 400;">9 Kelas Analisis</span>
          </div>
          
          <!-- Stacked Progress Bar -->
          <div style="height: 10px; border-radius: 5px; overflow: hidden; display: flex; width: 100%; margin-bottom: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
            ${res.landCoverBreakdown.map((b) => `
              <div style="background-color: ${b.color}; width: ${b.percentage}%; height: 100%;" title="${b.nameId}: ${b.percentage}% (${b.areaKm2} km²)"></div>
            `).join('')}
          </div>

          <!-- Class Percentage Breakdown List -->
          <div style="display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; padding-right: 2px;">
            ${res.landCoverBreakdown.map((b) => `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; background: rgba(15, 23, 42, 0.4); padding: 3px 6px; border-radius: 3px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                  <span style="width: 8px; height: 8px; border-radius: 2px; background-color: ${b.color}; display: inline-block;"></span>
                  <span style="color: #f1f5f9;">${b.nameId}</span>
                </div>
                <div style="display: flex; gap: 8px; color: #94a3b8;">
                  <span>${b.areaKm2} km²</span>
                  <strong style="color: #38bdf8;">${b.percentage}%</strong>
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
