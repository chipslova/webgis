import * as maplibregl from 'maplibre-gl';
import {
  GEE_POI_DATA,
  GEE_LST_POINT_DATA,
  GEE_ELEVATION_GRID_DATA,
  GEE_LANDCOVER_GRID_DATA
} from '../data/gee-datasets';

export class GEELoader {
  private map: maplibregl.Map;
  private popup: maplibregl.Popup;
  private htmlMarkers: maplibregl.Marker[] = [];

  // In-memory GeoJSON Datasets
  private poiData: GeoJSON.FeatureCollection = GEE_POI_DATA;
  private lstPointData: GeoJSON.FeatureCollection = GEE_LST_POINT_DATA;
  private elvData: GeoJSON.FeatureCollection = GEE_ELEVATION_GRID_DATA;
  private lcData: GeoJSON.FeatureCollection = GEE_LANDCOVER_GRID_DATA;

  // Active layers in workspace
  private activeLayers: Set<string> = new Set(['poi']);
  // Visibility states
  private layerVisibilities: Map<string, boolean> = new Map([
    ['poi', true],
    ['lst', true],
    ['elevation', true],
    ['landcover', true]
  ]);
  // Independent layer opacities
  private layerOpacities: Map<string, number> = new Map([
    ['lst', 0.82],
    ['elevation', 0.75],
    ['landcover', 0.75]
  ]);

