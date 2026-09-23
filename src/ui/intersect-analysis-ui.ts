import * as maplibregl from 'maplibre-gl';
import { bbox } from '@turf/bbox';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { SpatialAnalysisUI } from './spatial-analysis-ui';
import {
  SpatialIntersectAnalyzer,
  SpatialOverlayMode,
  IntersectAnalysisResult,
  BatchOverlayResult
} from '../tools/spatial-intersect';
import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';
import { logger } from '../utils/logger';

export class IntersectAnalysisUI {
  private map: maplibregl.Map;
  private geojsonLoader: GeoJsonLoader;
  private spatialAnalysisUI: SpatialAnalysisUI;
  private onLayersChangeCallback?: () => void;

  private activeResult: IntersectAnalysisResult | null = null;
  private activeBatchResult: BatchOverlayResult | null = null;
  private currentMode: SpatialOverlayMode = 'intersect';
  private selectedColor: string = '#00f0ff'; // Neon Cyan default for WebGIS dark theme
  private selectedOpacity: number = 0.70;

  public getActiveResult(): IntersectAnalysisResult | null {
    return this.activeResult;
  }

  public getActiveBatchResult(): BatchOverlayResult | null {
    return this.activeBatchResult;
  }

  constructor(
    map: maplibregl.Map,
    geojsonLoader: GeoJsonLoader,
    spatialAnalysisUI: SpatialAnalysisUI,
    onLayersChange?: () => void
  ) {
    this.map = map;
    this.geojsonLoader = geojsonLoader;
    this.spatialAnalysisUI = spatialAnalysisUI;
    this.onLayersChangeCallback = onLayersChange;
  }

