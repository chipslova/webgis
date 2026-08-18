import * as maplibregl from 'maplibre-gl';

export class GEELoader {
  private map: maplibregl.Map;
  private popup: maplibregl.Popup;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '300px'
    });
  }

  public async loadGEEDatasets() {
    try {
      // 1. Fetch Datasets
      const [poiRes, lstRes, elvRes, lcRes] = await Promise.all([
        fetch('/data/gee_jakarta_poi.geojson').then(r => r.json()),
        fetch('/data/gee_lst_grid.geojson').then(r => r.json()),
        fetch('/data/gee_elevation_grid.geojson').then(r => r.json()),
        fetch('/data/gee_landcover.geojson').then(r => r.json())
      ]);

      // 2. Add Sources
      if (!this.map.getSource('gee-lst-source')) {
        this.map.addSource('gee-lst-source', { type: 'geojson', data: lstRes });
      }
      if (!this.map.getSource('gee-elevation-source')) {
        this.map.addSource('gee-elevation-source', { type: 'geojson', data: elvRes });
      }
      if (!this.map.getSource('gee-landcover-source')) {
        this.map.addSource('gee-landcover-source', { type: 'geojson', data: lcRes });
      }
      if (!this.map.getSource('gee-poi-source')) {
        this.map.addSource('gee-poi-source', { type: 'geojson', data: poiRes });
      }

      // 3. Add Layers
      // LST Heatmap Layer (MODIS LST Day 1km in °C)
      if (!this.map.getLayer('gee-lst-fill')) {
        this.map.addLayer({
          id: 'gee-lst-fill',
          type: 'fill',
          source: 'gee-lst-source',
          layout: { visibility: 'visible' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'lst_celsius'],
              20, '#1e40af', // Deep blue for cool forest
              25, '#0284c7', // Sky blue
              28, '#10b981', // Green
              31, '#f59e0b', // Yellow / Warm
              34, '#ea580c', // Orange / Hot
              37, '#dc2626'  // Red / Extreme Urban Heat
            ],
            'fill-opacity': 0.65
          }
        });

        this.map.addLayer({
          id: 'gee-lst-outline',
          type: 'line',
          source: 'gee-lst-source',
          layout: { visibility: 'visible' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 0.3,
            'line-opacity': 0.4
          }
        });
      }

      // Elevation Layer (USGS SRTM in meters)
      if (!this.map.getLayer('gee-elevation-fill')) {
        this.map.addLayer({
          id: 'gee-elevation-fill',
          type: 'fill',
          source: 'gee-elevation-source',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'elevation_m'],
              0, '#006633',
              200, '#e5ffcc',
              600, '#662a00',
              1200, '#d8d8d8',
              2000, '#f5f5f5'
            ],
            'fill-opacity': 0.7
          }
        });
      }

      // Land Cover Layer (MODIS MCD12Q1)
      if (!this.map.getLayer('gee-landcover-fill')) {
        this.map.addLayer({
          id: 'gee-landcover-fill',
          type: 'fill',
          source: 'gee-landcover-source',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': [
              'match',
              ['get', 'lc_code'],
              17, '#0284c7', // Water Bodies
              13, '#e11d48', // Urban Built-up
              12, '#eab308', // Croplands
              1, '#15803d',  // Forest
              '#a3a3a3'      // Default
            ],
            'fill-opacity': 0.7
          }
        });
      }

      // POI Markers Layer (Urban vs Rural points)
      if (!this.map.getLayer('gee-poi-circles')) {
        this.map.addLayer({
          id: 'gee-poi-circles',
          type: 'circle',
          source: 'gee-poi-source',
          layout: { visibility: 'visible' },
          paint: {
            'circle-radius': 10,
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

        // Add POI labels
        this.map.addLayer({
          id: 'gee-poi-labels',
          type: 'symbol',
          source: 'gee-poi-source',
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-offset': [0, 1.4],
            'text-anchor': 'top'
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
          }
        });
      }

      // 4. Bind Click Events for Telemetry Popups
      this.bindLayerEvents();

      // 5. Fly to Greater Jakarta Area
      this.flyToStudyArea();

    } catch (err) {
      console.error('Failed loading GEE datasets:', err);
    }
  }

  private bindLayerEvents() {
    // Click POIs
    this.map.on('click', 'gee-poi-circles', (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const props = feat.properties;
      const coords = (feat.geometry as any).coordinates.slice();

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

    // Click LST grid cell
    this.map.on('click', 'gee-lst-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="gee-popup-card">
            <h4>MODIS LST Sample Cell</h4>
            <p><strong>LST Day 1km:</strong> <span class="highlight-temp">${props.lst_celsius} °C</span> (${props.lst_kelvin} K)</p>
          </div>
        `)
        .addTo(this.map);
    });

    // Change cursor on hover
    ['gee-poi-circles', 'gee-lst-fill'].forEach((layerId) => {
      this.map.on('mouseenter', layerId, () => (this.map.getCanvas().style.cursor = 'pointer'));
      this.map.on('mouseleave', layerId, () => (this.map.getCanvas().style.cursor = ''));
    });
  }

  public flyToStudyArea() {
    this.map.flyTo({
      center: [106.9, -6.35],
      zoom: 9.5,
      pitch: 35,
      bearing: -5,
      duration: 2000
    });
  }

  public toggleLayer(layerId: string, visible: boolean) {
    const visibility = visible ? 'visible' : 'none';
    if (layerId === 'lst' && this.map.getLayer('gee-lst-fill')) {
      this.map.setLayoutProperty('gee-lst-fill', 'visibility', visibility);
      this.map.setLayoutProperty('gee-lst-outline', 'visibility', visibility);
    } else if (layerId === 'elevation' && this.map.getLayer('gee-elevation-fill')) {
      this.map.setLayoutProperty('gee-elevation-fill', 'visibility', visibility);
    } else if (layerId === 'landcover' && this.map.getLayer('gee-landcover-fill')) {
      this.map.setLayoutProperty('gee-landcover-fill', 'visibility', visibility);
    } else if (layerId === 'poi' && this.map.getLayer('gee-poi-circles')) {
      this.map.setLayoutProperty('gee-poi-circles', 'visibility', visibility);
      this.map.setLayoutProperty('gee-poi-labels', 'visibility', visibility);
    }
  }
}
