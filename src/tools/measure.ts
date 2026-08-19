import * as maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';

export type MeasureMode = 'none' | 'distance' | 'area';

export class MeasureTool {
  private map: maplibregl.Map;
  private mode: MeasureMode = 'none';
  private points: [number, number][] = [];
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

    this.map.on('style.load', () => {
      this.initLayers();
      if (this.geojson.features.length > 0) {
        const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(this.geojson);
        }
      }
    });
  }

  private initLayers() {
    if (!this.map) return;
    if (typeof this.map.isStyleLoaded === 'function' && !this.map.isStyleLoaded()) {
      return;
    }

    try {
      if (!this.map.getSource('measure-source')) {
        this.map.addSource('measure-source', {
          type: 'geojson',
          data: this.geojson
        });
      }

      // Fill layer for Area measurement
      if (!this.map.getLayer('measure-fill')) {
        this.map.addLayer({
          id: 'measure-fill',
          type: 'fill',
          source: 'measure-source',
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': '#00f0ff',
            'fill-opacity': 0.25
          }
        });
      }

      // Line layer for Distance and Area outline
      if (!this.map.getLayer('measure-line')) {
        this.map.addLayer({
          id: 'measure-line',
          type: 'line',
          source: 'measure-source',
          filter: ['in', '$type', 'LineString', 'Polygon'],
          paint: {
            'line-color': '#00f0ff',
            'line-width': 3,
            'line-dasharray': [2, 2]
          }
        });
      }

      // Point layer for Vertices
      if (!this.map.getLayer('measure-points')) {
        this.map.addLayer({
          id: 'measure-points',
          type: 'circle',
          source: 'measure-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#00f0ff'
          }
        });
      }
    } catch (e) {
      console.warn('Notice initializing MeasureTool layers:', e);
    }
  }

  private bindEvents() {
    this.map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      this.initLayers();
      this.addPoint([e.lngLat.lng, e.lngLat.lat]);
    });

    this.map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none' || this.points.length === 0) return;
      this.updateTempDraw([e.lngLat.lng, e.lngLat.lat]);
    });

    this.map.on('contextmenu', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      e.preventDefault();
      this.finishMeasurement();
    });
  }

  public setMode(mode: MeasureMode) {
    this.mode = mode;
    this.initLayers();
    this.clear();
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
    this.initLayers();
    this.points.push(coord);
    this.renderFeatures(this.points);
  }

  private updateTempDraw(currentHover: [number, number]) {
    const tempPoints = [...this.points, currentHover];
    this.renderFeatures(tempPoints);
    this.updateTooltip(currentHover, tempPoints);
  }

  private finishMeasurement() {
    if (this.points.length > 0) {
      this.renderFeatures(this.points, true);
    }
  }

  public clear() {
    this.points = [];
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

    // Points
    coords.forEach((c) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: {}
      });
    });

    if (this.mode === 'distance' && coords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {}
      });
    } else if (this.mode === 'area' && coords.length >= 3) {
      const closedCoords = [...coords, coords[0]];
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [closedCoords] },
        properties: {}
      });
    }

    this.geojson = { type: 'FeatureCollection', features };
    const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(this.geojson);
    }
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
      text = 'Click map to start measuring...';
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
      .setHTML(`<div style="padding: 4px 8px; font-weight: 600; font-size: 12px; color: #1e293b;">${text}</div>`)
      .addTo(this.map);

    if (this.onResultCallback) {
      this.onResultCallback({ text, mode: this.mode });
    }
  }

  public onResult(callback: (result: { text: string; mode: MeasureMode }) => void) {
    this.onResultCallback = callback;
  }
}