  private isEventsBound: boolean = false;
  private onLayersChangeCallbacks: Array<() => void> = [];

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '340px'
    });
  }

  public onLayersChange(callback: () => void) {
    this.onLayersChangeCallbacks.push(callback);
  }

  private notifyLayersChange() {
    this.onLayersChangeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn('[GEELoader] Error in layersChange callback:', e);
      }
    });
  }

  public getAllMapLayerIds(): string[] {
    return [
      'gee-elevation-fill',
      'gee-landcover-fill',
      'gee-lst-heatmap',
      'gee-poi-circles'
    ];
  }

  public isLayerActive(layerId: string): boolean {
    return this.activeLayers.has(layerId);
  }

  public isLayerVisible(layerId: string): boolean {
    return this.activeLayers.has(layerId) && (this.layerVisibilities.get(layerId) ?? true);
  }

  public setLayerVisible(layerId: string, visible: boolean) {
    this.layerVisibilities.set(layerId, visible);
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  public toggleLayer(layerId: string, active: boolean) {
    if (active) {
      this.activeLayers.add(layerId);
      this.layerVisibilities.set(layerId, true);
    } else {
      this.activeLayers.delete(layerId);
    }

    this.renderAllLayers();
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  public setLayerOpacity(layerId: string, opacity: number) {
    this.layerOpacities.set(layerId, opacity);
    if (!this.map) return;

    if (layerId === 'elevation' && this.map.getLayer('gee-elevation-fill')) {
      this.map.setPaintProperty('gee-elevation-fill', 'fill-opacity', opacity);
    } else if (layerId === 'landcover' && this.map.getLayer('gee-landcover-fill')) {
      this.map.setPaintProperty('gee-landcover-fill', 'fill-opacity', opacity);
    } else if (layerId === 'lst' && this.map.getLayer('gee-lst-heatmap')) {
      this.map.setPaintProperty('gee-lst-heatmap', 'heatmap-opacity', opacity);
    }
    this.notifyLayersChange();
  }

  public getLayerOpacity(layerId: string): number {
    return this.layerOpacities.get(layerId) ?? 0.8;
  }

  public setOpacity(opacity: number) {
    ['lst', 'elevation', 'landcover'].forEach((id) => this.setLayerOpacity(id, opacity));
  }

  public getOpacity(): number {
    return this.layerOpacities.get('lst') ?? 0.82;
  }

  public clearAllLayers() {
    this.activeLayers.clear();
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  public flyToStudyArea() {
    if (!this.map) return;
    this.map.flyTo({
      center: [106.8272, -6.3500],
      zoom: 9.8,
      pitch: 25,
      duration: 1500
    });
  }

  public async loadGEEDatasets() {
    this.renderAllLayers();
    this.renderHtmlMarkers();

    if (!this.isEventsBound) {
      this.bindLayerEvents();
      this.isEventsBound = true;
    }
  }

  public renderAllLayers() {
    if (!this.map) return;

    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.renderAllLayers());
      return;
    }

    const isElvActive = this.isLayerActive('elevation');
    const isLcActive = this.isLayerActive('landcover');
    const isLstActive = this.isLayerActive('lst');
    const isPoiActive = this.isLayerActive('poi');

    const isElvVis = isElvActive && (this.layerVisibilities.get('elevation') ?? true);
    const isLcVis = isLcActive && (this.layerVisibilities.get('landcover') ?? true);
    const isLstVis = isLstActive && (this.layerVisibilities.get('lst') ?? true);
    const isPoiVis = isPoiActive && (this.layerVisibilities.get('poi') ?? true);

    // --- 1. ELEVATION LAYER (USGS SRTM 30m - Smooth Gradient Fill) ---
    try {
      const elvSrc = this.map.getSource('gee-elevation-source') as maplibregl.GeoJSONSource;
      if (!elvSrc) {
        this.map.addSource('gee-elevation-source', {
          type: 'geojson',
          data: this.elvData
        });
      } else if (typeof elvSrc.setData === 'function') {
        elvSrc.setData(this.elvData);
      }

      if (!this.map.getLayer('gee-elevation-fill')) {
        this.map.addLayer({
          id: 'gee-elevation-fill',
          type: 'fill',
          source: 'gee-elevation-source',
          layout: { visibility: isElvVis ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'elevation_m']], 0],
              0, 'rgba(16, 185, 129, 0.4)',
              50, 'rgba(132, 204, 22, 0.55)',
              200, 'rgba(234, 179, 8, 0.7)',
              600, 'rgba(194, 65, 12, 0.82)',
              1200, 'rgba(245, 245, 245, 0.92)'
            ],
            'fill-opacity': this.getLayerOpacity('elevation')
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding Elevation layer:', e);
    }

    // --- 2. LAND COVER LAYER (MODIS MCD12Q1) ---
    try {
      const lcSrc = this.map.getSource('gee-landcover-source') as maplibregl.GeoJSONSource;
      if (!lcSrc) {
        this.map.addSource('gee-landcover-source', {
          type: 'geojson',
          data: this.lcData
        });
      } else if (typeof lcSrc.setData === 'function') {
        lcSrc.setData(this.lcData);
      }

      if (!this.map.getLayer('gee-landcover-fill')) {
        this.map.addLayer({
          id: 'gee-landcover-fill',
          type: 'fill',
          source: 'gee-landcover-source',
          layout: { visibility: isLcVis ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'match',
              ['get', 'lc_code'],
              17, '#0284c7', // Water
              13, '#e11d48', // Urban
              12, '#eab308', // Croplands
              1, '#15803d',  // Forest
              '#64748b'
            ],
            'fill-opacity': this.getLayerOpacity('landcover')
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding Land Cover layer:', e);
    }

    // --- 3. MODIS LST DAYTIME (SMOOTH CONTINUOUS WEBGL HEATMAP) ---
    try {
      const lstSrc = this.map.getSource('gee-lst-point-source') as maplibregl.GeoJSONSource;
      if (!lstSrc) {
        this.map.addSource('gee-lst-point-source', {
          type: 'geojson',
          data: this.lstPointData
        });
      } else if (typeof lstSrc.setData === 'function') {
        lstSrc.setData(this.lstPointData);
      }

      if (!this.map.getLayer('gee-lst-heatmap')) {
        this.map.addLayer({
          id: 'gee-lst-heatmap',
          type: 'heatmap',
          source: 'gee-lst-point-source',
          layout: { visibility: isLstVis ? 'visible' : 'none' },
          paint: {
            // Increase heatmap weight based on thermal temperature
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'thermal_weight']], 0.5],
              0, 0.1,
              0.5, 0.6,
              1, 1.4
            ],
            // Increase heatmap intensity based on zoom level
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7, 0.8,
              10, 1.4,
              13, 2.2
            ],
            // NASA MODIS Thermal Spectrum Color Ramp (Cold Blue -> Cyan -> Yellow -> Orange -> Crimson)
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0.0, 'rgba(0, 0, 0, 0)',
              0.12, 'rgba(14, 116, 144, 0.45)', // 22°C Cold
              0.32, 'rgba(16, 185, 129, 0.65)', // 25°C Moderate
              0.52, 'rgba(234, 179, 8, 0.82)',  // 28°C Warm
              0.72, 'rgba(249, 115, 22, 0.92)', // 31°C Hot
              0.88, 'rgba(225, 29, 72, 0.96)',  // 34°C Urban Hotspot
              1.0, 'rgba(255, 255, 255, 1.0)'   // 36°C+ Peak Heat Core
            ],
            // Smooth radius scaling with zoom
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7, 18,
              9, 32,
              11, 55,
              13, 90
            ],
            'heatmap-opacity': this.getLayerOpacity('lst')
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding LST Heatmap layer:', e);
    }

    // --- 4. POI LAYER ---
    try {
      const poiSrc = this.map.getSource('gee-poi-source') as maplibregl.GeoJSONSource;
      if (!poiSrc) {
        this.map.addSource('gee-poi-source', {
          type: 'geojson',
          data: this.poiData
        });
      } else if (typeof poiSrc.setData === 'function') {
        poiSrc.setData(this.poiData);
      }

      if (!this.map.getLayer('gee-poi-circles')) {
        this.map.addLayer({
          id: 'gee-poi-circles',
          type: 'circle',
          source: 'gee-poi-source',
          layout: { visibility: isPoiVis ? 'visible' : 'none' },
          paint: {
            'circle-radius': 12,
            'circle-color': [
              'case',
              ['==', ['get', 'category'], 'Urban Core'], '#dc2626',
              ['==', ['get', 'category'], 'Rural / Forest'], '#16a34a',
              '#3b82f6'
            ],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding POI layer:', e);
    }
  }

  public renderHtmlMarkers() {
    if (!this.map) return;

    this.htmlMarkers.forEach((m) => m.remove());
    this.htmlMarkers = [];

    const isPoiVis = this.isLayerVisible('poi');

    this.poiData.features.forEach((feat: any) => {
      const coords = feat.geometry.coordinates as [number, number];
      const props = feat.properties;

      const isUrban = props.category === 'Urban Core' || props.id === 'urban_poi';
      const badgeClass = isUrban ? 'urban_poi' : 'rural_poi';
      const icon = isUrban ? '🏙️' : '🌲';

      const el = document.createElement('div');
      el.className = `gee-map-marker ${badgeClass}`;
      el.innerHTML = `
        <div class="marker-pulse ${badgeClass}"></div>
        <div class="marker-pin ${badgeClass}">
          <span class="marker-icon">${icon}</span>
        </div>
        <div class="marker-label">${props.name.split(' (')[0]}</div>
      `;

      el.addEventListener('click', () => {
        const html = `
          <div class="gee-popup-card">
            <div class="gee-popup-badge ${badgeClass}">${props.category}</div>
            <h4>${props.name}</h4>
            <table class="gee-popup-table">
              <tr><td><strong>Mean Daytime LST:</strong></td><td><span class="highlight-temp">${props.mean_lst_celsius} °C</span></td></tr>
              <tr><td><strong>Ground Elevation:</strong></td><td>${props.elevation_m} m</td></tr>
              <tr><td><strong>Land Cover:</strong></td><td>${props.land_cover_name}</td></tr>
              <tr><td><strong>Coordinates:</strong></td><td>${props.latitude.toFixed(4)}, ${props.longitude.toFixed(4)}</td></tr>
            </table>
          </div>
        `;
        this.popup.setLngLat(coords).setHTML(html).addTo(this.map);
      });

      if (!isPoiVis) {
        el.style.display = 'none';
      }

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(this.map);

      this.htmlMarkers.push(marker);
    });
  }

  public updateLayerVisibilities() {
    if (!this.map) return;

    const isLstVis = this.isLayerVisible('lst');
    const isElvVis = this.isLayerVisible('elevation');
    const isLcVis = this.isLayerVisible('landcover');
    const isPoiVis = this.isLayerVisible('poi');

    if (this.map.getLayer('gee-lst-heatmap')) {
      this.map.setLayoutProperty('gee-lst-heatmap', 'visibility', isLstVis ? 'visible' : 'none');
    }

    if (this.map.getLayer('gee-elevation-fill')) {
      this.map.setLayoutProperty('gee-elevation-fill', 'visibility', isElvVis ? 'visible' : 'none');
    }

    if (this.map.getLayer('gee-landcover-fill')) {
      this.map.setLayoutProperty('gee-landcover-fill', 'visibility', isLcVis ? 'visible' : 'none');
    }

    if (this.map.getLayer('gee-poi-circles')) {
      this.map.setLayoutProperty('gee-poi-circles', 'visibility', isPoiVis ? 'visible' : 'none');
    }

    this.htmlMarkers.forEach((m) => {
      const el = m.getElement();
      if (el) {
        el.style.display = isPoiVis ? 'flex' : 'none';
      }
    });
  }

  private bindLayerEvents() {
    if (!this.map) return;

    this.map.on('click', 'gee-elevation-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const props = feat.properties as any;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <div class="gee-popup-badge" style="background: #10b981; color: #fff;">USGS SRTM DEM</div>
            <h4>Ketinggian Topografi</h4>
            <p style="margin: 6px 0; font-size: 14px;"><strong>${props.elevation_m} meter</strong> dpl</p>
          </div>
        `)
        .addTo(this.map);
    });

    this.map.on('click', 'gee-landcover-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const props = feat.properties as any;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <div class="gee-popup-badge" style="background: #0284c7; color: #fff;">MODIS MCD12Q1</div>
            <h4>Klasifikasi Tutupan Lahan</h4>
            <p style="margin: 6px 0; font-size: 13px;"><strong>${props.lc_name}</strong> (Kode: ${props.lc_code})</p>
          </div>
        `)
        .addTo(this.map);
    });
  }

  public getMap(): maplibregl.Map {
    return this.map;
  }
}
