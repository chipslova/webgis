import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { MeasureTool } from '../tools/measure';

export class ActiveLayersUI {
  private mapManager: MapManager;
  private pikselLoader: PikselLoader;
  private geeLoader: GEELoader;
  private geojsonLoader: GeoJsonLoader;
  private measureTool: MeasureTool;
  private containerId: string;

  constructor(
    containerId: string,
    mapManager: MapManager,
    pikselLoader: PikselLoader,
    geeLoader: GEELoader,
    geojsonLoader: GeoJsonLoader,
    measureTool: MeasureTool
  ) {
    this.containerId = containerId;
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.geojsonLoader = geojsonLoader;
    this.measureTool = measureTool;

    this.init();
  }

  public init() {
    this.render();
    this.bindEvents();

    // Listen to changes across all loaders
    this.pikselLoader.onLayersChange(() => this.render());
    this.geeLoader.onLayersChange(() => this.render());
    this.geojsonLoader.onLayersChange(() => this.render());
    this.measureTool.onResult(() => this.render());
  }

  public render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const activePiksel = this.pikselLoader.getActiveProduct();
    const isPikselVisible = this.pikselLoader.isLayerVisible();
    const isPikselGridOn = this.pikselLoader.isGridVisible();
    const customLayers = this.geojsonLoader.getLayers();
    const hasMeasure = this.measureTool.hasActiveMeasurement();

    // GEE Layers
    const isGeePoiActive = this.geeLoader.isLayerActive('poi');
    const isGeePoiVis = this.geeLoader.isLayerVisible('poi');

    const isGeeLstActive = this.geeLoader.isLayerActive('lst');
    const isGeeLstVis = this.geeLoader.isLayerVisible('lst');

    const isGeeElvActive = this.geeLoader.isLayerActive('elevation');
    const isGeeElvVis = this.geeLoader.isLayerVisible('elevation');

    const isGeeLcActive = this.geeLoader.isLayerActive('landcover');
    const isGeeLcVis = this.geeLoader.isLayerVisible('landcover');

