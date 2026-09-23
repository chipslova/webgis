import * as maplibregl from 'maplibre-gl';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { SpatialAnalysisUI } from './spatial-analysis-ui';
import {
  SpatialIntersectAnalyzer,
  IntersectAnalysisResult
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
  private selectedColor: string = '#f97316'; // Vivid Orange default for contrast
  private selectedOpacity: number = 0.65;

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
    this.updateLayerSelect();
  }

  public getAllMapLayerIds(): string[] {
    return [
      'intersect-result-fill',
      'intersect-result-line',
      'intersect-result-points'
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
      if (!this.map.getSource('intersect-result-source')) {
        this.map.addSource('intersect-result-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      // 1. Polygon Fill
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

      // 2. Line & Polygon Casing
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

      // 3. Point Circles
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

    let optionsHtmlA = '<option value="" disabled selected>Pilih lapisan input A (Dasar / Wilayah)...</option>';
    let optionsHtmlB = '<option value="" disabled selected>Pilih lapisan input B (Target / Overlay)...</option>';

    if (activeAOI) {
      optionsHtmlA += '<option value="__aoi_active__">🎯 Wilayah AOI Aktif (Poligon Gambaran)</option>';
      optionsHtmlB += '<option value="__aoi_active__">🎯 Wilayah AOI Aktif (Poligon Gambaran)</option>';
    }

    // Add GEE Stations option if available
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
    }
    if (valB && selectB.querySelector(`option[value="${valB}"]`)) {
      selectB.value = valB;
    }
  }

  private bindEvents() {
    const runBtn = document.getElementById('btn-run-intersect-analysis');
    const clearBtn = document.getElementById('btn-clear-intersect-analysis');
    const opacitySlider = document.getElementById('intersect-opacity-slider') as HTMLInputElement | null;
    const opacityVal = document.getElementById('intersect-opacity-val');
    const colorChips = document.querySelectorAll<HTMLButtonElement>('.intersect-color-chip');
    const customColorInput = document.getElementById('intersect-color-custom') as HTMLInputElement | null;

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
        const color = chip.dataset.color || '#f97316';
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
    const selectA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
    const selectB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
    const statusBox = document.getElementById('intersect-analysis-status');

    if (!selectA || !selectA.value) {
      showToast('Pilih Lapisan Input A terlebih dahulu!', 'warning');
      return;
    }

    if (!selectB || !selectB.value) {
      showToast('Pilih Lapisan Input B (Target Irisan) terlebih dahulu!', 'warning');
      return;
    }

    if (selectA.value === selectB.value) {
      showToast('Lapisan Input A dan B harus berbeda untuk analisis irisan!', 'warning');
      return;
    }

    const idA = selectA.value;
    const idB = selectB.value;

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.className = 'analysis-status-box';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="hud-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
          <span><strong>Menghitung irisan spasial (Spatial Intersect)...</strong></span>
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

      const result = SpatialIntersectAnalyzer.intersect(dataA, dataB, {
        layerAName: nameA,
        layerBName: nameB
      });

      this.activeResult = result;

      if (!result.success) {
        showToast(result.error || 'Gagal memproses intersect', 'error');
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
        `Analisis Intersect selesai: ${result.intersectedCount} fitur beririsan ditemukan!`,
        'success'
      );
      announceToScreenReader(
        `Analisis tumpang tindih spasial selesai. ${result.intersectedCount} fitur beririsan dengan total luas ${result.intersectedAreaKm2} kilometer persegi.`
      );
    } catch (err: any) {
      logger.error('[IntersectAnalysisUI] Execution error:', err);
      showToast(`Error: ${err?.message || 'Gagal memproses analisis'}`, 'error');
      if (statusBox) statusBox.style.display = 'none';
    }
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
          <strong style="color: #facc15;">ℹ️ Tidak Ditemukan Irisan Spasial:</strong><br>
          Tidak ada bagian dari <strong>${result.layerBName}</strong> yang berpotongan atau berada di dalam area <strong>${result.layerAName}</strong> (Disjoint).
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
          <span class="intersect-metric-label">Luas Irisan (Overlap)</span>
          <span class="intersect-metric-val" style="color: #38bdf8;">${result.intersectedAreaKm2.toLocaleString('id-ID')} km²</span>
          <span class="intersect-metric-sub">(${result.intersectedAreaHa.toLocaleString('id-ID')} ha · ${result.overlapPercentage}% dari ${result.layerAName})</span>
        </div>
      `;
    }

    // Build summaries table if summaries exist
    let tableHtml = '';
    if (result.featureSummaries.length > 0) {
      const rows = result.featureSummaries.slice(0, 15).map((f, idx) => {
        const areaBadge = f.areaKm2 ? `<span style="color: #38bdf8; font-size: 9.5px;">${f.areaKm2} km²</span>` : `<span style="color: var(--text-muted); font-size: 9.5px;">${f.type}</span>`;
        return `
          <tr>
            <td style="padding: 4px 6px; font-size: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${idx + 1}</td>
            <td style="padding: 4px 6px; font-size: 10px; font-weight: 600; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.06); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${f.name}</td>
            <td style="padding: 4px 6px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${areaBadge}</td>
          </tr>
        `;
      }).join('');

      tableHtml = `
        <div style="margin-top: 8px; max-height: 140px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; background: rgba(0,0,0,0.3);">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: rgba(255,255,255,0.05); font-size: 9.5px; color: var(--text-muted);">
                <th style="padding: 4px 6px;">#</th>
                <th style="padding: 4px 6px;">Nama Fitur Irisan</th>
                <th style="padding: 4px 6px; text-align: right;">Ukuran / Tipe</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }

    statusBox.innerHTML = `
      ${warningHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #38bdf8; font-size: 11px;">⚔️ Hasil Analisis Irisan (Intersect):</strong>
        <span style="font-size: 9.5px; padding: 2px 6px; border-radius: 10px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600;">
          ${result.intersectedCount} Fitur
        </span>
      </div>

      <div class="intersect-metrics-grid">
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Jumlah Fitur Beririsan</span>
          <span class="intersect-metric-val" style="color: #4ade80;">${result.intersectedCount} Objek</span>
          <span class="intersect-metric-sub">Irisan: ${result.layerAName} ∩ ${result.layerBName}</span>
        </div>
        ${areaMetricHtml}
      </div>

      ${tableHtml}

      <div class="intersect-action-buttons-row" style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button id="btn-intersect-flyto" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Arahkan kamera peta ke cakupan irisan">
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

    // Bind result action buttons
    document.getElementById('btn-intersect-flyto')?.addEventListener('click', () => {
      this.flyToResult();
    });

    document.getElementById('btn-intersect-download-geojson')?.addEventListener('click', () => {
      this.downloadGeoJSON();
    });

    document.getElementById('btn-intersect-download-csv')?.addEventListener('click', () => {
      this.downloadCSV();
    });

    document.getElementById('btn-intersect-download-kml')?.addEventListener('click', () => {
      this.downloadKML();
    });
  }

  public clearAnalysis() {
    this.activeResult = null;
    const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({ type: 'FeatureCollection', features: [] });
    }

    const statusBox = document.getElementById('intersect-analysis-status');
    if (statusBox) {
      statusBox.style.display = 'none';
      statusBox.innerHTML = '';
    }

    showToast('Lapisan dan hasil analisis intersect telah dibersihkan.', 'info');
    if (this.onLayersChangeCallback) {
      this.onLayersChangeCallback();
    }
  }

  public flyToResult() {
    if (!this.activeResult || !this.activeResult.bbox) {
      showToast('Tidak ada batas cakupan wilayah irisan untuk difokuskan.', 'warning');
      return;
    }

    const b = this.activeResult.bbox;
    this.map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]]
      ],
      { padding: 60, duration: 1200, maxZoom: 14 }
    );
    showToast('Kamera peta diarahkan ke cakupan hasil irisan.', 'info');
  }

  private downloadGeoJSON() {
    if (!this.activeResult || !this.activeResult.data) {
      showToast('Tidak ada data irisan untuk diunduh.', 'warning');
      return;
    }

    const jsonStr = JSON.stringify(this.activeResult.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intersect_${this.sanitizeFilename(this.activeResult.layerAName)}_${this.sanitizeFilename(this.activeResult.layerBName)}_${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Hasil intersect GeoJSON berhasil diunduh!', 'success');
  }

  private downloadCSV() {
    if (!this.activeResult || !this.activeResult.featureSummaries || this.activeResult.featureSummaries.length === 0) {
      showToast('Tidak ada baris data irisan untuk diunduh.', 'warning');
      return;
    }

    const headers = ['No', 'Nama_Fitur', 'Tipe_Geometri', 'Luas_km2', 'Lapisan_A', 'Lapisan_B'];
    const rows = this.activeResult.featureSummaries.map((f, idx) => [
      idx + 1,
      `"${(f.name || '').replace(/"/g, '""')}"`,
      `"${f.type || ''}"`,
      f.areaKm2 || 0,
      `"${(f.layerA || '').replace(/"/g, '""')}"`,
      `"${(f.layerB || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intersect_summary_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Ringkasan intersect CSV berhasil diunduh!', 'success');
  }

  private downloadKML() {
    if (!this.activeResult || !this.activeResult.data) {
      showToast('Tidak ada data irisan untuk diunduh.', 'warning');
      return;
    }

    try {
      import('../utils/kml-exporter').then(({ geoJsonToKml, downloadKml }) => {
        const title = `Intersect ${this.activeResult?.layerAName} x ${this.activeResult?.layerBName}`;
        const kmlString = geoJsonToKml(this.activeResult!.data!, title);
        downloadKml(kmlString, `intersect_${Date.now()}.kml`);
        showToast('Hasil intersect KML berhasil diunduh!', 'success');
      });
    } catch {
      showToast('Gagal memproses ekspor KML.', 'error');
    }
  }

  private async resolveLayerData(id: string): Promise<[GeoJSON.FeatureCollection | null, string]> {
    if (id === '__aoi_active__') {
      const aoi = this.spatialAnalysisUI.getActiveAOIPolygon();
      if (!aoi) return [null, 'Wilayah AOI Aktif'];
      return [
        {
          type: 'FeatureCollection',
          features: [aoi]
        },
        'Wilayah AOI Aktif'
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

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }
}
