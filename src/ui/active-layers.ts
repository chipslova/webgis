import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { MeasureTool } from '../tools/measure';
import { TabId } from './sidebar';

export class ActiveLayersUI {
  private mapManager: MapManager;
  private pikselLoader: PikselLoader;
  private geeLoader: GEELoader;
  private geojsonLoader: GeoJsonLoader;
  private measureTool: MeasureTool;
  private containerId: string;
  private onNavigateTab?: (tabId: TabId) => void;
  private expandedLayerId: string | null = null;

  constructor(
    containerId: string,
    mapManager: MapManager,
    pikselLoader: PikselLoader,
    geeLoader: GEELoader,
    geojsonLoader: GeoJsonLoader,
    measureTool: MeasureTool,
    onNavigateTab?: (tabId: TabId) => void
  ) {
    this.containerId = containerId;
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.geojsonLoader = geojsonLoader;
    this.measureTool = measureTool;
    this.onNavigateTab = onNavigateTab;

    this.init();
  }

  public init() {
    this.render();
    this.bindEvents();

    this.pikselLoader.onLayersChange(() => this.render());
    this.geeLoader.onLayersChange(() => this.render());
    this.geojsonLoader.onLayersChange(() => this.render());
    this.measureTool.onResult(() => this.render());
  }

  // ─── SVG Icons ───────────────────────────────────────────────────────────────

