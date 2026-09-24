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
              <div class="dynamic-legend-sub">${activeProduct.category} • Resolusi ${activeProduct.resolution} • OGC WMS (BIG)</div>
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
                <div class="dynamic-legend-title">Suhu Permukaan Daratan Siang Hari (MODIS 1 km)</div>
                <div class="dynamic-legend-sub">Komposit NASA Terra MOD11A1 & Aqua MYD11A1 (GEE)</div>
              </div>
            </div>
            <div class="gee-legend-bar lst-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>10°C (Dataran Tinggi)</span>
              <span>20°C</span>
              <span>26°C</span>
              <span>32°C (Perkotaan)</span>
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
                <div class="dynamic-legend-title">Suhu Permukaan Daratan Malam Hari (MODIS 1 km)</div>
                <div class="dynamic-legend-sub">Pendinginan Permukaan Radiatif (LST Malam Terra + Aqua)</div>
              </div>
            </div>
            <div class="gee-legend-bar lst-gradient" style="margin-top: 8px;"></div>
            <div class="gee-legend-labels">
              <span>10°C (Dataran Tinggi)</span>
              <span>20°C</span>
              <span>26°C</span>
              <span>32°C (Perkotaan)</span>
              <span>38°C</span>
              <span>42°C+</span>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('landcover') || this.geeLoader.isLayerVisible('lc')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🗺️</span>
              <div>
                <div class="dynamic-legend-title">Tutupan Lahan Sentinel-2 10m (LULC)</div>
                <div class="dynamic-legend-sub">Komposit Sentinel-2 10m Global · Impact Observatory / Esri</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #1A5BAB;"></span>
                <span class="dynamic-legend-label">Air</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #358221;"></span>
                <span class="dynamic-legend-label">Pohon (Hutan)</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #87D19E;"></span>
                <span class="dynamic-legend-label">Vegetasi Tergenang / Mangrove</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #FFDB5C;"></span>
                <span class="dynamic-legend-label">Pertanian / Tanaman Pangan</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #ED022A;"></span>
                <span class="dynamic-legend-label">Area Terbangun / Permukiman</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #EDE9E4;"></span>
                <span class="dynamic-legend-label">Lahan Terbuka / Tanah Terbuka</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #C6D799;"></span>
                <span class="dynamic-legend-label">Padang Rumput / Semak Belukar</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #F2FAFF; border: 1px solid rgba(255,255,255,0.3);"></span>
                <span class="dynamic-legend-label">Salju / Es</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #C8C8C8;"></span>
                <span class="dynamic-legend-label">Awan</span>
              </div>
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
                <div class="dynamic-legend-title">Jaringan Stasiun Pemantauan MODIS 1km Indonesia</div>
                <div class="dynamic-legend-sub">18 Stasiun Pemantau · NASA LP DAAC & GEE</div>
              </div>
            </div>
            <div class="dynamic-legend-swatches" style="margin-top: 8px;">
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #ef4444; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Titik Pemantauan Pulau Bahang (SUHI - Jakarta, Surabaya, Medan)</span>
              </div>
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: #10b981; border-radius: 50%;"></span>
                <span class="dynamic-legend-label">Baseline Hutan & Dataran Tinggi (Papua, IKN, Gunung Gede)</span>
              </div>
            </div>
          </div>
        `;
      }

      if (this.geeLoader.isLayerVisible('precipitation') || this.geeLoader.isLayerVisible('curah-hujan') || this.geeLoader.isLayerVisible('rainfall')) {
        activeLayersCount++;
        thematicHtml += `
          <div class="dynamic-legend-card">
            <div class="dynamic-legend-card-header">
              <span class="legend-card-icon">🌧️</span>
              <div>
                <div class="dynamic-legend-title">Curah Hujan Harian (CHIRPS &amp; NASA GPM)</div>
                <div class="dynamic-legend-sub">NASA IMERG Precipitation Rate · Resolusi Harian Bebas Awan</div>
              </div>
            </div>
            <div class="gee-legend-bar" style="height: 8px; border-radius: 4px; margin-top: 8px; background: linear-gradient(90deg, #f8fafc 0%, #7dd3fc 15%, #0284c7 35%, #16a34a 55%, #eab308 75%, #ef4444 90%, #7e22ce 100%);" aria-hidden="true"></div>
            <div class="gee-legend-labels" style="font-size: 10px; display: flex; justify-content: space-between; color: var(--text-muted); margin-top: 4px;">
              <span>0 mm (Nihil)</span>
              <span>5 mm</span>
              <span>15 mm (Sedang)</span>
              <span>30 mm (Lebat)</span>
              <span>50 mm+ (Ekstrem)</span>
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
              <div class="dynamic-legend-title">Lapisan Vektor Kustom (GeoJSON)</div>
              <div class="dynamic-legend-sub">${visibleCustomLayers.length} lapisan vektor aktif</div>
            </div>
          </div>
          <div class="dynamic-legend-swatches" style="margin-top: 8px;">
            ${visibleCustomLayers.map((l: any) => `
              <div class="dynamic-legend-item">
                <span class="dynamic-color-box" style="background-color: ${l.color};"></span>
                <span class="dynamic-legend-label">${escapeHtml(l.name)} (${l.featureCount} fitur)</span>
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
          <span class="section-title">🛰️ Lapisan Tematik & Citra Aktif (${activeLayersCount})</span>
        </div>
        ${thematicHtml}
      `;
    } else {
      html += `
        <div class="dynamic-legend-empty">
          <div class="empty-icon">🛰️</div>
          <div class="empty-title">Belum Ada Lapisan Citra atau Analisis Aktif</div>
          <p class="empty-desc">Aktifkan citra di tab <strong>Satelit</strong> atau analisis spasial di tab <strong>Analisis</strong> untuk menampilkan legenda secara otomatis di sini.</p>
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
            <span class="legend-symbol point" style="background-color: #f59e0b; width: 12px; height: 12px; min-width: 12px; min-height: 12px; aspect-ratio: 1 / 1; border-radius: 50%; display: inline-block; flex-shrink: 0;"></span>
            <span class="dynamic-legend-label"><strong>Kota-Kota Utama</strong> (Sampel Ibukota & Kota Provinsi)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2px dashed #10b981; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Grid Data Cube Nasional</strong> (Indeks Tile Scene BIG 10m)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol line" style="border-top: 2.5px solid #00f0ff; width: 18px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Lintasan Pengukuran Jarak</strong> (Geodesik Turf.js)</span>
          </div>
          <div class="dynamic-legend-item">
            <span class="legend-symbol polygon" style="background-color: rgba(0,240,255,0.3); border: 1.5px solid #00f0ff; width: 14px; height: 14px; border-radius: 3px; display: inline-block;"></span>
            <span class="dynamic-legend-label"><strong>Poligon Pengukuran Luas</strong> (Geodesik Turf.js)</span>
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