  public init() {
    this.initMapLayers();
    this.bindEvents();
    this.updateAOIStatusCard();
    this.updateLayerSelect();

    if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.onLayersChange === 'function') {
      this.spatialAnalysisUI.onLayersChange(() => {
        this.updateAOIStatusCard();
        this.updateLayerSelect();
      });
    }
  }

  public updateAOIStatusCard() {
    const card = document.getElementById('intersect-aoi-status-card');
    const icon = document.getElementById('intersect-aoi-icon');
    const label = document.getElementById('intersect-aoi-label');
    const sublabel = document.getElementById('intersect-aoi-sublabel');
    const activeAOI = this.spatialAnalysisUI?.getActiveAOIPolygon ? this.spatialAnalysisUI.getActiveAOIPolygon() : null;

    if (!card || !icon || !label || !sublabel) return;

    if (activeAOI) {
      card.classList.add('active');
      icon.innerText = '✅';
      const aoiName = activeAOI.properties?.name || 'Area Poligon Aktif';
      label.innerText = `Wilayah Aktif: ${aoiName}`;
      sublabel.innerText = 'Batas area siap digunakan untuk mencari objek!';
    } else {
      card.classList.remove('active');
      icon.innerText = '📍';
      label.innerText = 'Belum ada wilayah yang dipilih';
      sublabel.innerText = 'Pilih contoh instan atau gambar di peta';
    }
  }

  public getAllMapLayerIds(): string[] {
    return [
      'intersect-result-fill',
      'intersect-result-line',
      'intersect-result-points',
      'intersect-hover-fill',
      'intersect-hover-line',
      'intersect-hover-points'
    ];
  }

  public restoreAfterStyleChange() {
    this.initMapLayers();
    if (this.activeResult && this.activeResult.data) {
      const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
      if (src && typeof src.setData === 'function') {
        src.setData(this.activeResult.data);
      }
    }
  }

  private initMapLayers() {
    if (!this.map || !this.map.getStyle()) return;

    try {
      // 1. Main Result Source & Layers
      if (!this.map.getSource('intersect-result-source')) {
        this.map.addSource('intersect-result-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!this.map.getLayer('intersect-result-fill')) {
        this.map.addLayer({
          id: 'intersect-result-fill',
          type: 'fill',
          source: 'intersect-result-source',
          filter: ['any', ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': this.selectedColor,
            'fill-opacity': this.selectedOpacity
          }
        });
      }

      if (!this.map.getLayer('intersect-result-line')) {
        this.map.addLayer({
          id: 'intersect-result-line',
          type: 'line',
          source: 'intersect-result-source',
          paint: {
            'line-color': '#ffffff',
            'line-width': 2.5,
            'line-opacity': 0.9,
            'line-dasharray': [3, 2]
          }
        });
      }

      if (!this.map.getLayer('intersect-result-points')) {
        this.map.addLayer({
          id: 'intersect-result-points',
          type: 'circle',
          source: 'intersect-result-source',
          filter: ['any', ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 7,
            'circle-color': this.selectedColor,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95
          }
        });
      }

      // 2. Interactive Hover Highlight Source & Layers
      if (!this.map.getSource('intersect-hover-source')) {
        this.map.addSource('intersect-hover-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!this.map.getLayer('intersect-hover-fill')) {
        this.map.addLayer({
          id: 'intersect-hover-fill',
          type: 'fill',
          source: 'intersect-hover-source',
          filter: ['any', ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#facc15',
            'fill-opacity': 0.65
          }
        });
      }

      if (!this.map.getLayer('intersect-hover-line')) {
        this.map.addLayer({
          id: 'intersect-hover-line',
          type: 'line',
          source: 'intersect-hover-source',
          paint: {
            'line-color': '#facc15',
            'line-width': 4,
            'line-opacity': 1
          }
        });
      }

      if (!this.map.getLayer('intersect-hover-points')) {
        this.map.addLayer({
          id: 'intersect-hover-points',
          type: 'circle',
          source: 'intersect-hover-source',
          filter: ['any', ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 11,
            'circle-color': '#facc15',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
          }
        });
      }
    } catch (err) {
      logger.warn('[IntersectAnalysisUI] Layer init warning:', err);
    }
  }

  public updateLayerSelect() {
    const selectA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
    const selectB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
    if (!selectA || !selectB) return;

    const valA = selectA.value;
    const valB = selectB.value;

    const layers = this.geojsonLoader.getLayers();
    const activeAOI = this.spatialAnalysisUI.getActiveAOIPolygon();

    let optionsHtmlA = '<option value="" disabled selected>Pilih lapisan wilayah acuan...</option>';
    let optionsHtmlB = '<option value="" disabled selected>Pilih lapisan target...</option>';

    if (activeAOI) {
      optionsHtmlA += '<option value="__aoi_active__">🎯 Wilayah AOI Aktif (Poligon Gambaran)</option>';
      optionsHtmlB += '<option value="__aoi_active__">🎯 Wilayah AOI Aktif (Poligon Gambaran)</option>';
    }

    optionsHtmlA += '<option value="__gee_stations__">🌡️ Stasiun Observasi MODIS LST (18 Titik Indonesia)</option>';
    optionsHtmlB += '<option value="__gee_stations__">🌡️ Stasiun Observasi MODIS LST (18 Titik Indonesia)</option>';

    layers.forEach((l) => {
      const featCount = l.data.features.length;
      optionsHtmlA += `<option value="${l.id}">📁 ${l.name} (${featCount} fitur)</option>`;
      optionsHtmlB += `<option value="${l.id}">📁 ${l.name} (${featCount} fitur)</option>`;
    });

    selectA.innerHTML = optionsHtmlA;
    selectB.innerHTML = optionsHtmlB;

    if (valA && selectA.querySelector(`option[value="${valA}"]`)) {
      selectA.value = valA;
    } else if (activeAOI) {
      selectA.value = '__aoi_active__';
    } else if (layers.length > 0) {
      selectA.value = layers[0].id;
    }

    if (valB && selectB.querySelector(`option[value="${valB}"]`)) {
      selectB.value = valB;
    } else if (layers.length > 0 && layers[0].id !== selectA.value) {
      selectB.value = layers[0].id;
    } else if (layers.length > 1) {
      selectB.value = layers[1].id;
    } else {
      selectB.value = '__gee_stations__';
    }
  }

  private bindEvents() {
    const runBtn = document.getElementById('btn-run-intersect-analysis');
    const clearBtn = document.getElementById('btn-clear-intersect-analysis');
    const opacitySlider = document.getElementById('intersect-opacity-slider') as HTMLInputElement | null;
    const opacityVal = document.getElementById('intersect-opacity-val');
    const colorChips = document.querySelectorAll<HTMLButtonElement>('.intersect-color-chip');
    const customColorInput = document.getElementById('intersect-color-custom') as HTMLInputElement | null;

    // 0. Quick Step 1 AOI Setup (Preset or Freehand Drawing)
    const btnSampleAOI = document.getElementById('btn-quick-sample-aoi');
    const btnDrawAOI = document.getElementById('btn-quick-draw-aoi');

    btnSampleAOI?.addEventListener('click', () => {
      if (this.geojsonLoader.getLayers().length === 0) {
        this.geojsonLoader.loadSampleData();
      }
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.selectPresetRegion === 'function') {
        this.spatialAnalysisUI.selectPresetRegion('dki-jakarta');
      }
      this.updateAOIStatusCard();
      this.updateLayerSelect();
      showToast('Wilayah DKI Jakarta siap digunakan sebagai wilayah pencarian!', 'info');
    });

    btnDrawAOI?.addEventListener('click', () => {
      if (this.geojsonLoader.getLayers().length === 0) {
        this.geojsonLoader.loadSampleData();
      }
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.startDrawing === 'function') {
        this.spatialAnalysisUI.startDrawing();
      }
    });

    // 1. Operation Mode Pills (Intersect, Difference, Union, XOR)
    const opPills = document.querySelectorAll<HTMLButtonElement>('.intersect-op-btn');
    opPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        opPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const mode = (pill.dataset.mode as SpatialOverlayMode) || 'intersect';
        this.currentMode = mode;
        const opDescEl = document.getElementById('intersect-op-desc');
        if (opDescEl) {
          if (mode === 'intersect') {
            opDescEl.innerHTML = '⚔️ <strong>Irisan:</strong> Cari objek atau area yang berada tepat di dalam batas wilayah.';
          } else if (mode === 'difference') {
            opDescEl.innerHTML = '✂️ <strong>Potong:</strong> Kurangi wilayah pertama dengan memotong bagian yang bertabrakan dengan wilayah kedua.';
          } else if (mode === 'union') {
            opDescEl.innerHTML = '🔗 <strong>Gabung:</strong> Satukan dua wilayah menjadi satu batas wilayah utuh yang berkesinambungan.';
          } else if (mode === 'sym_difference') {
            opDescEl.innerHTML = '⚡ <strong>Beda:</strong> Ambil area unik dari kedua wilayah tanpa bagian tengah yang saling tumpang tindih.';
          }
        }
      });
    });

    // 2. Quick Target Selection Chips (Langkah 2)
    const chipCities = document.getElementById('chip-target-cities');
    const chipStations = document.getElementById('chip-target-stations');
    const chipAll = document.getElementById('chip-target-all');
    const chipCustom = document.getElementById('chip-target-custom');
    const customSelectors = document.getElementById('intersect-custom-selectors');

    const updateActiveChip = (targetBtn: HTMLElement | null) => {
      document.querySelectorAll('.intersect-target-chips .btn-chip').forEach((c) => c.classList.remove('active'));
      targetBtn?.classList.add('active');
    };

    chipCities?.addEventListener('click', () => {
      updateActiveChip(chipCities);
      if (customSelectors) customSelectors.style.display = 'none';
      if (this.geojsonLoader.getLayers().length === 0) {
        this.geojsonLoader.loadSampleData();
      }
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      const layers = this.geojsonLoader.getLayers();
      if (selB && layers.length > 0) selB.value = layers[0].id;
    });

    chipStations?.addEventListener('click', () => {
      updateActiveChip(chipStations);
      if (customSelectors) customSelectors.style.display = 'none';
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      if (selB) selB.value = '__gee_stations__';
    });

    chipAll?.addEventListener('click', () => {
      updateActiveChip(chipAll);
      if (customSelectors) customSelectors.style.display = 'none';
    });

    chipCustom?.addEventListener('click', () => {
      updateActiveChip(chipCustom);
      if (customSelectors) customSelectors.style.display = 'flex';
    });

    runBtn?.addEventListener('click', () => this.runAnalysis());
    clearBtn?.addEventListener('click', () => this.clearAnalysis());

    opacitySlider?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const val = Number(target.value);
      this.selectedOpacity = val / 100;
      if (opacityVal) opacityVal.innerText = `${val}%`;

      if (this.map && this.map.getLayer('intersect-result-fill')) {
        this.map.setPaintProperty('intersect-result-fill', 'fill-opacity', this.selectedOpacity);
      }
    });

    colorChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        colorChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const color = chip.dataset.color || '#00f0ff';
        this.updateColor(color);
      });
    });

    customColorInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      colorChips.forEach((c) => c.classList.remove('active'));
      this.updateColor(target.value);
    });
  }

  private updateColor(color: string) {
    this.selectedColor = color;
    if (this.map && this.map.getLayer('intersect-result-fill')) {
      this.map.setPaintProperty('intersect-result-fill', 'fill-color', color);
    }
    if (this.map && this.map.getLayer('intersect-result-points')) {
      this.map.setPaintProperty('intersect-result-points', 'circle-color', color);
    }
  }

  public async runAnalysis() {
    const statusBox = document.getElementById('intersect-analysis-status');
    const activeChip = document.querySelector('.intersect-target-chips .btn-chip.active') as HTMLElement | null;
    const targetType = activeChip?.dataset.target || 'cities';

    // 0. Auto-ensure sample vector data is present if target is cities
    if (targetType === 'cities' && this.geojsonLoader.getLayers().length === 0) {
      this.geojsonLoader.loadSampleData();
      this.updateLayerSelect();
    }

    // 1. Auto-activate sample AOI (DKI Jakarta) if user has not picked or drawn an area yet
    if (!this.spatialAnalysisUI || !this.spatialAnalysisUI.getActiveAOIPolygon()) {
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.selectPresetRegion === 'function') {
        this.spatialAnalysisUI.selectPresetRegion('dki-jakarta');
        this.updateAOIStatusCard();
        this.updateLayerSelect();
        showToast('Menggunakan wilayah contoh DKI Jakarta secara otomatis...', 'info');
      }
    }

    // 2. Batch Multi-Layer Mode
    if (targetType === 'all') {
      await this.runBatchAnalysis();
      return;
    }

    // 3. Standard Pair Overlay Mode
    const selectA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
    const selectB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;

    let idA = selectA?.value || '__aoi_active__';
    let idB = selectB?.value || '__gee_stations__';

    if (targetType === 'cities') {
      idA = '__aoi_active__';
      const layers = this.geojsonLoader.getLayers();
      idB = layers.length > 0 ? layers[0].id : '__gee_stations__';
    } else if (targetType === 'stations') {
      idA = '__aoi_active__';
      idB = '__gee_stations__';
    }

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.className = 'analysis-status-box';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="hud-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
          <span><strong>Mencari objek dalam wilayah (${SpatialIntersectAnalyzer.getModeLabel(this.currentMode)})...</strong></span>
        </div>
      `;
    }

    try {
      const [dataA, nameA] = await this.resolveLayerData(idA);
      const [dataB, nameB] = await this.resolveLayerData(idB);

      if (!dataA || !dataA.features || dataA.features.length === 0) {
        showToast(`Lapisan "${nameA}" tidak memiliki data yang valid.`, 'warning');
        if (statusBox) statusBox.style.display = 'none';
        return;
      }

      if (!dataB || !dataB.features || dataB.features.length === 0) {
        showToast(`Lapisan "${nameB}" tidak memiliki data yang valid.`, 'warning');
        if (statusBox) statusBox.style.display = 'none';
        return;
      }

      this.initMapLayers();

      const result = SpatialIntersectAnalyzer.overlay(dataA, dataB, {
        mode: this.currentMode,
        layerAName: nameA,
        layerBName: nameB
      });

      this.activeResult = result;
      this.activeBatchResult = null;

      if (!result.success) {
        showToast(result.error || 'Gagal memproses overlay', 'error');
        if (statusBox) {
          statusBox.className = 'analysis-status-box warning';
          statusBox.innerHTML = `⚠️ <strong>Gagal:</strong> ${result.error || 'Tidak dapat memproses irisan.'}`;
        }
        return;
      }

      // Update map source
      const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
      if (src && typeof src.setData === 'function' && result.data) {
        src.setData(result.data);
      }

      this.renderResults(result);

      if (this.onLayersChangeCallback) {
        this.onLayersChangeCallback();
      }

      showToast(
        `${result.modeLabel} selesai: ${result.intersectedCount} fitur ditemukan!`,
        'success'
      );
      announceToScreenReader(
        `Analisis ${result.modeLabel} selesai. ${result.intersectedCount} fitur dengan total luas ${result.intersectedAreaKm2} kilometer persegi.`
      );
    } catch (err: any) {
      logger.error('[IntersectAnalysisUI] Execution error:', err);
      showToast(`Error: ${err?.message || 'Gagal memproses analisis'}`, 'error');
      if (statusBox) statusBox.style.display = 'none';
    }
  }

  private async runBatchAnalysis() {
    const statusBox = document.getElementById('intersect-analysis-status');
    const aoi = this.spatialAnalysisUI.getActiveAOIPolygon();

    if (!aoi) {
      showToast('Gambar area AOI di atas terlebih dahulu untuk analisis multi-lapisan!', 'warning');
      document.getElementById('spatial-analysis-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const baseFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [aoi]
    };

    const targetLayers: { id: string; name: string; data: GeoJSON.FeatureCollection }[] = [];

    // Add Cities Layer
    const customLayers = this.geojsonLoader.getLayers();
    for (const l of customLayers) {
      targetLayers.push({ id: l.id, name: l.name, data: l.data });
    }

    // Add GEE Stations
    try {
      const res = await fetch('/data/gee_cfsv2_stations.geojson');
      if (res.ok) {
        const data = await res.json();
        targetLayers.push({ id: '__gee_stations__', name: 'Stasiun Observasi LST', data });
      }
    } catch (_) {}

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.className = 'analysis-status-box';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="hud-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
          <span><strong>Menganalisis AOI terhadap ${targetLayers.length} lapisan aktif...</strong></span>
        </div>
      `;
    }

    const batchRes = SpatialIntersectAnalyzer.batchOverlay(baseFC, targetLayers, {
      mode: this.currentMode,
      layerAName: 'Wilayah AOI'
    });

    this.activeBatchResult = batchRes;
    this.renderBatchResults(batchRes);
    showToast(`Analisis Multi-Lapisan selesai untuk ${targetLayers.length} layer!`, 'success');
  }

  private renderResults(result: IntersectAnalysisResult) {
    const statusBox = document.getElementById('intersect-analysis-status');
    if (!statusBox) return;

    statusBox.style.display = 'block';
    statusBox.className = 'analysis-status-box success';

    if (result.intersectedCount === 0) {
      statusBox.className = 'analysis-status-box warning';
      statusBox.innerHTML = `
        <div style="font-size: 11px;">
          <strong style="color: #facc15;">ℹ️ Tidak Ditemukan Hasil ${result.modeLabel}:</strong><br>
          Tidak ada bagian dari <strong>${result.layerBName}</strong> yang beririsan dengan <strong>${result.layerAName}</strong> (Disjoint).
        </div>
      `;
      return;
    }

    const warningHtml = result.warning
      ? `<div style="font-size: 10px; color: #facc15; margin-bottom: 6px; padding: 4px 6px; background: rgba(245, 158, 11, 0.1); border-radius: 4px;">⚠️ ${result.warning}</div>`
      : '';

    let areaMetricHtml = '';
    if (result.intersectedAreaKm2 > 0) {
      areaMetricHtml = `
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Luas Area Hasil (${result.modeLabel.split(' ')[0]})</span>
          <span class="intersect-metric-val" style="color: #00f0ff;">${result.intersectedAreaKm2.toLocaleString('id-ID')} km²</span>
          <span class="intersect-metric-sub">(${result.intersectedAreaHa.toLocaleString('id-ID')} ha · ${result.overlapPercentage}% dari ${result.layerAName})</span>
        </div>
      `;
    }

    // Category Thematic Breakdown Bars
    let catBreakdownHtml = '';
    if (result.categoryBreakdowns.length > 0) {
      const bars = result.categoryBreakdowns.map((cat) => `
        <div style="margin-bottom: 5px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
            <span style="font-weight: 600; color: #fff;">${cat.category}</span>
            <span style="color: #94a3b8;">${cat.count} objek · ${cat.percentage}%</span>
          </div>
          <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
            <div style="width: ${cat.percentage}%; height: 100%; background: ${cat.color}; border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `).join('');

      catBreakdownHtml = `
        <div style="margin-top: 10px; padding: 8px 10px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;">
          <span style="font-size: 10px; font-weight: 700; color: #00f0ff; text-transform: uppercase; letter-spacing: 0.3px; display: block; margin-bottom: 6px;">
            📊 Distribusi Tematik Kategori:
          </span>
          ${bars}
        </div>
      `;
    }

    // Interactive Summaries Table (with Hover Slicing & Click FlyTo)
    let tableHtml = '';
    if (result.featureSummaries.length > 0) {
      const rows = result.featureSummaries.slice(0, 15).map((f, idx) => {
        const areaBadge = f.areaKm2 ? `<span style="color: #00f0ff; font-size: 9.5px;">${f.areaKm2} km²</span>` : `<span style="color: var(--text-muted); font-size: 9.5px;">${f.type}</span>`;
        return `
          <tr class="intersect-table-row" data-idx="${idx}" style="cursor: pointer; transition: background 0.15s ease;">
            <td style="padding: 4px 6px; font-size: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${idx + 1}</td>
            <td style="padding: 4px 6px; font-size: 10px; font-weight: 600; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.06); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${f.name}</td>
            <td style="padding: 4px 6px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${areaBadge}</td>
          </tr>
        `;
      }).join('');

      tableHtml = `
        <div style="margin-top: 8px; max-height: 130px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; background: rgba(0,0,0,0.3);">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: rgba(255,255,255,0.05); font-size: 9.5px; color: var(--text-muted);">
                <th style="padding: 4px 6px;">#</th>
                <th style="padding: 4px 6px;">Nama Fitur</th>
                <th style="padding: 4px 6px; text-align: right;">Ukuran / Tipe</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        <span style="font-size: 9px; color: var(--text-muted); display: block; margin-top: 3px;">💡 Arahkan kursor ke baris tabel untuk menyorot geometri di peta.</span>
      `;
    }

    statusBox.innerHTML = `
      ${warningHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #00f0ff; font-size: 11px;">⚔️ Hasil ${result.modeLabel}:</strong>
        <span style="font-size: 9.5px; padding: 2px 8px; border-radius: 10px; background: rgba(0, 240, 255, 0.15); border: 1px solid rgba(0, 240, 255, 0.4); color: #00f0ff; font-weight: 600;">
          ${result.intersectedCount} Fitur Ditemukan
        </span>
      </div>

      <div class="intersect-metrics-grid">
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Jumlah Objek Ditemukan</span>
          <span class="intersect-metric-val" style="color: #4ade80;">${result.intersectedCount} Objek</span>
          <span class="intersect-metric-sub">${result.layerAName} ∩ ${result.layerBName}</span>
        </div>
        ${areaMetricHtml}
      </div>

      ${catBreakdownHtml}
      ${tableHtml}

      <div class="intersect-action-buttons-row" style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button id="btn-intersect-flyto" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Arahkan kamera peta ke cakupan hasil">
          <span>👁️ Fokuskan Peta</span>
        </button>
        <button id="btn-intersect-download-geojson" class="btn btn-outline btn-sm btn-export-geo" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Unduh GeoJSON">
          <span>📥 .GeoJSON</span>
        </button>
        <button id="btn-intersect-download-csv" class="btn btn-outline btn-sm btn-export-geo" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Unduh CSV">
          <span>📊 .CSV</span>
        </button>
        <button id="btn-intersect-download-kml" class="btn btn-outline btn-sm btn-export-geo" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Unduh KML untuk Google Earth">
          <span>🌍 .KML</span>
        </button>
      </div>
    `;

    // Bind action buttons
    document.getElementById('btn-intersect-flyto')?.addEventListener('click', () => this.flyToResult());
    document.getElementById('btn-intersect-download-geojson')?.addEventListener('click', () => this.downloadGeoJSON());
    document.getElementById('btn-intersect-download-csv')?.addEventListener('click', () => this.downloadCSV());
    document.getElementById('btn-intersect-download-kml')?.addEventListener('click', () => this.downloadKML());

    // Bind interactive table row hover & click
    const tableRows = statusBox.querySelectorAll<HTMLTableRowElement>('.intersect-table-row');
    tableRows.forEach((row) => {
      const idx = Number(row.dataset.idx);
      const feat = result.data?.features[idx];

      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(0, 240, 255, 0.12)';
        if (feat) this.highlightFeatureOnMap(feat);
      });

      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
        this.clearHighlightOnMap();
      });

      row.addEventListener('click', () => {
        if (feat) this.flyToFeature(feat);
      });
    });
  }

  private renderBatchResults(batch: BatchOverlayResult) {
    const statusBox = document.getElementById('intersect-analysis-status');
    if (!statusBox) return;

    statusBox.style.display = 'block';
    statusBox.className = 'analysis-status-box success';

    const cards = batch.results.map((r) => {
      const count = r.result.intersectedCount;
      const areaVal = r.result.intersectedAreaKm2 > 0 ? `${r.result.intersectedAreaKm2} km²` : `${count} Fitur`;
      const badgeClass = count > 0 ? 'badge-success' : 'badge-muted';
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin-bottom: 4px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px;">
          <div>
            <div style="font-size: 10.5px; font-weight: 600; color: #fff;">${r.layerName}</div>
            <div style="font-size: 9px; color: var(--text-muted);">${r.result.layerAName} ∩ ${r.layerName}</div>
          </div>
          <span style="font-size: 10px; font-weight: 700; color: #00f0ff;" class="${badgeClass}">
            ${areaVal}
          </span>
        </div>
      `;
    }).join('');

    statusBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #00f0ff; font-size: 11px;">🌐 Hasil Multi-Lapisan (Batch Overlay):</strong>
        <span style="font-size: 9.5px; padding: 2px 8px; border-radius: 10px; background: rgba(0, 240, 255, 0.15); color: #00f0ff; font-weight: 600;">
          ${batch.totalLayersProcessed} Lapisan
        </span>
      </div>

      <div class="intersect-metrics-grid">
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Total Fitur Terkena</span>
          <span class="intersect-metric-val" style="color: #4ade80;">${batch.totalIntersectedCount} Objek</span>
          <span class="intersect-metric-sub">Diuji terhadap ${batch.baseLayerName}</span>
        </div>
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Total Luas Irisan</span>
          <span class="intersect-metric-val" style="color: #00f0ff;">${batch.totalIntersectedAreaKm2} km²</span>
          <span class="intersect-metric-sub">Akumulasi seluruh layer</span>
        </div>
      </div>

      <div style="margin-top: 10px;">
        ${cards}
      </div>
    `;
  }

  public highlightFeatureOnMap(feature: GeoJSON.Feature) {
    const src = this.map.getSource('intersect-hover-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }
  }

  public clearHighlightOnMap() {
    const src = this.map.getSource('intersect-hover-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  public flyToFeature(feature: GeoJSON.Feature) {
    if (!feature.geometry) return;
    try {
      const b = bbox(feature) as [number, number, number, number];
      this.map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]]
        ],
        { padding: 80, maxZoom: 14, duration: 1000 }
      );
      this.highlightFeatureOnMap(feature);
    } catch (e) {
      logger.warn('[IntersectAnalysisUI] flyToFeature error:', e);
    }
  }

  public clearAnalysis() {
    this.activeResult = null;
    this.activeBatchResult = null;
    const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
    this.clearHighlightOnMap();

    const statusBox = document.getElementById('intersect-analysis-status');
    if (statusBox) {
      statusBox.style.display = 'none';
      statusBox.innerHTML = '';
    }

    showToast('Lapisan dan hasil analisis overlay telah dibersihkan.', 'info');
    if (this.onLayersChangeCallback) {
      this.onLayersChangeCallback();
    }
  }

  public flyToResult() {
    if (!this.activeResult || !this.activeResult.bbox) {
      showToast('Tidak ada batas cakupan wilayah hasil untuk difokuskan.', 'warning');
      return;
    }

    const b = this.activeResult.bbox;
    this.map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]]
      ],
      { padding: 60, maxZoom: 13, duration: 1200 }
    );
  }

  private downloadGeoJSON() {
    if (!this.activeResult || !this.activeResult.data) {
      showToast('Tidak ada data irisan untuk diunduh.', 'warning');
      return;
    }

    const str = JSON.stringify(this.activeResult.data, null, 2);
    const blob = new Blob([str], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overlay_${this.activeResult.mode}_${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Berkas GeoJSON hasil overlay berhasil diunduh!', 'success');
  }

  private downloadCSV() {
    if (!this.activeResult || !this.activeResult.featureSummaries || this.activeResult.featureSummaries.length === 0) {
      showToast('Tidak ada ringkasan fitur untuk diunduh sebagai CSV.', 'warning');
      return;
    }

    const headers = ['No', 'Nama Fitur', 'Tipe Geometri', 'Kategori', 'Luas (km2)', 'Luas (Ha)', 'Lapisan Basis', 'Lapisan Target'];
    const rows = this.activeResult.featureSummaries.map((f, i) => [
      i + 1,
      `"${f.name.replace(/"/g, '""')}"`,
      f.type,
      `"${(f.category || 'Umum').replace(/"/g, '""')}"`,
      f.areaKm2 || 0,
      f.areaHa || 0,
      `"${f.layerA.replace(/"/g, '""')}"`,
      `"${f.layerB.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overlay_summary_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Ringkasan overlay CSV berhasil diunduh!', 'success');
  }

  private downloadKML() {
    if (!this.activeResult || !this.activeResult.data) {
      showToast('Tidak ada data overlay untuk diunduh.', 'warning');
      return;
    }

    try {
      import('../utils/kml-exporter').then(({ geoJsonToKml, downloadKml }) => {
        const title = `${this.activeResult?.modeLabel}: ${this.activeResult?.layerAName} x ${this.activeResult?.layerBName}`;
        const kmlString = geoJsonToKml(this.activeResult!.data!, title);
        downloadKml(kmlString, `overlay_${Date.now()}.kml`);
        showToast('Hasil overlay KML berhasil diunduh!', 'success');
      });
    } catch {
      showToast('Gagal memproses ekspor KML.', 'error');
    }
  }

  private async resolveLayerData(id: string): Promise<[GeoJSON.FeatureCollection | null, string]> {
    if (id === '__aoi_active__') {
      let aoi = this.spatialAnalysisUI?.getActiveAOIPolygon ? this.spatialAnalysisUI.getActiveAOIPolygon() : null;
      if (!aoi) {
        // Safe fallback polygon for DKI Jakarta
        aoi = {
          type: 'Feature',
          properties: { name: 'DKI Jakarta (Contoh)' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [106.68, -6.08],
              [106.98, -6.08],
              [106.98, -6.38],
              [106.68, -6.38],
              [106.68, -6.08]
            ]]
          }
        };
      }
      return [
        {
          type: 'FeatureCollection',
          features: [aoi]
        },
        aoi.properties?.name || 'Wilayah Aktif'
      ];
    }

    if (id === '__gee_stations__') {
      try {
        const res = await fetch('/data/gee_cfsv2_stations.geojson');
        if (!res.ok) throw new Error('Failed to fetch stations');
        const data = await res.json();
        return [data, 'Stasiun Observasi MODIS LST'];
      } catch (err) {
        logger.error('[IntersectAnalysisUI] Failed to load stations:', err);
        return [null, 'Stasiun Observasi MODIS LST'];
      }
    }

    const layer = this.geojsonLoader.getLayer(id);
    if (layer) {
      return [layer.data, layer.name];
    }

    return [null, 'Lapisan'];
  }
}
