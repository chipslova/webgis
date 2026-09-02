import * as maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';

export type MeasureMode = 'none' | 'distance' | 'area';

export class MeasureTool {
  private map: maplibregl.Map;
  private mode: MeasureMode = 'none';
  private points: [number, number][] = [];
  private isFinished: boolean = false;
  private geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  private tooltip: maplibregl.Popup | null = null;
  private onResultCallback?: (result: { text: string; mode: MeasureMode }) => void;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.initLayers();
    this.bindEvents();
    // NOTE: style.load listener centralized in MapManager.onStyleReady()
  }

  public initLayers() {
    if (!this.map) return;
    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.initLayers());
      return;
    }

    try {
      if (!this.map.getSource('measure-source')) {
        this.map.addSource('measure-source', {
          type: 'geojson',
          data: this.geojson
        });
      }

      // 1. Fill layer for Area measurement (natively renders Polygon features)
      if (!this.map.getLayer('measure-fill')) {
        this.map.addLayer({
          id: 'measure-fill',
          type: 'fill',
          source: 'measure-source',
          paint: {
            'fill-color': '#00f0ff',
            'fill-opacity': 0.25
          }
        });
      }

      // 2a. Dark casing for satellite contrast
      if (!this.map.getLayer('measure-line-casing')) {
        this.map.addLayer({
          id: 'measure-line-casing',
          type: 'line',
          source: 'measure-source',
          paint: {
            'line-color': '#0f172a',
            'line-width': 7,
            'line-opacity': 0.6
          }
        });
      }

      // 2b. Line layer for Distance path and Area perimeter (natively renders LineString & Polygon outlines)
      if (!this.map.getLayer('measure-line')) {
        this.map.addLayer({
          id: 'measure-line',
          type: 'line',
          source: 'measure-source',
          paint: {
            'line-color': '#00f0ff',
            'line-width': 4,
            'line-dasharray': [2, 2]
          }
        });
      }

      // 3. Point layer for Vertices (natively renders Point features)
      if (!this.map.getLayer('measure-points')) {
        this.map.addLayer({
          id: 'measure-points',
          type: 'circle',
          source: 'measure-source',
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffffff',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#00f0ff'
          }
        });
      }
    } catch (e) {
      console.warn('Notice initializing MeasureTool layers:', e);
    }
  }

  /** Called centrally by MapManager after style.load — re-creates source/layers and restores data. */
  public restoreAfterStyleChange() {
    this.initLayers();
    if (this.geojson.features.length > 0) {
      const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(this.geojson);
      }
    }
  }

  private bindEvents() {
    this.map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      this.initLayers();
      this.addPoint([e.lngLat.lng, e.lngLat.lat]);
    });

    this.map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none' || this.points.length === 0 || this.isFinished) return;
      this.updateTempDraw([e.lngLat.lng, e.lngLat.lat]);
    });

    this.map.on('contextmenu', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      e.preventDefault();
      this.finishMeasurement();
    });

    // Keyboard support: Escape cancels measuring
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.mode !== 'none') {
        this.setMode('none');
        this.clear();
      }
    });
  }

  public setMode(mode: MeasureMode) {
    this.mode = mode;
    this.isFinished = false;
    this.clear();
    this.initLayers();
    if (mode === 'none') {
      this.map.getCanvas().style.cursor = '';
      if (this.tooltip) this.tooltip.remove();
    } else {
      this.map.getCanvas().style.cursor = 'crosshair';
    }
  }

  public getMode(): MeasureMode {
    return this.mode;
  }

  private addPoint(coord: [number, number]) {
    if (this.isFinished) {
      this.clear();
      this.isFinished = false;
    }
    this.initLayers();
    this.points.push(coord);
    this.renderFeatures(this.points);
    this.updateTooltip(coord, this.points);
  }

  private updateTempDraw(currentHover: [number, number]) {
    const tempPoints = [...this.points, currentHover];
    this.renderFeatures(tempPoints);
    this.updateTooltip(currentHover, tempPoints);
  }

  private finishMeasurement() {
    if (this.points.length > 0) {
      this.isFinished = true;
      this.renderFeatures(this.points, true);
      const lastPoint = this.points[this.points.length - 1];
      this.updateTooltip(lastPoint, this.points);
    }
  }

  public clear() {
    this.points = [];
    this.isFinished = false;
    this.geojson = { type: 'FeatureCollection', features: [] };
    this.initLayers();
    const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(this.geojson);
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    if (this.onResultCallback) {
      this.onResultCallback({ text: '0', mode: this.mode });
    }
  }

  private renderFeatures(coords: [number, number][], _isFinal: boolean = false) {
    this.initLayers();
    const features: GeoJSON.Feature[] = [];

    // Add vertex point features
    coords.forEach((c) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: {}
      });
    });

    if (this.mode === 'distance') {
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        });
      }
    } else if (this.mode === 'area') {
      if (coords.length === 2) {
        // Show line segment while user is drawing first 2 points
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        });
      } else if (coords.length >= 3) {
        const closedCoords = [...coords, coords[0]];
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [closedCoords] },
          properties: {}
        });
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: closedCoords },
          properties: {}
        });
      }
    }

    this.geojson = { type: 'FeatureCollection', features };
    const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(this.geojson);
    }
    // NOTE: Layer ordering is handled centrally by MapManager.bringCustomLayersToTop()
  }

  private updateTooltip(position: [number, number], coords: [number, number][]) {
    let text = '';

    if (this.mode === 'distance' && coords.length >= 2) {
      const line = turf.lineString(coords);
      const lengthKm = turf.length(line, { units: 'kilometers' });
      text = lengthKm >= 1 ? `${lengthKm.toFixed(2)} km` : `${(lengthKm * 1000).toFixed(0)} m`;
    } else if (this.mode === 'area' && coords.length >= 3) {
      const polygon = turf.polygon([[...coords, coords[0]]]);
      const areaSqM = turf.area(polygon);
      if (areaSqM >= 1000000) {
        text = `${(areaSqM / 1000000).toFixed(2)} km²`;
      } else if (areaSqM >= 10000) {
        text = `${(areaSqM / 10000).toFixed(2)} ha`;
      } else {
        text = `${areaSqM.toFixed(0)} m²`;
      }
    } else {
      text = 'Click map to measure (Right-click to finish)';
    }

    if (!this.tooltip) {
      this.tooltip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'measure-tooltip'
      });
    }

    this.tooltip
      .setLngLat(position)
      .setHTML(`<div style="padding: 6px 10px; font-weight: 600; font-size: 12px; color: #0f172a; background: white; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">${text}</div>`)
      .addTo(this.map);

    if (this.onResultCallback) {
      this.onResultCallback({ text, mode: this.mode });
    }
  }

  public onResult(callback: (result: { text: string; mode: MeasureMode }) => void) {
    this.onResultCallback = callback;
  }

  public getAllMapLayerIds(): string[] {
    return [
      'measure-fill',
      'measure-line-casing',
      'measure-line',
      'measure-points'
    ];
  }

  public hasActiveMeasurement(): boolean {
    return this.geojson.features.length > 0 || this.points.length > 0;
  }
}
