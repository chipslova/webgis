import * as maplibregl from 'maplibre-gl';
import {
  GEE_POI_DATA,
  GEE_LST_GRID_DATA,
  GEE_ELEVATION_GRID_DATA,
  GEE_LANDCOVER_GRID_DATA
} from '../data/gee-datasets';

export class GEELoader {
  private map: maplibregl.Map;
  private popup: maplibregl.Popup;
  private htmlMarkers: maplibregl.Marker[] = [];

  // In-memory GeoJSON Datasets
  private poiData: GeoJSON.FeatureCollection = GEE_POI_DATA;
  private lstData: GeoJSON.FeatureCollection = GEE_LST_GRID_DATA;
  private elvData: GeoJSON.FeatureCollection = GEE_ELEVATION_GRID_DATA;
  private lcData: GeoJSON.FeatureCollection = GEE_LANDCOVER_GRID_DATA;

  // Visibility states (POI on by default, grids user-toggleable)
  private lstVisible: boolean = false;
  private poiVisible: boolean = true;
  private elevationVisible: boolean = false;
  private landcoverVisible: boolean = false;
  private currentOpacity: number = 0.8;

  private isEventsBound: boolean = false;
  private onLayersChangeCallbacks: Array<() => void> = [];

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '340px'
    });
    // NOTE: style.load listener centralized in MapManager.onStyleReady()
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
      'gee-elevation-fill', 'gee-elevation-outline',
      'gee-landcover-fill', 'gee-landcover-outline',
      'gee-lst-fill', 'gee-lst-outline',
      'gee-poi-circles'
    ];
  }

  public setOpacity(opacity: number) {
    this.currentOpacity = opacity;
    if (!this.map) return;
    if (this.map.getLayer('gee-elevation-fill')) {
      this.map.setPaintProperty('gee-elevation-fill', 'fill-opacity', opacity);
    }
    if (this.map.getLayer('gee-landcover-fill')) {
      this.map.setPaintProperty('gee-landcover-fill', 'fill-opacity', opacity);
    }
    if (this.map.getLayer('gee-lst-fill')) {
      this.map.setPaintProperty('gee-lst-fill', 'fill-opacity', opacity);
    }
    this.notifyLayersChange();
  }

  public getOpacity(): number {
    return this.currentOpacity;
  }

  public clearAllLayers() {
    this.lstVisible = false;
    this.elevationVisible = false;
    this.landcoverVisible = false;
    this.poiVisible = false;
    this.updateLayerVisibilities();
    this.notifyLayersChange();
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

    // --- 1. ELEVATION LAYER (USGS SRTM) ---
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
          layout: { visibility: this.elevationVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'elevation_m']], 0],
              0, '#006633',
              50, '#84cc16',
              200, '#eab308',
              600, '#c2410c',
              1200, '#f5f5f5'
            ],
            'fill-opacity': 0.8
          }
        });
      }
      if (!this.map.getLayer('gee-elevation-outline')) {
        this.map.addLayer({
          id: 'gee-elevation-outline',
          type: 'line',
          source: 'gee-elevation-source',
          layout: { visibility: this.elevationVisible ? 'visible' : 'none' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 0.6,
            'line-opacity': 0.6
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
          layout: { visibility: this.landcoverVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'match',
              ['coalesce', ['to-number', ['get', 'lc_code']], 0],
              17, '#0284c7', // Water
              13, '#e11d48', // Urban
              12, '#eab308', // Cropland
              1, '#15803d',  // Forest
              '#94a3b8'      // Other
            ],
            'fill-opacity': 0.8
          }
        });
      }
      if (!this.map.getLayer('gee-landcover-outline')) {
        this.map.addLayer({
          id: 'gee-landcover-outline',
          type: 'line',
          source: 'gee-landcover-source',
          layout: { visibility: this.landcoverVisible ? 'visible' : 'none' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 0.6,
            'line-opacity': 0.6
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding Land Cover layer:', e);
    }

    // --- 3. LST HEATMAP LAYER (MODIS MOD11A1) ---
    try {
      const lstSrc = this.map.getSource('gee-lst-source') as maplibregl.GeoJSONSource;
      if (!lstSrc) {
        this.map.addSource('gee-lst-source', {
          type: 'geojson',
          data: this.lstData
        });
      } else if (typeof lstSrc.setData === 'function') {
        lstSrc.setData(this.lstData);
      }

      if (!this.map.getLayer('gee-lst-fill')) {
        this.map.addLayer({
          id: 'gee-lst-fill',
          type: 'fill',
          source: 'gee-lst-source',
          layout: { visibility: this.lstVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'lst_celsius']], 25],
              18, '#1e40af', // Deep blue (~18°C)
              22, '#0284c7', // Sky blue (~22°C)
              25, '#10b981', // Green (~25°C)
              28, '#f59e0b', // Yellow / Warm (~28°C)
              31, '#ea580c', // Orange / Hot (~31°C)
              34, '#dc2626'  // Red / Extreme Heat (~34°C+)
            ],
            'fill-opacity': 0.85
          }
        });
      }
      if (!this.map.getLayer('gee-lst-outline')) {
        this.map.addLayer({
          id: 'gee-lst-outline',
          type: 'line',
          source: 'gee-lst-source',
          layout: { visibility: this.lstVisible ? 'visible' : 'none' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 0.8,
            'line-opacity': 0.7
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding LST layer:', e);
    }

    // --- 4. POI VECTOR CIRCLES ---
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
          layout: { visibility: this.poiVisible ? 'visible' : 'none' },
          paint: {
            'circle-radius': 14,
            'circle-color': [
              'match',
              ['get', 'id'],
              'urban_poi', '#dc2626',
              'rural_poi', '#16a34a',
              '#3b82f6'
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    } catch (e) {
      console.warn('Notice adding POI layer:', e);
    }

    this.updateLayerVisibilities();
  }

  private renderHtmlMarkers() {
    this.htmlMarkers.forEach(m => m.remove());
    this.htmlMarkers = [];

    this.poiData.features.forEach((feat: any) => {
      const coords = feat.geometry.coordinates;
      const props = feat.properties;

      const el = document.createElement('div');
      el.className = `gee-map-marker ${props.id}`;
      el.innerHTML = `
        <div class="marker-pulse ${props.id}"></div>
        <div class="marker-pin ${props.id}">
          <span class="marker-icon">${props.id === 'urban_poi' ? '🏙️' : '🌲'}</span>
        </div>
        <div class="marker-label">${props.name.split(' (')[0]}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const html = `
          <div class="gee-popup-card">
            <div class="gee-popup-badge ${props.id}">${props.category}</div>
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

      if (!this.poiVisible) {
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

    if (this.map.getLayer('gee-lst-fill')) {
      this.map.setLayoutProperty('gee-lst-fill', 'visibility', this.lstVisible ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-lst-outline')) {
      this.map.setLayoutProperty('gee-lst-outline', 'visibility', this.lstVisible ? 'visible' : 'none');
    }

    if (this.map.getLayer('gee-elevation-fill')) {
      this.map.setLayoutProperty('gee-elevation-fill', 'visibility', this.elevationVisible ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-elevation-outline')) {
      this.map.setLayoutProperty('gee-elevation-outline', 'visibility', this.elevationVisible ? 'visible' : 'none');
    }

    if (this.map.getLayer('gee-landcover-fill')) {
      this.map.setLayoutProperty('gee-landcover-fill', 'visibility', this.landcoverVisible ? 'visible' : 'none');
    }
    if (this.map.getLayer('gee-landcover-outline')) {
      this.map.setLayoutProperty('gee-landcover-outline', 'visibility', this.landcoverVisible ? 'visible' : 'none');
    }

    if (this.map.getLayer('gee-poi-circles')) {
      this.map.setLayoutProperty('gee-poi-circles', 'visibility', this.poiVisible ? 'visible' : 'none');
    }

    this.htmlMarkers.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.display = this.poiVisible ? 'flex' : 'none';
    });
  }

  private bindLayerEvents() {
    // Click LST grid cell
    this.map.on('click', 'gee-lst-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <h4>🌡️ MODIS LST Thermal Grid</h4>
            <p><strong>LST Day:</strong> <span class="highlight-temp">${props.lst_celsius} °C</span> (${props.lst_kelvin} K)</p>
          </div>
        `)
        .addTo(this.map);
    });

    // Click Elevation grid cell
    this.map.on('click', 'gee-elevation-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <h4>⛰️ USGS SRTM Ground Elevation</h4>
            <p><strong>Elevation:</strong> <span class="highlight-temp">${props.elevation_m} meters</span></p>
          </div>
        `)
        .addTo(this.map);
    });

    // Click Land Cover cell
    this.map.on('click', 'gee-landcover-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <h4>🌳 MODIS Land Cover Classification</h4>
            <p><strong>Class:</strong> <span class="highlight-temp">${props.lc_name}</span> (Code: ${props.lc_code})</p>
          </div>
        `)
        .addTo(this.map);
    });

    // Cursor pointer on hover
    ['gee-lst-fill', 'gee-elevation-fill', 'gee-landcover-fill', 'gee-poi-circles'].forEach((layerId) => {
      this.map.on('mouseenter', layerId, () => (this.map.getCanvas().style.cursor = 'pointer'));
      this.map.on('mouseleave', layerId, () => (this.map.getCanvas().style.cursor = ''));
    });
  }

  public flyToStudyArea() {
    this.map.flyTo({
      center: [106.9, -6.35],
      zoom: 9.5,
      pitch: 0,
      bearing: 0,
      duration: 1500
    });
  }

  public isLayerVisible(layerId: string): boolean {
    if (layerId === 'lst') return this.lstVisible;
    if (layerId === 'elevation') return this.elevationVisible;
    if (layerId === 'landcover') return this.landcoverVisible;
    if (layerId === 'poi') return this.poiVisible;
    return false;
  }

  public toggleLayer(layerId: string, visible: boolean) {
    if (layerId === 'lst') this.lstVisible = visible;
    if (layerId === 'elevation') this.elevationVisible = visible;
    if (layerId === 'landcover') this.landcoverVisible = visible;
    if (layerId === 'poi') this.poiVisible = visible;

    this.renderAllLayers();
    this.updateLayerVisibilities();
    this.notifyLayersChange();
  }

  /** Called centrally by MapManager after style.load — re-creates sources/layers and HTML markers. */
  public restoreAfterStyleChange() {
    this.renderAllLayers();
    this.renderHtmlMarkers();
  }

  // Expose map for external use
  public getMap(): maplibregl.Map {
    return this.map;
  }
}

