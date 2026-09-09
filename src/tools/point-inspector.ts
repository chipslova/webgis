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
      if (document.body.classList.contains('swipe-mode-active')) return;
      if (this.measureTool && this.measureTool.getMode() !== 'none') return;

      // Ignore if user clicked on another interactive marker, sidebar, or dock
      const originalTarget = (e.originalEvent?.target as HTMLElement);
      if (originalTarget && (originalTarget.closest('.mapboxgl-marker') || originalTarget.closest('#sidebar') || originalTarget.closest('.sidebar') || originalTarget.closest('.floating-inspector-card') || originalTarget.closest('.bottom-tools-dock') || originalTarget.closest('.glass-popover') || originalTarget.closest('.app-header') || originalTarget.closest('.swipe-ui-root') || originalTarget.closest('#swipe-compare-overlay'))) {
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
        activeLayerName = 'MODIS Daytime LST Heatmap (2020–2026)';
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

    // 5. Asynchronously Query Real OGC WMS GetFeatureInfo (if raster layer active)
    this.queryWMSGetFeatureInfo(lng, lat, screenPoint);
  }

  private async queryWMSGetFeatureInfo(lng: number, lat: number, screenPoint?: maplibregl.PointLike) {
    const rasterStatusEl = document.getElementById('insp-raster-query-status');
    const pikselProduct = this.pikselLoader?.getActiveProduct();
    
    if (!pikselProduct) {
      if (rasterStatusEl) {
        rasterStatusEl.innerText = 'Peta visual (Tidak ada citra WMS aktif)';
        rasterStatusEl.style.color = 'var(--text-muted)';
      }
      return;
    }

    if (rasterStatusEl) {
      rasterStatusEl.innerText = 'Meminta GetFeatureInfo dari server BIG Piksel...';
      rasterStatusEl.style.color = '#38bdf8';
    }

    try {
      const bounds = this.map.getBounds();
      const canvas = this.map.getCanvas();
      const width = canvas.clientWidth || 800;
      const height = canvas.clientHeight || 600;

      let x = 0;
      let y = 0;
      if (screenPoint) {
        x = Math.round(Array.isArray(screenPoint) ? screenPoint[0] : (screenPoint as maplibregl.Point).x);
        y = Math.round(Array.isArray(screenPoint) ? screenPoint[1] : (screenPoint as maplibregl.Point).y);
      } else {
        const pt = this.map.project([lng, lat]);
        x = Math.round(pt.x);
        y = Math.round(pt.y);
      }

      // Clamp coordinate within viewport bounds
      x = Math.max(0, Math.min(width, x));
      y = Math.max(0, Math.min(height, y));

      const bboxStr = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
      const year = this.pikselLoader?.getSelectedYear() || '2025';

      const url = new URL(pikselProduct.serviceUrl || 'https://ows.staging.piksel.big.go.id/wms');
      url.searchParams.set('SERVICE', 'WMS');
      url.searchParams.set('VERSION', '1.3.0');
      url.searchParams.set('REQUEST', 'GetFeatureInfo');
      url.searchParams.set('LAYERS', pikselProduct.layer);
      url.searchParams.set('QUERY_LAYERS', pikselProduct.layer);
      url.searchParams.set('STYLES', pikselProduct.style || '');
      url.searchParams.set('CRS', 'EPSG:4326');
      url.searchParams.set('BBOX', bboxStr);
      url.searchParams.set('WIDTH', String(width));
      url.searchParams.set('HEIGHT', String(height));
      url.searchParams.set('I', String(x));
      url.searchParams.set('J', String(y));
      url.searchParams.set('INFO_FORMAT', 'application/json');
      if (pikselProduct.timeEnabled) {
        url.searchParams.set('TIME', `${year}-01-01`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(text);
      } catch {}

      if (parsedJson && parsedJson.features && parsedJson.features.length > 0) {
        const props = parsedJson.features[0].properties || {};
        const entries = Object.entries(props);
        if (entries.length > 0) {
          const summary = entries
            .slice(0, 3)
            .map(([k, v]) => `<span style="color:#00f0ff;">${k}:</span> ${v}`)
            .join(' · ');
          if (rasterStatusEl) {
            rasterStatusEl.innerHTML = `<strong>Data Piksel:</strong> ${summary}`;
            rasterStatusEl.style.color = '#00f0ff';
          }
        } else {
          const val = props.value ?? props.gray_index ?? props.band_1 ?? 'Data terdeteksi';
          if (rasterStatusEl) {
            rasterStatusEl.innerHTML = `<strong style="color: #00f0ff;">Piksel Terdeteksi: ${val}</strong> (GetFeatureInfo)`;
            rasterStatusEl.style.color = '#00f0ff';
          }
        }
      } else if (text && text.trim().length > 0 && !text.includes('<?xml') && !text.includes('ServiceException')) {
        if (rasterStatusEl) {
          rasterStatusEl.innerText = `Hasil OGC: ${text.substring(0, 50)}`;
          rasterStatusEl.style.color = '#cbd5e1';
        }
      } else {
        if (rasterStatusEl) {
          rasterStatusEl.innerText = 'Visualisasi Citra WMS (Disajikan sebagai layer peta)';
          rasterStatusEl.style.color = 'var(--text-muted)';
        }
      }
    } catch (e) {
      if (rasterStatusEl) {
        rasterStatusEl.innerText = 'Visualisasi Citra WMS (Disajikan sebagai layer peta)';
        rasterStatusEl.style.color = 'var(--text-muted)';
      }
    }
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
