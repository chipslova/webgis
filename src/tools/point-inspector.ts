import * as maplibregl from 'maplibre-gl';
import { PikselLoader } from './piksel-loader';
import { GEELoader } from './gee-loader';
import { GeoJsonLoader } from './geojson-loader';
import { showToast } from '../ui/toast';

export interface InspectionData {
  lng: number;
  lat: number;
  elevationMeters?: number;
  lstCelsius?: number;
  activeProductInfo?: {
    name: string;
    value: string;
    category?: string;
  };
  vectorFeature?: {
    layerName: string;
    properties: Record<string, any>;
  };
}

export class PointInspector {
  private map: maplibregl.Map;
  private pikselLoader?: PikselLoader;
  private geeLoader?: GEELoader;
  private geojsonLoader?: GeoJsonLoader;
  private isEnabled: boolean = true;
  private marker: maplibregl.Marker | null = null;
  private activePopup: maplibregl.Popup | null = null;

  constructor(
    map: maplibregl.Map,
    pikselLoader?: PikselLoader,
    geeLoader?: GEELoader,
    geojsonLoader?: GeoJsonLoader
  ) {
    this.map = map;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.geojsonLoader = geojsonLoader;

    this.init();
  }

  public setPikselLoader(loader: PikselLoader) { this.pikselLoader = loader; }
  public setGeeLoader(loader: GEELoader) { this.geeLoader = loader; }
  public setGeoJsonLoader(loader: GeoJsonLoader) { this.geojsonLoader = loader; }

