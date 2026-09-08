import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { GeoJsonLoader } from '../tools/geojson-loader';

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
              <div class="dynamic-legend-sub">${activeProduct.category} • Resolusi ${activeProduct.resolution} • OGC WMS (BIG)</div>
            </div>
          </div>
          ${swatchesHtml}
        </div>
      `;
    }

    // 2. Active GEE Layers (LST, Elevation, POIs, Land Cover)
    if (this.geeLoader) {
      if (this.geeLoader.isLayerVisible('lst')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🌡️</span>
              <div>
                <div class="dynamic-legend-title">MODIS Daytime Land Surface Temperature</div>
                <div class="dynamic-legend-sub">Wilayah Kajian Jabodetabek - Jawa Barat (2020–2026)</div>
              </div>
            </div>
            <div class="gee-legend-bar lst-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>22°C (Sejuk)</span>
              <span>25°C</span>
              <span>28°C</span>
              <span>31°C</span>
              <span>34°C+ (Ekstrem Panas)</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('elevation')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">⛰️</span>
              <div>
                <div class="dynamic-legend-title">USGS SRTM Ground Elevation Grid</div>
                <div class="dynamic-legend-sub">Elevasi Permukaan Tanah (mdpl)</div>
              </div>
            </div>
            <div class="gee-legend-bar elv-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>0m (Pesisir)</span>
              <span>50m</span>
              <span>200m</span>
              <span>600m</span>
              <span>1200m+ (Puncak)</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('poi')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">📍</span>
              <div>
                <div class="dynamic-legend-title">Stasiun Observasi Suhu Urban vs Rural</div>
                <div class="dynamic-legend-sub">Titik Referensi MODIS LST</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px;">
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #ef4444; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Urban Core (Jakarta Monas - 33.85°C)</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #22c55e; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Rural / Forest (Bogor IPB - 24.60°C)</span>
              </div>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('landcover')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🌳</span>
              <div>
                <div class="dynamic-legend-title">MODIS Land Cover Classification</div>
                <div class="dynamic-legend-sub">Klasifikasi Tutupan Lahan</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px;">
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #0284c7;"></span><span class="dynamic-legend-label">Laut / Air</span></div>
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #e11d48;"></span><span class="dynamic-legend-label">Perkotaan</span></div>
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #eab308;"></span><span class="dynamic-legend-label">Pertanian</span></div>
              <div class="dynamic-legend-item"><span class="dynamic-color-box" style="background-color: #15803d;"></span><span class="dynamic-legend-label">Hutan Lebat</span></div>
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
              <div class="dynamic-legend-title">Layer Vektor Kustom (GeoJSON)</div>
              <div class="dynamic-legend-sub">${visibleCustomLayers.length} layer vektor aktif</div>
            </div>
          </div>
          <div class="dynamic-legend-swatches" style="margin-top: 8px;">
            ${visibleCustomLayers.map((l: any) => `
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: ${l.color};"></span>
                <span class="dynamic-legend-label">${l.name} (${l.featureCount} fitur)</span>
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
          <span class="section-title">🛰️ Layer Tematik & Citra Aktif (${activeLayersCount})</span>
        </div>
        ${thematicHtml}
      `;
    } else {
      html += `
        <div class="dynamic-legend-empty">
          <div class="empty-icon">🛰️</div>
          <div class="empty-title">Belum Ada Layer Citra / Analisis Aktif</div>
          <p class="empty-desc">Aktifkan citra di tab <strong>Citra Satelit</strong> atau analisis spasial di tab <strong>Analisis Spasial</strong> untuk memuat legenda spektral otomatis di sini.</p>
        </div>
      `;
    }

    // --- SECTION 2: PERMANENT GENERAL MAP & TOOL SYMBOLS ---
    html += `
      <div class="legend-section-header" style="margin-top: 14px;">
        <span class="section-title">🗺️ Simbol Peta & Fitur Standar</span>
      </div>
      <div class="dynamic-legend-card">
        <div class="dynamic-legend-swatches">
          <div class="dynamic-legend-item">
            <span class="legend-symbol point" style="background-color: #f59e0b; width: 12px; height: 12px; border-radius: 50%; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Kota Utama</strong> (Sampel Titik Vektor Ibukota & Kota Besar)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2px dashed #10b981; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Grid Data Cube Nasional</strong> (Indeks Petak Scene 10m BIG)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2.5px solid #00f0ff; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Jalur Pengukuran Jarak</strong> (Turf.js Geodesik)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol polygon" style="background-color: rgba(0,240,255,0.3); border: 1.5px solid #00f0ff; width: 14px; height: 14px; border-radius: 3px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Area Pengukuran Luas</strong> (Poligon Geodesik)</span>
          </div>
          <div class="dynamic-legend-item">
            <span style="display: flex; align-items: center; justify-content: center; width: 16px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <span class="dynamic-legend-label"><strong>Penanda Lokasi</strong> (Hasil Pencarian Geocoder)</span>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }
}
