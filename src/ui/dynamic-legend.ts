import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { escapeHtml } from '../utils/sanitize';

export class DynamicLegendUI {
  private container: HTMLElement | null = null;
  private pikselLoader: PikselLoader | null = null;
  private geeLoader: GEELoader | null = null;
  private geojsonLoader: GeoJsonLoader | null = null;

  constructor(
    containerId: string,
    pikselLoader: PikselLoader | null,
    geeLoader: GEELoader | null,
    geojsonLoader: GeoJsonLoader | null
  ) {
    this.container = document.getElementById(containerId);
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.geojsonLoader = geojsonLoader;
  }

  public setPikselLoader(loader: PikselLoader | null) {
    this.pikselLoader = loader;
  }

  public setGEELoader(loader: GEELoader | null) {
    this.geeLoader = loader;
  }

  public setGeoJSONLoader(loader: GeoJsonLoader | null) {
    this.geojsonLoader = loader;
  }

  public render() {
    if (!this.container) {
      this.container = document.getElementById('dynamic-legend-container');
      if (!this.container) return;
    }

    let html = '';
    let activeLayersCount = 0;

    // --- SECTION 1: ACTIVE THEMATIC LAYERS & SATELLITE IMAGERY ---
    let thematicHtml = '';

    // 1. Active Piksel EO Product Legend
    const activeProduct = this.pikselLoader?.getActiveProduct();
    if (activeProduct) {
      activeLayersCount++;
      let swatchesHtml = '';
      if (activeProduct.legend && activeProduct.legend.swatches) {
        swatchesHtml = `
          <div class="dynamic-legend-swatches">
            ${activeProduct.legend.swatches.map(sw => `
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: ${sw.color}; box-shadow: 0 0 6px ${sw.color}66;"></span>
                <span class="dynamic-legend-label"><strong>${sw.icon ? sw.icon + ' ' : ''}</strong>${sw.label}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      thematicHtml += `
        <div class="dynamic-legend-card highlight-card">
          <div class="dynamic-legend-card-header">
            <span class="legend-card-icon">🛰️</span>
            <div>
              <div class="dynamic-legend-title">${activeProduct.name}</div>
              <div class="dynamic-legend-sub">${activeProduct.category} • Resolution ${activeProduct.resolution} • OGC WMS (BIG)</div>
            </div>
          </div>
          ${swatchesHtml}
        </div>
      `;
    }

    // 2. Active GEE Layers (MODIS Terra + Aqua 1km LST Day/Night, Stations)
    if (this.geeLoader) {
      if (this.geeLoader.isLayerVisible('lst-day') || this.geeLoader.isLayerVisible('lst') || this.geeLoader.isLayerVisible('air-temp')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">☀️</span>
              <div>
                <div class="dynamic-legend-title">MODIS Daytime Land Surface Temp (1 km)</div>
                <div class="dynamic-legend-sub">NASA Terra MOD11A1 & Aqua MYD11A1 Composite (GEE)</div>
              </div>
            </div>
            <div class="gee-legend-bar lst-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>10°C (Highland)</span>
              <span>20°C</span>
              <span>26°C</span>
              <span>32°C (Urban)</span>
              <span>38°C</span>
              <span>42°C+</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('lst-night') || this.geeLoader.isLayerVisible('surface-temp') || this.geeLoader.isLayerVisible('elevation')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🌙</span>
              <div>
                <div class="dynamic-legend-title">MODIS Nighttime Land Surface Temp (1 km)</div>
                <div class="dynamic-legend-sub">Radiative Surface Cooling (Terra + Aqua LST Night)</div>
              </div>
            </div>
            <div class="gee-legend-bar lst-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>-5°C (Summit)</span>
              <span>10°C</span>
              <span>16°C</span>
              <span>22°C (Coast)</span>
              <span>26°C (UHI)</span>
              <span>28°C+</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('stations') || this.geeLoader.isLayerVisible('poi')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">📍</span>
              <div>
                <div class="dynamic-legend-title">Indonesia 1km MODIS Station Network</div>
                <div class="dynamic-legend-sub">18 Monitoring Stations · NASA LP DAAC & GEE</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px;">
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #ef4444; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Urban Heat Island Node (Jakarta · Surabaya · Medan)</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #10b981; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Forest Baseline & Highland (Papua · IKN · Gunung Gede)</span>
              </div>
            </div>
          </div>
        `;
      }
    }

    // 3. Custom GeoJSON Layers
    const customLayers = this.geojsonLoader?.getLayers() || [];
    const visibleCustomLayers = customLayers.filter((l: any) => l.visible);
    if (visibleCustomLayers.length > 0) {
      activeLayersCount++;
      thematicHtml += `
        <div class="dynamic-legend-card">
          <div class="dynamic-legend-card-header">
            <span class="legend-card-icon">📂</span>
            <div>
              <div class="dynamic-legend-title">Custom Vector Layers (GeoJSON)</div>
              <div class="dynamic-legend-sub">${visibleCustomLayers.length} active vector layers</div>
            </div>
          </div>
          <div class="dynamic-legend-swatches" style="margin-top: 8px;">
            ${visibleCustomLayers.map((l: any) => `
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: ${l.color};"></span>
                <span class="dynamic-legend-label">${escapeHtml(l.name)} (${l.featureCount} features)</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Wrap Thematic Section
    if (activeLayersCount > 0) {
      html += `
        <div class="legend-section-header">
          <span class="section-title">🛰️ Active Thematic & Imagery Layers (${activeLayersCount})</span>
        </div>
        ${thematicHtml}
      `;
    } else {
      html += `
        <div class="dynamic-legend-empty">
          <div class="empty-icon">🛰️</div>
          <div class="empty-title">No Active Imagery or Analysis Layers</div>
          <p class="empty-desc">Activate imagery in the <strong>Satellite</strong> tab or spatial analysis in the <strong>Analysis</strong> tab to display dynamic legends automatically here.</p>
        </div>
      `;
    }

    // --- SECTION 2: PERMANENT GENERAL MAP & TOOL SYMBOLS ---
    html += `
      <div class="legend-section-header" style="margin-top: 14px;">
        <span class="section-title">🗺️ Map Symbols & Standard Features</span>
      </div>
      <div class="dynamic-legend-card">
        <div class="dynamic-legend-swatches">
          <div class="dynamic-legend-item">
            <span class="legend-symbol point" style="background-color: #f59e0b; width: 12px; height: 12px; min-width: 12px; min-height: 12px; aspect-ratio: 1 / 1; border-radius: 50%; display: inline-block; flex-shrink: 0;"></span>
            <span class="dynamic-legend-label"><strong>Major Cities</strong> (Sample Capital & Provincial Cities)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2px dashed #10b981; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>National Data Cube Grid</strong> (BIG 10m Scene Tile Index)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2.5px solid #00f0ff; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Distance Measurement Route</strong> (Turf.js Geodesic)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol polygon" style="background-color: rgba(0,240,255,0.3); border: 1.5px solid #00f0ff; width: 14px; height: 14px; border-radius: 3px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Area Measurement Polygon</strong> (Turf.js Geodesic)</span>
          </div>
          <div class="dynamic-legend-item">
            <span style="display: flex; align-items: center; justify-content: center; width: 16px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <span class="dynamic-legend-label"><strong>Location Marker</strong> (Geocoder Search Result)</span>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }
}