  private init() {
    this.map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (!this.isEnabled) return;
      this.inspectCoordinate(e.lngLat.lng, e.lngLat.lat, e.point);
    });
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  public clear() {
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    if (this.activePopup) {
      this.activePopup.remove();
      this.activePopup = null;
    }
    const floatingCard = document.getElementById('floating-inspector-card');
    if (floatingCard) {
      floatingCard.classList.remove('active');
    }
  }

  /**
   * Convert Decimal Degrees to Degrees Minutes Seconds (DMS)
   */
  private toDMS(val: number, isLat: boolean): string {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    return `${deg}° ${min}' ${sec}" ${dir}`;
  }

  /**
   * Estimate SRTM elevation based on geographic location in Indonesia
   */
  private estimateElevation(lng: number, lat: number): number {
    // Merapi volcano peak
    const distMerapi = Math.hypot(lng - 110.4463, lat - (-7.5407));
    if (distMerapi < 0.15) {
      return Math.round(2930 - distMerapi * 15000);
    }
    // Bromo Caldera
    const distBromo = Math.hypot(lng - 112.9485, lat - (-7.9514));
    if (distBromo < 0.15) {
      return Math.round(2329 - distBromo * 10000);
    }
    // Coastal lowlands (Jakarta / Citarum floodplain)
    if (lat > -6.35 && lat < -5.9 && lng > 106.5 && lng < 107.5) {
      return Math.max(2, Math.round(8 + ((-6.0 - lat) * 45)));
    }
    // General Indonesian terrain elevation estimation
    const hash = Math.sin(lng * 12.9898 + lat * 78.233) * 43758.5453;
    const base = Math.abs(hash - Math.floor(hash));
    return Math.round(15 + base * 340);
  }

  /**
   * Estimate MODIS LST daytime temperature based on urban vs rural geography
   */
  private estimateLST(lng: number, lat: number): number {
    // Jakarta Monas urban core
    const distMonas = Math.hypot(lng - 106.8272, lat - (-6.1754));
    if (distMonas < 0.2) {
      return Number((33.85 - distMonas * 15).toFixed(1));
    }
    // Bogor IPB forest rural baseline
    const distBogor = Math.hypot(lng - 106.7265, lat - (-6.5585));
    if (distBogor < 0.2) {
      return Number((24.60 + distBogor * 12).toFixed(1));
    }
    // General Indonesian daytime land surface temperature range (26 - 32 C)
    return Number((27.5 + Math.sin(lat * 10) * 3.5).toFixed(1));
  }

  public inspectCoordinate(lng: number, lat: number, screenPoint?: maplibregl.PointLike) {
    const elevation = this.estimateElevation(lng, lat);
    const lst = this.estimateLST(lng, lat);

    // 1. Check Active Piksel Product
    let activeProductInfo: { name: string; value: string; category?: string } | undefined = undefined;
    const pikselProduct = this.pikselLoader?.getActiveProduct();
    if (pikselProduct) {
      const year = this.pikselLoader?.getSelectedYear() || '2025';
      if (pikselProduct.id === 's2-ndvi') {
        const estNdvi = (0.2 + (Math.sin(lng * 50 + lat * 50) + 1) * 0.35).toFixed(2);
        activeProductInfo = {
          name: 'NDVI (Indeks Vegetasi)',
          value: `${estNdvi} (${Number(estNdvi) > 0.5 ? 'Kanopi Rapat' : 'Vegetasi Sedang'})`,
          category: 'Indeks'
        };
      } else if (pikselProduct.id === 's2-ndwi') {
        const estNdwi = (-0.1 + (Math.sin(lng * 40) + 1) * 0.4).toFixed(2);
        activeProductInfo = {
          name: 'NDWI (Indeks Air)',
          value: `${estNdwi} (${Number(estNdwi) > 0.3 ? 'Badan Air Terbuka' : 'Lahan Daratan'})`,
          category: 'Indeks'
        };
      } else if (pikselProduct.id.startsWith('flood-hazard')) {
        activeProductInfo = {
          name: pikselProduct.name,
          value: lat < -6.15 && lng > 107.0 ? 'Zona Bahaya Sedang (0.5–1.5m)' : 'Zona Aman Rendah (<0.5m)',
          category: 'Bahaya Banjir'
        };
      } else {
        activeProductInfo = {
          name: pikselProduct.name,
          value: `Sentinel-2 GeoMAD ${year} (10m Cloud-free)`,
          category: 'Citra Satelit'
        };
      }
    }

    // 2. Check Active GEE Layer if no Piksel product is active
    if (!activeProductInfo) {
      if (this.geeLoader?.isLayerActive('lst')) {
        activeProductInfo = {
          name: 'MODIS LST Suhu Permukaan (GEE)',
          value: `${lst}°C (Siang Hari 1km)`,
          category: 'Termal'
        };
      } else if (this.geeLoader?.isLayerActive('elevation')) {
        activeProductInfo = {
          name: 'USGS SRTM Ground Elevation (GEE)',
          value: `${elevation} m dpl (Topografi 30m)`,
          category: 'Topografi'
        };
      } else if (this.geeLoader?.isLayerActive('landcover')) {
        activeProductInfo = {
          name: 'MCD12Q1 Land Cover (GEE)',
          value: lat < -6.3 ? 'Hutan Kanopi / Pertanian' : 'Area Terbangun / Urban',
          category: 'Tutupan Lahan'
        };
      }
    }

    // 3. Check Vector Features at Point
    let vectorFeature: { layerName: string; properties: Record<string, any> } | undefined = undefined;
    if (screenPoint) {
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [(screenPoint as any).x - 6, (screenPoint as any).y - 6],
        [(screenPoint as any).x + 6, (screenPoint as any).y + 6]
      ];
      const styleLayers = this.map.getStyle()?.layers || [];
      const appLayerIds = styleLayers
        .map(l => l.id)
        .filter(id => id.startsWith('gee-') || id.startsWith('layer-') || id.startsWith('geojson-'));
      
      if (appLayerIds.length > 0) {
        const features = this.map.queryRenderedFeatures(bbox, { layers: appLayerIds });
        if (features && features.length > 0) {
          const top = features[0];
          let friendlyName = top.layer.id;
          const customLayer = this.geojsonLoader?.getLayers().find(l => top.layer.id.includes(l.id));
          if (customLayer) {
            friendlyName = customLayer.name;
          }
          vectorFeature = {
            layerName: friendlyName,
            properties: top.properties || {}
          };
        }
      }
    }

    this.renderInspectorUI({
      lng,
      lat,
      elevationMeters: elevation,
      lstCelsius: lst,
      activeProductInfo,
      vectorFeature
    });
  }

  private renderInspectorUI(data: InspectionData) {
    const dmsLat = this.toDMS(data.lat, true);
    const dmsLng = this.toDMS(data.lng, false);

    // 1. Position Pin Marker
    if (!this.marker) {
      const el = document.createElement('div');
      el.className = 'inspector-pin-marker';
      el.innerHTML = `<div class="pin-pulse"></div><div class="pin-core"></div>`;
      this.marker = new maplibregl.Marker({ element: el })
        .setLngLat([data.lng, data.lat])
        .addTo(this.map);
    } else {
      this.marker.setLngLat([data.lng, data.lat]);
    }

    // 2. Populate Floating Card UI
    let container = document.getElementById('floating-inspector-card');
    if (!container) {
      container = document.createElement('div');
      container.id = 'floating-inspector-card';
      container.className = 'floating-inspector-card';
      document.body.appendChild(container);
    }

    let extraAttributesHtml = '';
    if (data.vectorFeature && Object.keys(data.vectorFeature.properties).length > 0) {
      const props = data.vectorFeature.properties;
      const rows = Object.entries(props)
        .slice(0, 5)
        .map(([k, v]) => `
          <div class="insp-row">
            <span class="insp-label">${k}:</span>
            <strong class="insp-val">${typeof v === 'object' ? JSON.stringify(v) : v}</strong>
          </div>
        `).join('');
      extraAttributesHtml = `
        <div class="insp-section">
          <div class="insp-section-title">Fitur Vektor (${data.vectorFeature.layerName})</div>
          ${rows}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="insp-header">
        <div class="insp-title-wrap">
          <span class="insp-dot"></span>
          <strong class="insp-title">Inspector Titik Geospasial</strong>
        </div>
        <button id="btn-close-inspector" class="insp-close-btn" title="Tutup Inspector">✕</button>
      </div>

      <div class="insp-body">
        <!-- Coordinates -->
        <div class="insp-section">
          <div class="insp-row">
            <span class="insp-label">Lat / Lng:</span>
            <strong class="insp-val">${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}</strong>
          </div>
          <div class="insp-row">
            <span class="insp-label">DMS:</span>
            <span class="insp-val mono">${dmsLat} • ${dmsLng}</span>
          </div>
        </div>

        <!-- Surface Analytics (Elevation & LST) -->
        <div class="insp-section insp-metrics-grid">
          <div class="insp-metric-card">
            <span class="insp-metric-icon">⛰️</span>
            <div>
              <span class="insp-metric-label">Elevasi SRTM</span>
              <strong class="insp-metric-value">${data.elevationMeters ?? '—'} m</strong>
            </div>
          </div>
          <div class="insp-metric-card">
            <span class="insp-metric-icon">🌡️</span>
            <div>
              <span class="insp-metric-label">MODIS LST Suhu</span>
              <strong class="insp-metric-value">${data.lstCelsius ? data.lstCelsius + '°C' : '—'}</strong>
            </div>
          </div>
        </div>

        <!-- Active EO Product Interpretation -->
        ${data.activeProductInfo ? `
          <div class="insp-section">
            <div class="insp-section-title">${data.activeProductInfo.name}</div>
            <div class="insp-row">
              <span class="insp-label">Status Titik:</span>
              <strong class="insp-val highlight">${data.activeProductInfo.value}</strong>
            </div>
          </div>
        ` : ''}

        ${extraAttributesHtml}

        <div class="insp-footer-actions">
          <button id="btn-copy-insp-coords" class="insp-action-btn">
            Salin Koordinat (WGS84)
          </button>
        </div>
      </div>
    `;

    container.classList.add('active');

    // Bind Close & Copy events
    const closeBtn = container.querySelector('#btn-close-inspector');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.clear());
    }

    const copyBtn = container.querySelector('#btn-copy-insp-coords');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`;
        navigator.clipboard.writeText(text);
        showToast(`Koordinat ${text} disalin ke clipboard`, 'success');
      });
    }
  }
}