  private eyeOnSvg(color = 'currentColor') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }

  private eyeOffSvg() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;
  }

  private removeSvg() {
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  }

  // ─── Compact Row Builder ──────────────────────────────────────────────────────

  private buildRow(params: {
    id: string;
    name: string;
    meta: string;
    color: string;
    isVisible: boolean;
    opacityPct: number;
    eyeBtnClass: string;
    removeBtnClass: string;
    opacitySliderClass?: string;
    details?: { label: string; value: string }[];
    legendHtml?: string;
    actionsHtml?: string;
    noEye?: boolean;
    noOpacity?: boolean;
  }): string {
    const isExpanded = this.expandedLayerId === params.id;
    const showOpacity = !params.noOpacity && params.isVisible;

    const eyeBtn = params.noEye ? '' : `
      <button class="al-eye-btn ${params.eyeBtnClass}" data-id="${params.id}" aria-label="${params.isVisible ? 'Sembunyikan layer ' + params.name : 'Tampilkan layer ' + params.name}" title="${params.isVisible ? 'Sembunyikan layer' : 'Tampilkan layer'}">
        ${params.isVisible ? this.eyeOnSvg() : this.eyeOffSvg()}
      </button>
    `;

    const detailGrid = (params.details || []).map(d => `
      <span class="al-detail-label">${d.label}</span>
      <span class="al-detail-val">${d.value}</span>
    `).join('');

    const opacitySlider = (params.opacitySliderClass && showOpacity) ? `
      <div class="al-detail-opacity">
        <span class="al-detail-label">Transparansi</span>
        <div class="al-detail-opacity-ctrl">
          <input type="range" class="active-layer-slider ${params.opacitySliderClass}" data-id="${params.id}" min="0" max="100" value="${params.opacityPct}" aria-label="Transparansi ${params.name}" />
          <span class="al-opacity-val slider-pct">${params.opacityPct}%</span>
        </div>
      </div>
    ` : '';

    const legendBlock = params.legendHtml ? `
      <div class="al-detail-legend">
        <span class="al-detail-label">Legenda Simbol</span>
        ${params.legendHtml}
      </div>
    ` : '';

    const actionsBlock = params.actionsHtml ? `
      <div class="al-detail-actions" style="margin-top: 8px;">
        ${params.actionsHtml}
      </div>
    ` : '';

    return `
      <div class="al-row ${!params.isVisible ? 'al-row-hidden' : ''} ${isExpanded ? 'al-row-expanded' : ''}" data-layer-id="${params.id}">
        <div class="al-row-compact">
          ${eyeBtn}
          <span class="al-color-dot" style="background:${params.color};" aria-hidden="true"></span>
          <div class="al-row-body" data-expand-id="${params.id}" role="button" tabindex="0" aria-expanded="${isExpanded}" aria-label="Buka detail layer ${params.name}">
            <span class="al-name">${params.name}</span>
            <span class="al-meta">${params.meta}</span>
          </div>
          ${showOpacity ? `<span class="al-opacity-chip" aria-label="Transparansi ${params.opacityPct} persen">${params.opacityPct}%</span>` : ''}
          <button class="al-remove-btn ${params.removeBtnClass}" data-id="${params.id}" aria-label="Hapus layer ${params.name}" title="Hapus dari layer aktif">
            ${this.removeSvg()}
          </button>
        </div>
        ${isExpanded ? `
          <div class="al-row-detail" role="region" aria-label="Detail opsi ${params.name}">
            ${detailGrid ? `<div class="al-detail-grid">${detailGrid}</div>` : ''}
            ${legendBlock}
            ${opacitySlider}
            ${actionsBlock}
          </div>
        ` : ''}
      </div>
    `;
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  public render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const activePiksel      = this.pikselLoader.getActiveProduct();
    const isPikselVisible   = this.pikselLoader.isLayerVisible();
    const isPikselGridOn    = this.pikselLoader.isGridVisible();
    const customLayers      = this.geojsonLoader.getLayers();
    const hasMeasure        = this.measureTool.hasActiveMeasurement();

    const isGeePoiActive    = this.geeLoader.isLayerActive('poi');
    const isGeePoiVis       = this.geeLoader.isLayerVisible('poi');
    const isGeeLstActive    = this.geeLoader.isLayerActive('lst');
    const isGeeLstVis       = this.geeLoader.isLayerVisible('lst');
    const isGeeElvActive    = this.geeLoader.isLayerActive('elevation');
    const isGeeElvVis       = this.geeLoader.isLayerVisible('elevation');
    const isGeeLcActive     = this.geeLoader.isLayerActive('landcover');
    const isGeeLcVis        = this.geeLoader.isLayerVisible('landcover');

    let layerCount = 0;
    if (activePiksel) layerCount++;
    if (isPikselGridOn) layerCount++;
    if (isGeePoiActive) layerCount++;
    if (isGeeLstActive) layerCount++;
    if (isGeeElvActive) layerCount++;
    if (isGeeLcActive) layerCount++;
    layerCount += customLayers.length;
    if (hasMeasure) layerCount++;

    let itemsHtml = '';

    if (layerCount === 0) {
      itemsHtml = `
        <div class="al-empty">
          <div class="al-empty-header-badge">🚀 MULAI EKSPLORASI DATA</div>
          <p class="al-empty-title">Pilih Preset Analisis Cepat</p>
          <p class="al-empty-sub">Klik salah satu pintasan di bawah untuk langsung memuat citra satelit atau studi analitis ke atas peta:</p>
        </div>
        <div class="al-onboard-grid">
          <button class="al-onboard-btn al-onboard-featured" data-quick-action="sentinel_rgb">
            <span class="al-onboard-icon">🛰️</span>
            <div>
              <strong>Citra Sentinel-2 Bebas Awan</strong>
              <span>Warna Alami 10m · Tahunan 2025 (BIG)</span>
            </div>
          </button>
          <button class="al-onboard-btn" data-quick-action="sentinel_ndvi">
            <span class="al-onboard-icon">🌳</span>
            <div>
              <strong>Kerapatan Vegetasi (NDVI)</strong>
              <span>Indeks Kehijauan Kanopi Tanaman</span>
            </div>
          </button>
          <button class="al-onboard-btn" data-quick-action="gee_lst">
            <span class="al-onboard-icon">🌡️</span>
            <div>
              <strong>Analisis Suhu Permukaan (UHI)</strong>
              <span>MODIS LST Jabodetabek & Jawa Barat</span>
            </div>
          </button>
          <button class="al-onboard-btn" data-quick-action="measure">
            <span class="al-onboard-icon">📐</span>
            <div>
              <strong>Ukur Jarak & Luas Area</strong>
              <span>Kalkulasi Geodesik Turf.js Interaktif</span>
            </div>
          </button>
        </div>
      `;
    } else {
      // 1. Measurement (no eye toggle, no opacity)
      if (hasMeasure) {
        itemsHtml += this.buildRow({
          id: 'measure',
          name: 'Pengukuran Spasial',
          meta: 'Turf.js · Geodesik',
          color: '#00f0ff',
          isVisible: true,
          opacityPct: 100,
          eyeBtnClass: '',
          removeBtnClass: 'btn-clear-active-measure',
          noEye: true,
          noOpacity: true,
          details: [
            { label: 'Engine', value: 'Turf.js Geodesic' },
            { label: 'Datum', value: 'WGS84 (EPSG:4326)' },
          ]
        });
      }

      // 2. Custom GeoJSON layers
      customLayers.forEach((layer) => {
        const opacityPct = Math.round((layer.opacity ?? 1.0) * 100);
        itemsHtml += this.buildRow({
          id: layer.id,
          name: layer.name,
          meta: `GeoJSON · ${layer.featureCount} fitur`,
          color: layer.color,
          isVisible: layer.visible !== false,
          opacityPct,
          eyeBtnClass: 'btn-toggle-geojson',
          removeBtnClass: 'btn-delete-active-geojson',
          opacitySliderClass: 'geojson-opacity-slider',
          details: [
            { label: 'Format', value: 'GeoJSON Vektor' },
            { label: 'Tipe Geometri', value: layer.type.toUpperCase() },
            { label: 'Jumlah Fitur', value: String(layer.featureCount) },
          ],
          actionsHtml: `
            <button class="btn btn-outline full-width al-zoom-geojson-btn" data-id="${layer.id}" style="font-size: 11px; padding: 5px 8px;">
              🔍 Zoom ke Cakupan Layer
            </button>
          `
        });
      });

      // 3. GEE POI Observation
      if (isGeePoiActive) {
        itemsHtml += this.buildRow({
          id: 'gee-poi',
          name: 'Stasiun Observasi UHI',
          meta: 'GEE · Urban vs Rural',
          color: '#ef4444',
          isVisible: isGeePoiVis,
          opacityPct: 100,
          eyeBtnClass: 'btn-toggle-gee-poi',
          removeBtnClass: 'btn-remove-gee-poi',
          noOpacity: true,
          details: [
            { label: 'Sumber', value: 'Google Earth Engine' },
            { label: 'Lokasi', value: 'Monas (Jakarta) & IPB Forest (Bogor)' },
          ],
          legendHtml: `
            <div class="poi-tags" style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              <span class="poi-tag urban-tag" style="font-size: 10px; padding: 2px 6px;">🔴 Urban Core: Monas Jakarta (33.85°C)</span>
              <span class="poi-tag rural-tag" style="font-size: 10px; padding: 2px 6px;">🟢 Rural: Hutan IPB Bogor (24.60°C)</span>
            </div>
          `
        });
      }

      // 4. Piksel Data Cube Grid
      if (isPikselGridOn) {
        itemsHtml += this.buildRow({
          id: 'piksel-grid',
          name: 'Tile Grid ODC',
          meta: 'BIG Piksel · 1.631 tile',
          color: '#10b981',
          isVisible: true,
          opacityPct: 100,
          eyeBtnClass: '',
          removeBtnClass: 'btn-toggle-piksel-grid',
          noEye: true,
          noOpacity: true,
          details: [
            { label: 'Sumber', value: 'BIG Piksel / Open Data Cube' },
            { label: 'Cakupan', value: '1.631 tile grid nasional · 10m' },
          ]
        });
      }

      // 5. GEE LST
      if (isGeeLstActive) {
        const lstOpacityPct = Math.round(this.geeLoader.getLayerOpacity('lst') * 100);
        itemsHtml += this.buildRow({
          id: 'gee-lst',
          name: 'MODIS LST Heatmap',
          meta: 'GEE · 1.000m · Termal Siang',
          color: '#f59e0b',
          isVisible: isGeeLstVis,
          opacityPct: lstOpacityPct,
          eyeBtnClass: 'btn-toggle-gee-lst',
          removeBtnClass: 'btn-remove-gee-lst',
          opacitySliderClass: 'gee-lst-opacity-slider',
          details: [
            { label: 'Sensor', value: 'MODIS Terra (MOD11A2)' },
            { label: 'Resolusi', value: '1.000 meter' },
            { label: 'Rentang Waktu', value: '2020–2024 (Rata-rata Musim Kemarau)' },
          ],
          legendHtml: `
            <div class="gee-legend-bar lst-gradient" style="height: 6px; border-radius: 3px; margin: 4px 0;"></div>
            <div class="gee-legend-labels" style="font-size: 9.5px; color: var(--text-muted); display:flex; justify-content:space-between;">
              <span>22°C (Sejuk)</span><span>28°C</span><span>34°C+ (Ekstrem)</span>
            </div>
          `
        });
      }

      // 6. GEE SRTM Elevation
      if (isGeeElvActive) {
        const elvOpacityPct = Math.round(this.geeLoader.getLayerOpacity('elevation') * 100);
        itemsHtml += this.buildRow({
          id: 'gee-elevation',
          name: 'Elevasi SRTM DEM',
          meta: 'GEE · 30m · USGS Topografi',
          color: '#84cc16',
          isVisible: isGeeElvVis,
          opacityPct: elvOpacityPct,
          eyeBtnClass: 'btn-toggle-gee-elv',
          removeBtnClass: 'btn-remove-gee-elv',
          opacitySliderClass: 'gee-elv-opacity-slider',
          details: [
            { label: 'Sumber', value: 'USGS / NASA / GEE' },
            { label: 'Produk', value: 'SRTM V3 (Shuttle Radar Topography)' },
            { label: 'Resolusi', value: '30 meter' },
          ],
          legendHtml: `
            <div class="gee-legend-bar elv-gradient" style="height: 6px; border-radius: 3px; margin: 4px 0;"></div>
            <div class="gee-legend-labels" style="font-size: 9.5px; color: var(--text-muted); display:flex; justify-content:space-between;">
              <span>0m (Pesisir)</span><span>200m</span><span>600m</span><span>1200m+ (Puncak)</span>
            </div>
          `
        });
      }

      // 7. GEE Land Cover
      if (isGeeLcActive) {
        const lcOpacityPct = Math.round(this.geeLoader.getLayerOpacity('landcover') * 100);
        itemsHtml += this.buildRow({
          id: 'gee-landcover',
          name: 'Tutupan Lahan MODIS',
          meta: 'GEE · 500m · MCD12Q1',
          color: '#22c55e',
          isVisible: isGeeLcVis,
          opacityPct: lcOpacityPct,
          eyeBtnClass: 'btn-toggle-gee-lc',
          removeBtnClass: 'btn-remove-gee-lc',
          opacitySliderClass: 'gee-lc-opacity-slider',
          details: [
            { label: 'Sumber', value: 'NASA LP DAAC / GEE' },
            { label: 'Produk', value: 'MCD12Q1 Klasifikasi Tahunan' },
            { label: 'Resolusi', value: '500 meter' },
          ],
          legendHtml: `
            <div class="lc-tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
              <span class="lc-chip" style="border-left-color: #0284c7; font-size: 10px; padding: 2px 6px;">Laut / Air</span>
              <span class="lc-chip" style="border-left-color: #e11d48; font-size: 10px; padding: 2px 6px;">Perkotaan</span>
              <span class="lc-chip" style="border-left-color: #eab308; font-size: 10px; padding: 2px 6px;">Pertanian</span>
              <span class="lc-chip" style="border-left-color: #15803d; font-size: 10px; padding: 2px 6px;">Hutan</span>
            </div>
          `
        });
      }

      // 8. Piksel OGC Satellite
      if (activePiksel) {
        const pikselOpacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
        const yearText = activePiksel.timeEnabled ? this.pikselLoader.getSelectedYear() : '';
        itemsHtml += this.buildRow({
          id: 'piksel',
          name: activePiksel.name,
          meta: `OGC WMS · ${activePiksel.resolution}`,
          color: activePiksel.color,
          isVisible: isPikselVisible,
          opacityPct: pikselOpacityPct,
          eyeBtnClass: 'btn-toggle-piksel-visibility',
          removeBtnClass: 'btn-remove-active-piksel',
          opacitySliderClass: 'piksel-opacity-slider',
          details: [
            { label: 'Portal', value: 'BIG Piksel / Open Data Cube' },
            { label: 'Protokol', value: 'OGC WMS 1.3.0' },
            { label: 'Resolusi', value: activePiksel.resolution },
            ...(yearText ? [{ label: 'Tahun Akuisisi', value: yearText }] : []),
          ],
          legendHtml: `
            <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 4px;">
              🛰️ Layer OGC WMS resmi BIG Indonesia. Tampilan komposit resolusi ${activePiksel.resolution}.
            </div>
          `
        });
      }
    }

    container.innerHTML = `
      <div class="al-header">
        <div class="al-header-left">
          <span class="al-header-label">TUMPUKAN LAYER AKTIF</span>
          ${layerCount > 0 ? `<span class="al-count">${layerCount}</span>` : ''}
        </div>
        ${layerCount > 0 ? `
          <button id="btn-al-clear-all" class="btn-micro btn-micro-mute" title="Nonaktifkan semua layer overlay">
            Bersihkan Semua
          </button>
        ` : ''}
      </div>
      <div class="al-list">
        ${itemsHtml}
      </div>
    `;

    this.mapManager.enforceLayerOrder();
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  private bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Quick action starter presets
      const quickActionBtn = target.closest('[data-quick-action]') as HTMLElement;
      if (quickActionBtn?.dataset.quickAction) {
        const action = quickActionBtn.dataset.quickAction;
        const map = this.mapManager.getMap();

        if (action === 'sentinel_rgb') {
          this.pikselLoader.setActiveProduct('s2-geomad-rgb');
          this.pikselLoader.setSelectedYear('2025');
          map?.flyTo({ center: [112.953, -7.942], zoom: 9.5, duration: 1600 });
          this.render();
        } else if (action === 'sentinel_ndvi') {
          this.pikselLoader.setActiveProduct('s2-ndvi');
          this.pikselLoader.setSelectedYear('2025');
          map?.flyTo({ center: [110.440, -7.540], zoom: 9.5, duration: 1600 });
          this.render();
        } else if (action === 'gee_lst') {
          this.geeLoader.toggleLayer('lst', true);
          this.geeLoader.toggleLayer('poi', true);
          this.geeLoader.flyToStudyArea();
          this.render();
        } else if (action === 'measure') {
          if (this.onNavigateTab) {
            this.onNavigateTab('measure');
          } else {
            document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
              (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === 'measure');
            });
            document.querySelectorAll('.sidebar-panel').forEach(p => {
              (p as HTMLElement).classList.toggle('active', (p as HTMLElement).id === 'panel-measure');
            });
          }
          this.measureTool.setMode('distance');
          document.getElementById('btn-measure-dist')?.classList.add('active');
          const instructionBox = document.getElementById('measure-instruction-box');
          if (instructionBox) instructionBox.style.display = 'block';
        }
        return;
      }

      // Onboarding tab navigation
      const goTabBtn = target.closest('[data-go-tab]') as HTMLElement;
      if (goTabBtn?.dataset.goTab) {
        const tabId = goTabBtn.dataset.goTab as TabId;
        if (this.onNavigateTab) {
          this.onNavigateTab(tabId);
        } else {
          document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
            const b = btn as HTMLElement;
            b.classList.toggle('active', b.dataset.tab === tabId);
          });
          document.querySelectorAll('.sidebar-panel').forEach(panel => {
            const p = panel as HTMLElement;
            p.classList.toggle('active', p.id === `panel-${tabId}`);
          });
        }
        return;
      }

      // Do NOT expand row if clicking eye or remove buttons
      if (target.closest('.al-eye-btn') || target.closest('.al-remove-btn')) {
        // handled below
      } else {
        // Expand/collapse on row body click
        const rowBody = target.closest('.al-row-body') as HTMLElement;
        if (rowBody?.dataset.expandId) {
          const id = rowBody.dataset.expandId;
          this.expandedLayerId = this.expandedLayerId === id ? null : id;
          this.render();
          return;
        }
      }

      // ── Eye toggle buttons ──────────────────────────────────────────────────

      if (target.closest('.btn-toggle-piksel-visibility')) {
        this.pikselLoader.setLayerVisible(!this.pikselLoader.isLayerVisible());
        this.render();
        return;
      }

      if (target.closest('.btn-toggle-gee-poi')) {
        this.geeLoader.setLayerVisible('poi', !this.geeLoader.isLayerVisible('poi'));
        this.render();
        return;
      }

      if (target.closest('.btn-toggle-gee-lst')) {
        this.geeLoader.setLayerVisible('lst', !this.geeLoader.isLayerVisible('lst'));
        this.render();
        return;
      }

      if (target.closest('.btn-toggle-gee-elv')) {
        this.geeLoader.setLayerVisible('elevation', !this.geeLoader.isLayerVisible('elevation'));
        this.render();
        return;
      }

      if (target.closest('.btn-toggle-gee-lc')) {
        this.geeLoader.setLayerVisible('landcover', !this.geeLoader.isLayerVisible('landcover'));
        this.render();
        return;
      }

      const toggleGeoJsonBtn = target.closest('.btn-toggle-geojson') as HTMLElement;
      if (toggleGeoJsonBtn?.dataset.id) {
        const layer = this.geojsonLoader.getLayers().find(l => l.id === toggleGeoJsonBtn.dataset.id);
        if (layer) {
          this.geojsonLoader.toggleLayerVisibility(layer.id, layer.visible === false);
          this.render();
        }
        return;
      }

      // ── Clear All Overlays button ──────────────────────────────────────────
      if (target.closest('#btn-al-clear-all')) {
        this.pikselLoader.setActiveProduct(null);
        this.pikselLoader.setGridVisible(false);
        this.geeLoader.toggleLayer('poi', false);
        this.geeLoader.toggleLayer('lst', false);
        this.geeLoader.toggleLayer('elevation', false);
        this.geeLoader.toggleLayer('landcover', false);
        this.measureTool.clear();
        this.expandedLayerId = null;
        this.render();
        return;
      }

      // ── Zoom to GeoJSON layer extent ────────────────────────────────────────
      const zoomGeoJsonBtn = target.closest('.al-zoom-geojson-btn') as HTMLElement;
      if (zoomGeoJsonBtn?.dataset.id) {
        this.geojsonLoader.zoomToLayer(zoomGeoJsonBtn.dataset.id);
        return;
      }

      // ── Remove buttons ──────────────────────────────────────────────────────

      if (target.closest('.btn-clear-active-measure')) {
        this.measureTool.clear();
        if (this.expandedLayerId === 'measure') this.expandedLayerId = null;
        this.render();
        return;
      }

      if (target.closest('.btn-remove-active-piksel')) {
        this.pikselLoader.setActiveProduct(null);
        if (this.expandedLayerId === 'piksel') this.expandedLayerId = null;
        this.render();
        return;
      }

      if (target.closest('.btn-toggle-piksel-grid')) {
        this.pikselLoader.setGridVisible(false);
        if (this.expandedLayerId === 'piksel-grid') this.expandedLayerId = null;
        this.render();
        return;
      }

      if (target.closest('.btn-remove-gee-poi')) {
        this.geeLoader.toggleLayer('poi', false);
        if (this.expandedLayerId === 'gee-poi') this.expandedLayerId = null;
        this.render();
        return;
      }

      if (target.closest('.btn-remove-gee-lst')) {
        this.geeLoader.toggleLayer('lst', false);
        if (this.expandedLayerId === 'gee-lst') this.expandedLayerId = null;
        this.render();
        return;
      }

      if (target.closest('.btn-remove-gee-elv')) {
        this.geeLoader.toggleLayer('elevation', false);
        if (this.expandedLayerId === 'gee-elevation') this.expandedLayerId = null;
        this.render();
        return;
      }

      if (target.closest('.btn-remove-gee-lc')) {
        this.geeLoader.toggleLayer('landcover', false);
        if (this.expandedLayerId === 'gee-landcover') this.expandedLayerId = null;
        this.render();
        return;
      }

      const deleteGeoJsonBtn = target.closest('.btn-delete-active-geojson') as HTMLElement;
      if (deleteGeoJsonBtn?.dataset.id) {
        if (this.expandedLayerId === deleteGeoJsonBtn.dataset.id) this.expandedLayerId = null;
        this.geojsonLoader.removeLayer(deleteGeoJsonBtn.dataset.id);
        this.render();
        return;
      }
    });

    container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const updateLabel = () => {
        const label = target.parentElement?.querySelector('.al-opacity-val') as HTMLElement;
        if (label) label.textContent = `${target.value}%`;
        // also update the compact chip if visible
        const row = target.closest('.al-row') as HTMLElement;
        const chip = row?.querySelector('.al-opacity-chip') as HTMLElement;
        if (chip) chip.textContent = `${target.value}%`;
      };

      if (target.classList.contains('piksel-opacity-slider')) {
        this.pikselLoader.setOpacity(Number(target.value) / 100);
        updateLabel();
      } else if (target.classList.contains('gee-lst-opacity-slider')) {
        this.geeLoader.setLayerOpacity('lst', Number(target.value) / 100);
        updateLabel();
      } else if (target.classList.contains('gee-elv-opacity-slider')) {
        this.geeLoader.setLayerOpacity('elevation', Number(target.value) / 100);
        updateLabel();
      } else if (target.classList.contains('gee-lc-opacity-slider')) {
        this.geeLoader.setLayerOpacity('landcover', Number(target.value) / 100);
        updateLabel();
      } else if (target.classList.contains('geojson-opacity-slider') && target.dataset.id) {
        this.geojsonLoader.setLayerOpacity(target.dataset.id, Number(target.value) / 100);
        updateLabel();
      }
    });
  }
}