    // Count all active configured layers
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
        <div class="active-layers-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <p>No active analytical layers</p>
          <small>Activate layers from <strong>Piksel EO</strong>, <strong>GEE Analysis</strong>, or <strong>Data</strong>.</small>
        </div>
      `;
    } else {
      // 1. Measurement Layer (Topmost)
      if (hasMeasure) {
        itemsHtml += `
          <div class="active-layer-item highlight-measure">
            <div class="active-layer-main">
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2"><path d="M2 12h20"/><path d="M6 12V8"/><path d="M12 12V8"/><path d="M18 12V8"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>Spatial Measurement (Turf.js)</strong>
                  <span class="active-pill-badge" style="background:#00f0ff22; color:#00f0ff; border-color:#00f0ff66;">Topmost</span>
                </div>
                <div class="layer-meta-line">Geodesic distance & polygon area calculations</div>
              </div>
              <button class="icon-btn-sm btn-clear-active-measure" title="Clear measurement">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        `;
      }

      // 2. Custom GeoJSON Layers (Major Cities, uploaded layers)
      customLayers.forEach((layer) => {
        const isVisible = layer.visible !== false;
        const opacityPct = Math.round((layer.opacity ?? 1.0) * 100);
        itemsHtml += `
          <div class="active-layer-item ${!isVisible ? 'is-hidden' : ''}" data-type="geojson" data-id="${layer.id}">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-geojson" data-id="${layer.id}" title="${isVisible ? 'Hide layer' : 'Show layer'}">
                ${isVisible 
                  ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
                }
              </button>
              <div class="layer-color-dot" style="background-color: ${layer.color};"></div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>${layer.name}</strong>
                  <span class="active-pill-badge">${layer.featureCount} Features</span>
                  ${!isVisible ? '<span class="hidden-status-tag">Hidden</span>' : ''}
                </div>
                <div class="layer-meta-line">Vector GeoJSON (${layer.type})</div>
              </div>
              <div class="layer-quick-actions">
                <button class="icon-btn-sm btn-zoom-active-geojson" data-id="${layer.id}" title="Focus to layer extent">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </button>
                <button class="icon-btn-sm btn-delete-active-geojson" data-id="${layer.id}" title="Remove layer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            ${isVisible ? `
              <div class="active-layer-slider-row">
                <span>Opacity:</span>
                <input type="range" class="active-layer-slider geojson-opacity-slider" data-id="${layer.id}" min="0" max="100" value="${opacityPct}" />
                <span class="slider-pct">${opacityPct}%</span>
              </div>
            ` : ''}
          </div>
        `;
      });

      // 3. GEE POI Observation Layer
      if (isGeePoiActive) {
        itemsHtml += `
          <div class="active-layer-item ${!isGeePoiVis ? 'is-hidden' : ''}">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-gee-poi" title="${isGeePoiVis ? 'Hide POI stations' : 'Show POI stations'}">
                ${isGeePoiVis
                  ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
                }
              </button>
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/><path d="m4.93 19.07 14.14-14.14"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>GEE Urban vs Rural POIs</strong>
                  <span class="active-pill-badge" style="background:#ef444422; color:#ef4444; border-color:#ef444455;">Observation</span>
                  ${!isGeePoiVis ? '<span class="hidden-status-tag">Hidden</span>' : ''}
                </div>
                <div class="layer-meta-line">Monas Urban Core & IPB Forest monitoring stations</div>
              </div>
              <button class="icon-btn-sm btn-remove-gee-poi" title="Remove POI layer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        `;
      }

      // 4. Piksel Data Cube Grid Layer
      if (isPikselGridOn) {
        itemsHtml += `
          <div class="active-layer-item">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-piksel-grid" title="Hide Grid">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>Piksel Data Cube Grid</strong>
                  <span class="active-pill-badge" style="background:#10b98122; color:#10b981; border-color:#10b98155;">1,631 Tiles</span>
                </div>
                <div class="layer-meta-line">Open Data Cube 10m spatial indexing boundaries</div>
              </div>
              <button class="icon-btn-sm btn-toggle-piksel-grid" title="Remove Grid">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        `;
      }

      // 5. GEE LST Thermal Grid Layer
      if (isGeeLstActive) {
        const lstOpacityPct = Math.round(this.geeLoader.getLayerOpacity('lst') * 100);
        itemsHtml += `
          <div class="active-layer-item ${!isGeeLstVis ? 'is-hidden' : ''}">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-gee-lst" title="${isGeeLstVis ? 'Hide LST Heatmap' : 'Show LST Heatmap'}">
                ${isGeeLstVis
                  ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
                }
              </button>
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>GEE MODIS LST Heatmap</strong>
                  <span class="active-pill-badge" style="background:#f59e0b22; color:#f59e0b; border-color:#f59e0b55;">Surface Temp</span>
                  ${!isGeeLstVis ? '<span class="hidden-status-tag">Hidden</span>' : ''}
                </div>
                <div class="layer-meta-line">MOD11A2 Land Surface Temperature (Daytime 1km)</div>
              </div>
              <button class="icon-btn-sm btn-remove-gee-lst" title="Remove LST layer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            ${isGeeLstVis ? `
              <div class="active-layer-slider-row">
                <span>Opacity:</span>
                <input type="range" class="active-layer-slider gee-lst-opacity-slider" min="0" max="100" value="${lstOpacityPct}" />
                <span class="slider-pct">${lstOpacityPct}%</span>
              </div>
            ` : ''}
          </div>
        `;
      }

      // 6. GEE SRTM Elevation Layer
      if (isGeeElvActive) {
        const elvOpacityPct = Math.round(this.geeLoader.getLayerOpacity('elevation') * 100);
        itemsHtml += `
          <div class="active-layer-item ${!isGeeElvVis ? 'is-hidden' : ''}">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-gee-elv" title="${isGeeElvVis ? 'Hide Elevation' : 'Show Elevation'}">
                ${isGeeElvVis
                  ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84cc16" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
                }
              </button>
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84cc16" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>GEE SRTM Ground Elevation</strong>
                  <span class="active-pill-badge" style="background:#84cc1622; color:#84cc16; border-color:#84cc1655;">Topography 30m</span>
                  ${!isGeeElvVis ? '<span class="hidden-status-tag">Hidden</span>' : ''}
                </div>
                <div class="layer-meta-line">USGS SRTM Digital Elevation Model</div>
              </div>
              <button class="icon-btn-sm btn-remove-gee-elv" title="Remove Elevation layer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            ${isGeeElvVis ? `
              <div class="active-layer-slider-row">
                <span>Opacity:</span>
                <input type="range" class="active-layer-slider gee-elv-opacity-slider" min="0" max="100" value="${elvOpacityPct}" />
                <span class="slider-pct">${elvOpacityPct}%</span>
              </div>
            ` : ''}
          </div>
        `;
      }

      // 7. GEE Land Cover Classification Layer
      if (isGeeLcActive) {
        const lcOpacityPct = Math.round(this.geeLoader.getLayerOpacity('landcover') * 100);
        itemsHtml += `
          <div class="active-layer-item ${!isGeeLcVis ? 'is-hidden' : ''}">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-gee-lc" title="${isGeeLcVis ? 'Hide Land Cover' : 'Show Land Cover'}">
                ${isGeeLcVis
                  ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
                }
              </button>
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 2v20"/><path d="m17 7-5-5-5 5"/><path d="m19 13-7-6-7 6"/><path d="m21 19-9-8-9 8"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>GEE MODIS Land Cover</strong>
                  <span class="active-pill-badge" style="background:#22c55e22; color:#22c55e; border-color:#22c55e55;">Classification 500m</span>
                  ${!isGeeLcVis ? '<span class="hidden-status-tag">Hidden</span>' : ''}
                </div>
                <div class="layer-meta-line">MCD12Q1 Land Cover & Forest Canopy</div>
              </div>
              <button class="icon-btn-sm btn-remove-gee-lc" title="Remove Land Cover layer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            ${isGeeLcVis ? `
              <div class="active-layer-slider-row">
                <span>Opacity:</span>
                <input type="range" class="active-layer-slider gee-lc-opacity-slider" min="0" max="100" value="${lcOpacityPct}" />
                <span class="slider-pct">${lcOpacityPct}%</span>
              </div>
            ` : ''}
          </div>
        `;
      }

      // 8. Piksel OGC Satellite Raster (GeoMAD, Indices, Hazard, Landsat)
      if (activePiksel) {
        const pikselOpacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
        const yearText = activePiksel.timeEnabled ? ` • Year ${this.pikselLoader.getSelectedYear()}` : '';
        itemsHtml += `
          <div class="active-layer-item highlight-piksel ${!isPikselVisible ? 'is-hidden' : ''}">
            <div class="active-layer-main">
              <button class="layer-eye-btn btn-toggle-piksel-visibility" title="${isPikselVisible ? 'Hide raster imagery' : 'Show raster imagery'}">
                ${isPikselVisible
                  ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
                }
              </button>
              <div class="layer-status-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              </div>
              <div class="layer-info-col">
                <div class="layer-name-row">
                  <strong>${activePiksel.name}</strong>
                  <span class="active-pill-badge" style="background:${activePiksel.color}22; color:${activePiksel.color}; border-color:${activePiksel.color}55;">${activePiksel.badge}</span>
                  ${!isPikselVisible ? '<span class="hidden-status-tag">Hidden</span>' : ''}
                </div>
                <div class="layer-meta-line">OGC WMS 1.3.0 (${activePiksel.resolution}${yearText})</div>
              </div>
              <button class="icon-btn-sm btn-remove-active-piksel" title="Deactivate raster layer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            ${isPikselVisible ? `
              <div class="active-layer-slider-row">
                <span>Opacity:</span>
                <input type="range" class="active-layer-slider piksel-opacity-slider" min="0" max="100" value="${pikselOpacityPct}" />
                <span class="slider-pct">${pikselOpacityPct}%</span>
              </div>
            ` : ''}
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="active-layers-header">
        <div class="active-layers-title-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <h3 style="margin: 0; font-size: 13px;">Active Layer Stack</h3>
          </div>
          <span class="active-count-badge">${layerCount} Active</span>
        </div>
        <p class="active-layers-desc">Analytical layers configured above basemap (stacking order orchestrated deterministically).</p>
      </div>
      <div class="active-layers-list">
        ${itemsHtml}
      </div>
    `;

    // Ensure MapLibre maintains layer ordering whenever Active Layers renders
    this.mapManager.enforceLayerOrder();
  }

  private bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Clear measure
      if (target.closest('.btn-clear-active-measure')) {
        this.measureTool.clear();
        this.render();
        return;
      }

      // Toggle Piksel visibility (Hide != Remove)
      if (target.closest('.btn-toggle-piksel-visibility')) {
        const currentVis = this.pikselLoader.isLayerVisible();
        this.pikselLoader.setLayerVisible(!currentVis);
        this.render();
        return;
      }

      // Remove / Disable Piksel layer
      if (target.closest('.btn-remove-active-piksel')) {
        this.pikselLoader.setActiveProduct(null);
        this.render();
        return;
      }

      // Toggle Piksel grid
      if (target.closest('.btn-toggle-piksel-grid')) {
        this.pikselLoader.setGridVisible(false);
        this.render();
        return;
      }

      // GEE POI Visibility & Remove
      if (target.closest('.btn-toggle-gee-poi')) {
        const currentVis = this.geeLoader.isLayerVisible('poi');
        this.geeLoader.setLayerVisible('poi', !currentVis);
        this.render();
        return;
      }
      if (target.closest('.btn-remove-gee-poi')) {
        this.geeLoader.toggleLayer('poi', false);
        this.render();
        return;
      }

      // GEE LST Visibility & Remove
      if (target.closest('.btn-toggle-gee-lst')) {
        const currentVis = this.geeLoader.isLayerVisible('lst');
        this.geeLoader.setLayerVisible('lst', !currentVis);
        this.render();
        return;
      }
      if (target.closest('.btn-remove-gee-lst')) {
        this.geeLoader.toggleLayer('lst', false);
        this.render();
        return;
      }

      // GEE Elevation Visibility & Remove
      if (target.closest('.btn-toggle-gee-elv')) {
        const currentVis = this.geeLoader.isLayerVisible('elevation');
        this.geeLoader.setLayerVisible('elevation', !currentVis);
        this.render();
        return;
      }
      if (target.closest('.btn-remove-gee-elv')) {
        this.geeLoader.toggleLayer('elevation', false);
        this.render();
        return;
      }

      // GEE Land Cover Visibility & Remove
      if (target.closest('.btn-toggle-gee-lc')) {
        const currentVis = this.geeLoader.isLayerVisible('landcover');
        this.geeLoader.setLayerVisible('landcover', !currentVis);
        this.render();
        return;
      }
      if (target.closest('.btn-remove-gee-lc')) {
        this.geeLoader.toggleLayer('landcover', false);
        this.render();
        return;
      }

      // Toggle GeoJSON layer visibility (Hide != Remove)
      const toggleGeoJsonBtn = target.closest('.btn-toggle-geojson') as HTMLElement;
      if (toggleGeoJsonBtn && toggleGeoJsonBtn.dataset.id) {
        const id = toggleGeoJsonBtn.dataset.id;
        const current = this.geojsonLoader.getLayers().find(l => l.id === id);
        if (current) {
          const nextVis = current.visible === false ? true : false;
          this.geojsonLoader.toggleLayerVisibility(id, nextVis);
          this.render();
        }
        return;
      }

      // Zoom GeoJSON layer
      const zoomGeoJsonBtn = target.closest('.btn-zoom-active-geojson') as HTMLElement;
      if (zoomGeoJsonBtn && zoomGeoJsonBtn.dataset.id) {
        this.geojsonLoader.zoomToLayer(zoomGeoJsonBtn.dataset.id);
        return;
      }

      // Delete GeoJSON layer (Permanent remove)
      const deleteGeoJsonBtn = target.closest('.btn-delete-active-geojson') as HTMLElement;
      if (deleteGeoJsonBtn && deleteGeoJsonBtn.dataset.id) {
        this.geojsonLoader.removeLayer(deleteGeoJsonBtn.dataset.id);
        this.render();
        return;
      }
    });

    container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;

      if (target.classList.contains('piksel-opacity-slider')) {
        const val = Number(target.value);
        this.pikselLoader.setOpacity(val / 100);
        const label = target.parentElement?.querySelector('.slider-pct');
        if (label) label.textContent = `${val}%`;
      } else if (target.classList.contains('gee-lst-opacity-slider')) {
        const val = Number(target.value);
        this.geeLoader.setLayerOpacity('lst', val / 100);
        const label = target.parentElement?.querySelector('.slider-pct');
        if (label) label.textContent = `${val}%`;
      } else if (target.classList.contains('gee-elv-opacity-slider')) {
        const val = Number(target.value);
        this.geeLoader.setLayerOpacity('elevation', val / 100);
        const label = target.parentElement?.querySelector('.slider-pct');
        if (label) label.textContent = `${val}%`;
      } else if (target.classList.contains('gee-lc-opacity-slider')) {
        const val = Number(target.value);
        this.geeLoader.setLayerOpacity('landcover', val / 100);
        const label = target.parentElement?.querySelector('.slider-pct');
        if (label) label.textContent = `${val}%`;
      } else if (target.classList.contains('geojson-opacity-slider') && target.dataset.id) {
        const val = Number(target.value);
        this.geojsonLoader.setLayerOpacity(target.dataset.id, val / 100);
        const label = target.parentElement?.querySelector('.slider-pct');
        if (label) label.textContent = `${val}%`;
      }
    });
  }
}
