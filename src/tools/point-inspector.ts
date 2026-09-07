import * as maplibregl from 'maplibre-gl';
import { PikselLoader } from './piksel-loader';
import { GEELoader } from './gee-loader';
import { GeoJsonLoader } from './geojson-loader';
import { MeasureTool } from './measure';
import { showToast } from '../ui/toast';

export class PointInspector {
  private map: maplibregl.Map;
  private pikselLoader?: PikselLoader;
  private geeLoader?: GEELoader;
  private geojsonLoader?: GeoJsonLoader;
  private measureTool?: MeasureTool;
  private marker: maplibregl.Marker | null = null;
  private containerEl: HTMLElement | null = null;
  private isEnabled: boolean = true;

  constructor(
    map: maplibregl.Map,
    pikselLoader?: PikselLoader,
    geeLoader?: GEELoader,
    geojsonLoader?: GeoJsonLoader,
    measureTool?: MeasureTool
  ) {
    this.map = map;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.geojsonLoader = geojsonLoader;
    this.measureTool = measureTool;

    this.containerEl = document.getElementById('floating-inspector-card');
    this.bindMapEvents();
    this.bindCardActions();
  }

  private bindMapEvents() {
    this.map.on('click', (e) => {
      if (!this.isEnabled) return;
      if (this.measureTool && this.measureTool.getMode() !== 'none') return;

      // Ignore if user clicked on another interactive marker or drawer
      const originalTarget = (e.originalEvent?.target as HTMLElement);
      if (originalTarget && (originalTarget.closest('.mapboxgl-marker') || originalTarget.closest('.sidebar-drawer') || originalTarget.closest('.floating-inspector-card') || originalTarget.closest('.bottom-tools-dock'))) {
        return;
      }

      this.inspectCoordinate(e.lngLat.lng, e.lngLat.lat, e.point);
    });
  }

  private bindCardActions() {
    const closeBtn = document.getElementById('floating-insp-close');
    closeBtn?.addEventListener('click', () => {
      this.close();
    });

    const copyBtn = document.getElementById('btn-insp-copy-coords');
    copyBtn?.addEventListener('click', () => {
      const coordsText = document.getElementById('insp-coord-decimal')?.innerText;
      if (coordsText && navigator.clipboard) {
        navigator.clipboard.writeText(coordsText).then(() => {
          showToast('Koordinat WGS84 disalin ke clipboard!', 'success');
        });
      }
    });
  }

  public close() {
    if (this.containerEl) {
      this.containerEl.classList.remove('active');
    }
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }

  public clear() {
    this.close();
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

  public inspectCoordinate(lng: number, lat: number, screenPoint?: maplibregl.PointLike) {
    // 1. Check Active Layer Information
    let activeLayerName = 'Peta Dasar (Basemap)';
    let activeLayerCategory = 'Basemap';

    const pikselProduct = this.pikselLoader?.getActiveProduct();
    if (pikselProduct) {
      const year = this.pikselLoader?.getSelectedYear() || '2025';
      activeLayerName = `${pikselProduct.name} (${year})`;
      activeLayerCategory = 'Piksel OGC WMS (10m)';
    } else if (this.geeLoader) {
      if (this.geeLoader.isLayerVisible('lst')) {
        activeLayerName = 'MODIS Daytime LST Heatmap (2020–2024)';
        activeLayerCategory = 'Studi Kasus Termal GEE';
      } else if (this.geeLoader.isLayerVisible('elevation')) {
        activeLayerName = 'USGS SRTM Ground Elevation DEM (30m)';
        activeLayerCategory = 'Studi Kasus Elevasi GEE';
      } else if (this.geeLoader.isLayerVisible('landcover')) {
        activeLayerName = 'MODIS MCD12Q1 Tutupan Lahan (500m)';
        activeLayerCategory = 'Studi Kasus Klasifikasi GEE';
      }
    }

    // 2. Query Real Vector Features at Point (from custom GeoJSON layers & sample cities)
    let vectorFeatureName: string | undefined = undefined;
    let vectorProperties: Record<string, any> | undefined = undefined;

    if (screenPoint) {
      const px = Array.isArray(screenPoint) ? screenPoint[0] : (screenPoint as maplibregl.Point).x;
      const py = Array.isArray(screenPoint) ? screenPoint[1] : (screenPoint as maplibregl.Point).y;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [px - 8, py - 8],
        [px + 8, py + 8]
      ];
      
      const customLayers = this.geojsonLoader?.getLayers() || [];
      for (const cl of customLayers) {
        if (!cl.visible) continue;
        const candidateLayerIds = [`layer-point-${cl.id}`, `layer-fill-${cl.id}`, `layer-line-${cl.id}`]
          .filter(lId => this.map.getLayer(lId));
        
        if (candidateLayerIds.length === 0) continue;

        const features = this.map.queryRenderedFeatures(bbox, {
          layers: candidateLayerIds
        });

        if (features && features.length > 0) {
          const f = features[0];
          const props = f.properties || {};
          vectorFeatureName = props.name || props.nama_obj || props.NAMOBJ || props.Kabupaten || props.Kota || cl.name;
          vectorProperties = props;
          break;
        }
      }
    }

    // 3. Render Floating Card UI
    this.renderInspectorCard(lng, lat, activeLayerName, activeLayerCategory, vectorFeatureName, vectorProperties);

    // 4. Place Glowing Pin Marker on Map
    this.placePinMarker(lng, lat);
  }

