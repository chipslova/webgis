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
  private activeResultSubTab: 'landcover' | 'thermal' | 'forecast' = 'landcover';
  private isDrawingAOI: boolean = false;
  private drawnPoints: [number, number][] = [];
  private onResultChangeCallbacks: Array<(res: ZonalAnalysisResult) => void> = [];
  private onLayersChangeCallbacks: Array<() => void> = [];
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

  public onLayersChange(callback: () => void) {
    this.onLayersChangeCallbacks.push(callback);
  }

  private notifyLayersChange() {
    this.onLayersChangeCallbacks.forEach(cb => {
      try { cb(); } catch (e) { /* ignore */ }
    });
  }

  public getAllMapLayerIds(): string[] {
    return [
      'aoi-analysis-fill',
      'aoi-analysis-line',
      'aoi-rubberband-layer',
      'aoi-vertices-layer'
    ];
  }

  public restoreAfterStyleChange() {
    this.initMapLayers();
    this.updateDrawingVisuals();
    this.notifyLayersChange();
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
        paint: { 'fill-color': '#00f0ff', 'fill-opacity': 0.28 }
      });

      this.map.addLayer({
        id: 'aoi-analysis-line',
        type: 'line',
        source: 'aoi-analysis-source',
        paint: { 'line-color': '#00f0ff', 'line-width': 3, 'line-dasharray': [3, 2] }
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

  public isDrawingActive(): boolean {
    return this.isDrawingAOI;
  }

  public startDrawing() {
    this.isDrawingAOI = true;
    this.drawnPoints = [];
    this.updateDrawingVisuals();

    document.body.classList.add('aoi-drawing-active');

    // Cancel any active measurement session so click listeners don't collide
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('webgis:cancel-active-measure'));
    }

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
    const drawingActions = document.getElementById('aoi-drawing-actions');
    const finishBtn = document.getElementById('btn-finish-draw-aoi');
    const cancelBtn = document.getElementById('btn-cancel-draw-aoi');
    const undoBtn = document.getElementById('btn-undo-draw-aoi');
    const statusEl = document.getElementById('aoi-draw-status');
    const presetContainer = document.getElementById('aoi-preset-container');

    if (drawBtn) drawBtn.style.display = 'none';
    if (drawingActions) drawingActions.style.display = 'grid';
    if (finishBtn) finishBtn.style.display = 'inline-flex';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (undoBtn) undoBtn.style.display = 'inline-flex';
    if (presetContainer) presetContainer.style.display = 'none';
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
    const drawingActions = document.getElementById('aoi-drawing-actions');
    const finishBtn = document.getElementById('btn-finish-draw-aoi');
    const cancelBtn = document.getElementById('btn-cancel-draw-aoi');
    const undoBtn = document.getElementById('btn-undo-draw-aoi');
    const statusEl = document.getElementById('aoi-draw-status');
    const presetContainer = document.getElementById('aoi-preset-container');

    if (drawBtn) drawBtn.style.display = 'inline-flex';
    if (drawingActions) drawingActions.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (undoBtn) undoBtn.style.display = 'none';
    if (presetContainer) presetContainer.style.display = 'flex';
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
    const drawingActions = document.getElementById('aoi-drawing-actions');
    const finishBtn = document.getElementById('btn-finish-draw-aoi');
    const cancelBtn = document.getElementById('btn-cancel-draw-aoi');
    const undoBtn = document.getElementById('btn-undo-draw-aoi');
    const statusEl = document.getElementById('aoi-draw-status');
    const presetContainer = document.getElementById('aoi-preset-container');

    if (drawBtn) drawBtn.style.display = 'inline-flex';
    if (drawingActions) drawingActions.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (undoBtn) undoBtn.style.display = 'none';
    if (presetContainer) presetContainer.style.display = 'flex';
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

    this.notifyLayersChange();
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

    this.notifyLayersChange();
    this.analyzeFeature(polyFeature, preset.name);
  }

  public async analyzeFeature(
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    label: string
  ) {
    const container = document.getElementById('aoi-analysis-results-container');
    if (container) {
      container.innerHTML = `
        <div class="aoi-loading-card">
          <div class="hud-spinner aoi-spinner"></div>
          <div class="aoi-loading-title">Menganalisis Piksel Satelit &amp; Suhu Permukaan...</div>
          <div class="aoi-loading-subtitle">Memproses data raster Sentinel-2 10m LULC &amp; Open-Meteo Live LST...</div>
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
      <div class="analysis-card spatial-analysis-card">
        <div class="analysis-card-header">
          <div class="analysis-card-title">
            <span class="analysis-icon" aria-hidden="true">📊</span>
            <h3>Analisis Spasial Zonal (Sentinel-2 &amp; LST)</h3>
          </div>
          <span class="piksel-hint">Open Data Satelit</span>
        </div>

        <p class="analysis-desc">
          Analisis komposisi tutupan lahan dan statistik termal berbasis pembacaan piksel satelit Sentinel-2 10m &amp; suhu permukaan tanah Open-Meteo realtime.
        </p>

        <!-- 1. Selection & Drawing Controls -->
        <div class="aoi-control-box">
          <!-- Default Draw Button: Full-width, 1 baris horizontal rapi -->
          <button id="btn-start-draw-aoi" class="btn btn-primary aoi-btn-full">
            <span>✏️</span>
            <span>Gambar AOI Bebas di Peta</span>
          </button>

          <!-- Active Drawing Mode: 3 Tombol Aksi Rapi -->
          <div id="aoi-drawing-actions" class="aoi-actions-3col" style="display: none;">
            <button id="btn-finish-draw-aoi" class="btn btn-success aoi-action-btn btn-finish">
              ✅ Selesai
            </button>
            <button id="btn-undo-draw-aoi" class="btn btn-secondary aoi-action-btn">
              ↩ Hapus
            </button>
            <button id="btn-cancel-draw-aoi" class="btn btn-secondary aoi-action-btn">
              ❌ Batal
            </button>
          </div>

          <!-- Dropdown Preset Wilayah: Full-width, Proporsional, Teks Utuh & Jelas -->
          <div id="aoi-preset-container" class="aoi-preset-box">
            <div class="aoi-preset-divider">
              <div class="aoi-divider-line"></div>
              <span class="aoi-divider-label">atau pilih wilayah prioritas</span>
              <div class="aoi-divider-line"></div>
            </div>
            <select id="select-preset-aoi" class="form-select aoi-preset-select">
              <option value="" disabled selected>📍 Pilih Wilayah Prioritas (IKN, Jakarta, Bandung, dll)</option>
              ${PRESET_REGIONS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>

          <div id="aoi-draw-status" class="aoi-draw-status-box" style="display: none;"></div>
        </div>

        <!-- 2. Results Container -->
        <div id="aoi-analysis-results-container">
          <div class="aoi-empty-box">
            <div class="aoi-empty-icon">📐</div>
            <div class="aoi-empty-title">Belum Ada Area Analisis yang Dipilih</div>
            <div class="aoi-empty-subtitle">
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
      if (presetSelect.value) {
        const val = presetSelect.value;
        this.selectPresetRegion(val);
        // Reset select index so user can re-trigger the same preset after panning map
        setTimeout(() => {
          if (presetSelect) presetSelect.value = '';
        }, 800);
      }
    });
  }

  private renderResult(res: ZonalAnalysisResult) {
    const container = document.getElementById('aoi-analysis-results-container');
    if (!container) return;

    const uhiRiskBadge = res.thermalStats.hotspotPercentage > 40
      ? '<span class="uhi-badge high">Tinggi (UHI Kritis)</span>'
      : res.thermalStats.hotspotPercentage > 20
      ? '<span class="uhi-badge medium">Sedang</span>'
      : '<span class="uhi-badge low">Rendah / Sejuk</span>';

    const dominantItem = res.landCoverBreakdown.length > 0 ? res.landCoverBreakdown[0] : null;
    const dominantName = dominantItem ? dominantItem.nameId : (res.dominantClass.split('(')[0].trim() || 'Vegetasi');
    const dominantPct = dominantItem ? dominantItem.percentage : (res.dominantClass.match(/\(([\d.]+)%\)/)?.[1] || '');

    const bannerHtml = res.isRealGEE ? `
      <!-- Real GEE Verified Banner -->
      <div role="note" aria-label="Verifikasi Piksel Asli GEE" class="aoi-banner gee-cloud">
        <div class="aoi-banner-header">
          <div class="aoi-banner-title-wrap">
            <span style="font-size: 13px; line-height: 1;">⚡</span>
            <span class="aoi-banner-title">
              Piksel Asli Earth Engine
            </span>
          </div>
          <span class="aoi-banner-tag">
            CLOUD
          </span>
        </div>
        <div class="aoi-banner-body">
          Reduksi superkomputer Google: <strong>${res.totalPixelCount?.toLocaleString('id-ID') || '-'} piksel</strong>.
        </div>
      </div>` : res.isClientSampled ? `
      <!-- Real Client-Side Sentinel-2 10m Pixel Sampling Banner (100% Free) -->
      <div role="note" aria-label="Verifikasi Sampling Piksel Sentinel-2 10m" class="aoi-banner client-sampled">
        <div class="aoi-banner-header">
          <div class="aoi-banner-title-wrap">
            <span style="font-size: 13px; flex-shrink: 0; line-height: 1;">🛰️</span>
            <span class="aoi-banner-title">
              Sampling Piksel Satelit Asli
            </span>
          </div>
          <span class="aoi-banner-tag">
            OPEN DATA
          </span>
        </div>
        <div class="aoi-banner-body">
          Dianalisis dari <strong>${res.totalPixelCount?.toLocaleString('id-ID') || '-'} piksel</strong> citra Sentinel-2 (10m) &amp; Open-Meteo.
        </div>
        <div class="aoi-banner-footer">
          <div style="display: flex; gap: 4px; align-items: center;">
            <span class="aoi-pill-tag">
              ✓ Resolusi 10m
            </span>
            <span class="aoi-pill-tag">
              ✓ Tanpa Biaya
            </span>
          </div>
          <button id="btn-open-gee-setup-modal" class="aoi-link-btn">
            Info GEE ↗
          </button>
        </div>
      </div>` : `
      <!-- Estimation Disclaimer Banner with Setup Button -->
      <div role="note" aria-label="Peringatan: data estimasi" class="aoi-banner estimation">
        <div class="aoi-banner-header">
          <div class="aoi-banner-title-wrap">
            <span style="font-size: 13px; line-height: 1;">⚠️</span>
            <div class="aoi-banner-title">
              Model Proxy Heuristik (Offline)
            </div>
          </div>
        </div>
        <div class="aoi-banner-body">
          Dihitung dari model profil spasial wilayah secara offline.
        </div>
        <button id="btn-open-gee-setup-modal" class="btn btn-outline btn-sm aoi-link-btn" style="border-color: rgba(245, 158, 11, 0.45); color: #fbbf24;">
          ⚙️ Panduan Setup GEE Cloud
        </button>
      </div>`;

    container.innerHTML = `
      <div class="aoi-result-card">
        <!-- Region Title Header -->
        <div class="aoi-result-header">
          <div class="aoi-result-title-wrap">
            <div class="aoi-result-title" title="${res.regionName}">
              ${res.regionName}
            </div>
            <div class="aoi-result-timestamp">
              Dianalisis: ${res.timestamp}
            </div>
          </div>
          <button id="btn-export-aoi-csv" class="btn btn-secondary btn-export-csv">
            📥 Unduh CSV
          </button>
        </div>

        ${bannerHtml}

        <!-- Segmented Sub-Tab Nav (Pills) -->
        <div class="aoi-subtabs-nav" style="display: flex; gap: 4px; background: rgba(15, 23, 42, 0.85); padding: 3px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 8px;">
          <button type="button" id="tab-btn-landcover" class="aoi-subtab-btn" data-subtab="landcover" style="flex: 1; padding: 4px 4px; font-size: 10px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; transition: all 0.15s; ${this.activeResultSubTab === 'landcover' ? 'background: #0284c7; color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3);' : 'background: transparent; color: #94a3b8;'}">
            <span>🌿</span>
            <span>Tutupan</span>
          </button>
          <button type="button" id="tab-btn-thermal" class="aoi-subtab-btn" data-subtab="thermal" style="flex: 1; padding: 4px 4px; font-size: 10px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; transition: all 0.15s; ${this.activeResultSubTab === 'thermal' ? 'background: #ea580c; color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3);' : 'background: transparent; color: #94a3b8;'}">
            <span>🔥</span>
            <span>Termal</span>
          </button>
          <button type="button" id="tab-btn-forecast" class="aoi-subtab-btn" data-subtab="forecast" style="flex: 1; padding: 4px 4px; font-size: 10px; font-weight: 600; border-radius: 4px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; transition: all 0.15s; ${this.activeResultSubTab === 'forecast' ? 'background: #9333ea; color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3);' : 'background: transparent; color: #94a3b8;'}">
            <span>🔮</span>
            <span>Prakiraan</span>
          </button>
        </div>

        <!-- Sub-Tab 1: Tutupan Lahan -->
        <div id="aoi-panel-landcover" style="display: ${this.activeResultSubTab === 'landcover' ? 'block' : 'none'};">
          <!-- KPI Row: Luas & Tutupan Dominan -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px;">
            <div style="background: rgba(15, 23, 42, 0.7); padding: 5px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
              <div style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Luas Wilayah</div>
              <div style="font-size: 13px; font-weight: 700; color: #fff; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${res.totalAreaKm2.toLocaleString('id-ID')} km²">
                ${res.totalAreaKm2.toLocaleString('id-ID')} <span style="font-size: 9.5px; font-weight: 400; color: #94a3b8;">km²</span>
              </div>
              <div style="font-size: 9.5px; color: #38bdf8; margin-top: 1px;">(${res.totalAreaHa.toLocaleString('id-ID')} Ha)</div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.7); padding: 5px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
              <div style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Kelas Dominan</div>
              <div style="font-size: 11.5px; font-weight: 700; color: #34d399; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dominantName}">
                🌳 ${dominantName}
              </div>
              <div style="font-size: 9.5px; color: #a7f3d0; margin-top: 1px;">Porsi: <strong>${dominantPct}%</strong></div>
            </div>
          </div>

          <!-- Stacked Progress Bar -->
          <div style="height: 8px; border-radius: 4px; overflow: hidden; display: flex; width: 100%; margin-bottom: 6px; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
            ${res.landCoverBreakdown.map((b) => `
              <div style="background-color: ${b.color}; width: ${b.percentage}%; height: 100%;" title="${b.nameId}: ${b.percentage}% (${b.areaKm2 >= 1000 ? Math.round(b.areaKm2).toLocaleString('id-ID') : b.areaKm2.toFixed(1)} km²)"></div>
            `).join('')}
          </div>

          <!-- Class Percentage Breakdown List with Highly Visible Percentage Badge -->
          <div style="display: flex; flex-direction: column; gap: 3px; max-height: 180px; overflow-y: auto; padding-right: 2px;">
            ${res.landCoverBreakdown.map((b) => `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; background: rgba(15, 23, 42, 0.45); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.04); gap: 4px;">
                <!-- Left: Color Swatch + Class Name -->
                <div style="display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;">
                  <span style="width: 7px; height: 7px; border-radius: 2px; background-color: ${b.color}; display: inline-block; flex-shrink: 0; box-shadow: 0 0 2px ${b.color};"></span>
                  <span style="color: #f1f5f9; font-weight: 500; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${b.nameId}">${b.nameId}</span>
                </div>
                <!-- Right: Area km² and Bright Percentage Pill Badge -->
                <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                  <span style="font-size: 9px; color: #94a3b8; white-space: nowrap;">
                    ${b.areaKm2 >= 1000 ? Math.round(b.areaKm2).toLocaleString('id-ID') : (b.areaKm2 < 0.1 ? '<0.1' : b.areaKm2.toFixed(1))} km²
                  </span>
                  <span style="color: #38bdf8; font-size: 9.5px; font-weight: 700; min-width: 34px; text-align: center; white-space: nowrap; background: rgba(56, 189, 248, 0.15); padding: 1.5px 5px; border-radius: 3px; border: 1px solid rgba(56, 189, 248, 0.35);">
                    ${b.percentage}%
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Sub-Tab 2: Termal & UHI -->
        <div id="aoi-panel-thermal" style="display: ${this.activeResultSubTab === 'thermal' ? 'block' : 'none'};">
          <!-- Suhu Rata-rata & Rentang -->
          <div style="background: rgba(15, 23, 42, 0.7); padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Suhu Permukaan (LST)</div>
              <div style="font-size: 16px; font-weight: 700; color: #f59e0b; margin-top: 1px;">
                ${res.thermalStats.meanTempC}°C
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 9.5px; color: #94a3b8;">Rentang Termal</div>
              <div style="font-size: 11px; font-weight: 600; color: #cbd5e1; margin-top: 1px;">
                ${res.thermalStats.minTempC}°C – ${res.thermalStats.maxTempC}°C
              </div>
            </div>
          </div>

          <!-- Paparan Panas UHI & Risiko -->
          <div style="background: rgba(15, 23, 42, 0.7); padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px;">Paparan Panas UHI</div>
              <div style="font-size: 10px; color: #cbd5e1; margin-top: 1px; white-space: nowrap;">
                Hotspot: <strong style="color: #fff;">${res.thermalStats.hotspotAreaKm2 >= 1000 ? Math.round(res.thermalStats.hotspotAreaKm2).toLocaleString('id-ID') : res.thermalStats.hotspotAreaKm2.toLocaleString('id-ID')} km²</strong> (${res.thermalStats.hotspotPercentage}%)
              </div>
            </div>
            <div style="flex-shrink: 0; white-space: nowrap;">
              ${uhiRiskBadge}
            </div>
          </div>

          <div style="font-size: 9.5px; color: #94a3b8; line-height: 1.4; background: rgba(0, 0, 0, 0.25); border: 1px dashed rgba(255, 255, 255, 0.1); padding: 5px 7px; border-radius: 5px;">
            🔬 <em>LST mengukur suhu radiatif kulit permukaan tanah (radiant skin temp) berbasis Open-Meteo &amp; thermal sensor MODIS.</em>
          </div>
        </div>

        <!-- Sub-Tab 3: Prakiraan 5 Hari -->
        <div id="aoi-panel-forecast" style="display: ${this.activeResultSubTab === 'forecast' ? 'block' : 'none'};">
          ${res.thermalForecast && res.thermalForecast.forecastDays.length > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Tren Suhu Harian (5 Hari)</span>
              <span style="font-size: 9px; font-weight: 700; color: #c084fc; background: rgba(168, 85, 247, 0.2); padding: 1px 5px; border-radius: 3px; border: 1px solid rgba(168, 85, 247, 0.4); white-space: nowrap;">
                MODEL FORECAST
              </span>
            </div>

            <!-- 5-Day Mini Strip -->
            <div style="display: grid; grid-template-columns: repeat(${res.thermalForecast.forecastDays.length}, 1fr); gap: 4px; margin-bottom: 6px;">
              ${res.thermalForecast.forecastDays.map(d => `
                <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 5px; padding: 4px 2px; text-align: center;">
                  <div style="font-size: 10px; color: #94a3b8; font-weight: 600;">${d.dayLabel}</div>
                  <div style="font-size: 11.5px; font-weight: 700; color: #f87171; margin-top: 1px;">${d.maxTempC}°</div>
                  <div style="font-size: 9.5px; color: #38bdf8;">${d.minTempC}°</div>
                </div>
              `).join('')}
            </div>

            <!-- Special Note Box -->
            <div style="font-size: 9.5px; color: #d8b4fe; line-height: 1.35; background: rgba(168, 85, 247, 0.1); border-left: 3px solid #a855f7; padding: 4px 7px; border-radius: 0 4px 4px 0;">
              <strong style="color: #f3e8ff;">📌 Catatan Khusus:</strong> Hasil simulasi model numerik atmosfer, bukan observasi masa depan.
            </div>
          ` : `
            <div style="text-align: center; padding: 12px; font-size: 10px; color: var(--text-muted);">
              Data prakiraan suhu cuaca tidak tersedia untuk wilayah ini.
            </div>
          `}
        </div>
      </div>
    `;

    // Bind sub-tab switching
    const subtabButtons = container.querySelectorAll<HTMLButtonElement>('.aoi-subtab-btn');
    subtabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.subtab as 'landcover' | 'thermal' | 'forecast';
        if (!target) return;
        this.activeResultSubTab = target;

        subtabButtons.forEach(b => {
          const isCurrent = b.dataset.subtab === target;
          const bgMap: Record<string, string> = {
            landcover: '#0284c7',
            thermal: '#ea580c',
            forecast: '#9333ea'
          };
          b.style.background = isCurrent ? bgMap[target] : 'transparent';
          b.style.color = isCurrent ? '#ffffff' : '#94a3b8';
          b.style.boxShadow = isCurrent ? '0 1px 3px rgba(0,0,0,0.3)' : 'none';
        });

        const panels = ['landcover', 'thermal', 'forecast'] as const;
        panels.forEach(p => {
          const el = document.getElementById(`aoi-panel-${p}`);
          if (el) el.style.display = p === target ? 'block' : 'none';
        });
      });
    });

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
