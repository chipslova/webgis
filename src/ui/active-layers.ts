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
    noEye?: boolean;
    noOpacity?: boolean;
  }): string {
    const isExpanded = this.expandedLayerId === params.id;
    const showOpacity = !params.noOpacity && params.isVisible;

    const eyeBtn = params.noEye ? '' : `
      <button class="al-eye-btn ${params.eyeBtnClass}" data-id="${params.id}" title="${params.isVisible ? 'Hide layer' : 'Show layer'}">
        ${params.isVisible ? this.eyeOnSvg() : this.eyeOffSvg()}
      </button>
    `;

    const detailGrid = (params.details || []).map(d => `
      <span class="al-detail-label">${d.label}</span>
      <span class="al-detail-val">${d.value}</span>
    `).join('');

    const opacitySlider = (params.opacitySliderClass && showOpacity) ? `
      <div class="al-detail-opacity">
        <span class="al-detail-label">Opacity</span>
        <div class="al-detail-opacity-ctrl">
          <input type="range" class="active-layer-slider ${params.opacitySliderClass}" data-id="${params.id}" min="0" max="100" value="${params.opacityPct}" />
          <span class="al-opacity-val slider-pct">${params.opacityPct}%</span>
        </div>
      </div>
    ` : '';

    return `
      <div class="al-row ${!params.isVisible ? 'al-row-hidden' : ''} ${isExpanded ? 'al-row-expanded' : ''}" data-layer-id="${params.id}">
        <div class="al-row-compact">
          ${eyeBtn}
          <span class="al-color-dot" style="background:${params.color};"></span>
          <div class="al-row-body" data-expand-id="${params.id}">
            <span class="al-name">${params.name}</span>
            <span class="al-meta">${params.meta}</span>
          </div>
          ${showOpacity ? `<span class="al-opacity-chip">${params.opacityPct}%</span>` : ''}
          <button class="al-remove-btn ${params.removeBtnClass}" data-id="${params.id}" title="Remove layer">
            ${this.removeSvg()}
          </button>
        </div>
        ${isExpanded ? `
          <div class="al-row-detail">
            ${detailGrid ? `<div class="al-detail-grid">${detailGrid}</div>` : ''}
            ${opacitySlider}
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
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1.5">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <p class="al-empty-title">No active layers</p>
          <p class="al-empty-sub">Choose a data source to begin</p>
        </div>
        <div class="al-onboard-grid">
          <button class="al-onboard-btn" data-go-tab="piksel">
            <span class="al-onboard-icon">01</span>
            <div>
              <strong>Explore</strong>
              <span>Piksel EO — Sentinel-2, Landsat, NDVI</span>
            </div>
          </button>
          <button class="al-onboard-btn" data-go-tab="gee">
            <span class="al-onboard-icon">02</span>
            <div>
              <strong>Analyze</strong>
              <span>GEE — LST, SRTM, Land Cover</span>
            </div>
          </button>
          <button class="al-onboard-btn" data-go-tab="data">
            <span class="al-onboard-icon">03</span>
            <div>
              <strong>Interact</strong>
              <span>Upload GeoJSON, measure, export</span>
            </div>
          </button>
        </div>
      `;
    } else {
      // 1. Measurement (no eye toggle, no opacity)
      if (hasMeasure) {
        itemsHtml += this.buildRow({
          id: 'measure',
          name: 'Measurement',
          meta: 'Turf.js · Geodesic',
          color: '#00f0ff',
          isVisible: true,
          opacityPct: 100,
          eyeBtnClass: '',
          removeBtnClass: 'btn-clear-active-measure',
          noEye: true,
          noOpacity: true,
          details: [
            { label: 'Engine', value: 'Turf.js' },
            { label: 'Type', value: 'Geodesic (WGS84)' },
          ]
        });
      }

      // 2. Custom GeoJSON layers
      customLayers.forEach((layer) => {
        const opacityPct = Math.round((layer.opacity ?? 1.0) * 100);
        itemsHtml += this.buildRow({
          id: layer.id,
          name: layer.name,
          meta: `GeoJSON · ${layer.featureCount} features`,
          color: layer.color,
          isVisible: layer.visible !== false,
          opacityPct,
          eyeBtnClass: 'btn-toggle-geojson',
          removeBtnClass: 'btn-delete-active-geojson',
          opacitySliderClass: 'geojson-opacity-slider',
          details: [
            { label: 'Source', value: 'GeoJSON' },
            { label: 'Type', value: layer.type },
            { label: 'Features', value: String(layer.featureCount) },
          ]
        });
      });

      // 3. GEE POI Observation
      if (isGeePoiActive) {
        itemsHtml += this.buildRow({
          id: 'gee-poi',
          name: 'Urban / Rural POI',
          meta: 'GEE · Observation sites',
          color: '#ef4444',
          isVisible: isGeePoiVis,
          opacityPct: 100,
          eyeBtnClass: 'btn-toggle-gee-poi',
          removeBtnClass: 'btn-remove-gee-poi',
          noOpacity: true,
          details: [
            { label: 'Source', value: 'Google Earth Engine' },
            { label: 'Sites', value: 'Monas (Jakarta) · IPB Forest (Bogor)' },
          ]
        });
      }

      // 4. Piksel Data Cube Grid
      if (isPikselGridOn) {
        itemsHtml += this.buildRow({
          id: 'piksel-grid',
          name: 'Data Cube Grid',
          meta: 'BIG Piksel · 1,631 tiles',
          color: '#10b981',
          isVisible: true,
          opacityPct: 100,
          eyeBtnClass: '',
          removeBtnClass: 'btn-toggle-piksel-grid',
          noEye: true,
          noOpacity: true,
          details: [
            { label: 'Source', value: 'BIG Piksel / Open Data Cube' },
            { label: 'Coverage', value: '1,631 tile boundaries · 10m' },
          ]
        });
      }

      // 5. GEE LST
      if (isGeeLstActive) {
        const lstOpacityPct = Math.round(this.geeLoader.getLayerOpacity('lst') * 100);
        itemsHtml += this.buildRow({
          id: 'gee-lst',
          name: 'MODIS LST Heatmap',
          meta: 'GEE · 1 km · Daytime',
          color: '#f59e0b',
          isVisible: isGeeLstVis,
          opacityPct: lstOpacityPct,
          eyeBtnClass: 'btn-toggle-gee-lst',
          removeBtnClass: 'btn-remove-gee-lst',
          opacitySliderClass: 'gee-lst-opacity-slider',
          details: [
            { label: 'Source', value: 'NASA LP DAAC / GEE' },
            { label: 'Product', value: 'MOD11A2 (MODIS Terra)' },
            { label: 'Resolution', value: '1,000 m' },
            { label: 'Coverage', value: 'Jakarta – West Java' },
          ]
        });
      }

      // 6. GEE SRTM Elevation
      if (isGeeElvActive) {
        const elvOpacityPct = Math.round(this.geeLoader.getLayerOpacity('elevation') * 100);
        itemsHtml += this.buildRow({
          id: 'gee-elevation',
          name: 'SRTM Elevation',
          meta: 'GEE · 30 m · DEM',
          color: '#84cc16',
          isVisible: isGeeElvVis,
          opacityPct: elvOpacityPct,
          eyeBtnClass: 'btn-toggle-gee-elv',
          removeBtnClass: 'btn-remove-gee-elv',
          opacitySliderClass: 'gee-elv-opacity-slider',
          details: [
            { label: 'Source', value: 'USGS / NASA / GEE' },
            { label: 'Product', value: 'SRTM Digital Elevation Model' },
            { label: 'Resolution', value: '30 m' },
          ]
        });
      }

      // 7. GEE Land Cover
      if (isGeeLcActive) {
        const lcOpacityPct = Math.round(this.geeLoader.getLayerOpacity('landcover') * 100);
        itemsHtml += this.buildRow({
          id: 'gee-landcover',
          name: 'MODIS Land Cover',
          meta: 'GEE · 500 m · MCD12Q1',
          color: '#22c55e',
          isVisible: isGeeLcVis,
          opacityPct: lcOpacityPct,
          eyeBtnClass: 'btn-toggle-gee-lc',
          removeBtnClass: 'btn-remove-gee-lc',
          opacitySliderClass: 'gee-lc-opacity-slider',
          details: [
            { label: 'Source', value: 'NASA LP DAAC / GEE' },
            { label: 'Product', value: 'MCD12Q1 Annual Land Cover' },
            { label: 'Resolution', value: '500 m' },
          ]
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
            { label: 'Source', value: 'BIG Piksel / Open Data Cube' },
            { label: 'Protocol', value: 'OGC WMS 1.3.0' },
            { label: 'Resolution', value: activePiksel.resolution },
            ...(yearText ? [{ label: 'Year', value: yearText }] : []),
          ]
        });
      }
    }

    container.innerHTML = `
      <div class="al-header">
        <span class="al-header-label">ACTIVE LAYERS</span>
        ${layerCount > 0 ? `<span class="al-count">${layerCount}</span>` : ''}
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