  private renderInspectorCard(
    lng: number,
    lat: number,
    activeLayerName: string,
    activeLayerCategory: string,
    vectorName?: string,
    vectorProps?: Record<string, any>
  ) {
    if (!this.containerEl) {
      this.containerEl = document.getElementById('floating-inspector-card');
    }
    if (!this.containerEl) return;

    const latDms = this.toDMS(lat, true);
    const lngDms = this.toDMS(lng, false);

    const latEl = document.getElementById('insp-lat');
    const lngEl = document.getElementById('insp-lng');
    const decimalEl = document.getElementById('insp-coord-decimal');
    const productNameEl = document.getElementById('insp-product-name');
    const productValEl = document.getElementById('insp-product-val');
    const vectorWrapEl = document.getElementById('insp-vector-row');
    const vectorValEl = document.getElementById('insp-vector-val');
    const vectorPropsSlot = document.getElementById('insp-vector-props-slot');

    if (latEl) latEl.innerText = latDms;
    if (lngEl) lngEl.innerText = lngDms;
    if (decimalEl) decimalEl.innerText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    // Keep hidden fallback elements for legacy test compatibility
    const elvEl = document.getElementById('insp-elevation');
    const lstEl = document.getElementById('insp-lst');
    if (elvEl) elvEl.innerText = 'Tidak tersedia (Query WMS)';
    if (lstEl) lstEl.innerText = 'Tidak tersedia (Query WMS)';

    if (productNameEl && productValEl) {
      productNameEl.innerText = 'Lapisan Aktif';
      productValEl.innerText = `${activeLayerName} · ${activeLayerCategory}`;
    }

    if (vectorWrapEl && vectorValEl) {
      if (vectorName) {
        vectorValEl.innerText = vectorName;
        vectorWrapEl.style.display = 'block';

        if (vectorPropsSlot && vectorProps) {
          const rows = Object.entries(vectorProps)
            .filter(([k]) => k !== 'name' && k !== 'nama_obj')
            .slice(0, 4)
            .map(([k, v]) => `
              <div class="insp-row" style="font-size: 11px; padding: 2px 0;">
                <span class="insp-label" style="color: #64748b;">${k}:</span>
                <span class="insp-val" style="color: #cbd5e1;">${v}</span>
              </div>
            `).join('');
          vectorPropsSlot.innerHTML = rows;
        }
      } else {
        vectorWrapEl.style.display = 'none';
        if (vectorPropsSlot) vectorPropsSlot.innerHTML = '';
      }
    }

    this.containerEl.classList.add('active');
  }

  private placePinMarker(lng: number, lat: number) {
    if (this.marker) {
      this.marker.remove();
    }

    const el = document.createElement('div');
    el.className = 'inspector-pin-marker';
    el.innerHTML = `
      <div class="pin-pulse"></div>
      <div class="pin-core"></div>
    `;

    this.marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(this.map);
  }
}
