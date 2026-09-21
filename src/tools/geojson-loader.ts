import * as maplibregl from 'maplibre-gl';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import { parseKMLToGeoJSON } from '../utils/kml-parser';
import { parseCSVToGeoJSON } from '../utils/csv-parser';

export interface CustomLayerItem {
  id: string;
  name: string;
  type: 'point' | 'line' | 'polygon';
  visible: boolean;
  color: string;
  opacity?: number;
  featureCount: number;
  data: GeoJSON.FeatureCollection;
}

export class GeoJsonLoader {
  private map: maplibregl.Map;
  private customLayers: Map<string, CustomLayerItem> = new Map();
  private onLayersChangeCallbacks: Array<() => void> = [];

  constructor(map: maplibregl.Map) {
    this.map = map;
    // NOTE: style.load listener centralized in MapManager.onStyleReady()
  }

  public onLayersChange(callback: () => void) {
    this.onLayersChangeCallbacks.push(callback);
  }

  private notifyLayersChange() {
    this.onLayersChangeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        logger.error('Error in layers change callback:', err);
      }
    });
  }

  public setLayerOpacity(layerId: string, opacity: number) {
    const item = this.customLayers.get(layerId);
    if (!item || !this.map) return;
    item.opacity = opacity;

    const fillId = `layer-fill-${layerId}`;
    const lineId = `layer-line-${layerId}`;
    const pointId = `layer-point-${layerId}`;

    if (this.map.getLayer(fillId)) {
      this.map.setPaintProperty(fillId, 'fill-opacity', opacity * 0.5);
    }
    if (this.map.getLayer(lineId)) {
      this.map.setPaintProperty(lineId, 'line-opacity', opacity);
    }
    if (this.map.getLayer(pointId)) {
      this.map.setPaintProperty(pointId, 'circle-opacity', opacity);
      this.map.setPaintProperty(pointId, 'circle-stroke-opacity', opacity);
    }
    this.notifyLayersChange();
  }

  public loadSampleData() {
    const sampleCitiesGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [106.8456, -6.2088] },
          properties: { name: 'Jakarta', category: 'Capital City', population: '10.5M', province: 'DKI Jakarta' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [112.7521, -7.2575] },
          properties: { name: 'Surabaya', category: 'Metropolis', population: '2.9M', province: 'East Java' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [107.6191, -6.9175] },
          properties: { name: 'Bandung', category: 'Metropolis', population: '2.5M', province: 'West Java' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [98.6722, 3.5952] },
          properties: { name: 'Medan', category: 'Metropolis', population: '2.4M', province: 'North Sumatra' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [119.4327, -5.1477] },
          properties: { name: 'Makassar', category: 'Metropolis', population: '1.5M', province: 'South Sulawesi' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [115.2167, -8.65] },
          properties: { name: 'Denpasar', category: 'Tourism Hub', population: '0.9M', province: 'Bali' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [116.8312, -1.2379] },
          properties: { name: 'Balikpapan', category: 'Energy & Port City', population: '0.7M', province: 'East Kalimantan' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [116.9856, -0.9625] },
          properties: { name: 'IKN Nusantara', category: 'Future Capital City', population: 'Developing', province: 'East Kalimantan' }
        }
      ]
    };

    return this.addGeoJSONLayer('sample-indonesia-cities', 'Major Cities of Indonesia', sampleCitiesGeoJSON, '#f59e0b');
  }

  /**
   * Normalizes raw GeoJSON structures (single Feature, Feature arrays, raw Geometry)
   * and strictly validates WGS84 coordinates.
   */
  public static normalizeAndValidate(raw: any): { valid: boolean; data?: GeoJSON.FeatureCollection; error?: string } {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'File bukan objek JSON/GeoJSON yang valid.' };
    }

    let fc: GeoJSON.FeatureCollection;

    if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
      fc = raw as GeoJSON.FeatureCollection;
    } else if (raw.type === 'Feature' && raw.geometry) {
      fc = { type: 'FeatureCollection', features: [raw] };
    } else if (Array.isArray(raw)) {
      // Array of features
      fc = { type: 'FeatureCollection', features: raw.filter((f: any) => f && f.geometry) };
    } else if (raw.type && ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(raw.type)) {
      fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: raw, properties: {} }] };
    } else if (Array.isArray(raw.features)) {
      fc = { type: 'FeatureCollection', features: raw.features };
    } else {
      return { valid: false, error: 'Data format is not recognized as GeoJSON (FeatureCollection or Feature).' };
    }

    if (!fc.features || fc.features.length === 0) {
      return { valid: false, error: 'GeoJSON has no feature objects (features empty).' };
    }

    // Validate coordinates bounds (prevent out-of-bounds UTM projection issues)
    let outOfBounds = false;

    const checkCoord = (c: any): boolean => {
      if (Array.isArray(c)) {
        if (typeof c[0] === 'number' && typeof c[1] === 'number') {
          const [lon, lat] = c;
          if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
            outOfBounds = true;
            return false;
          }
          return true;
        } else {
          for (const sub of c) {
            if (!checkCoord(sub)) return false;
          }
        }
      }
      return true;
    };

    for (const feat of fc.features) {
      if (feat && feat.geometry && (feat.geometry as any).coordinates) {
        checkCoord((feat.geometry as any).coordinates);
        if (outOfBounds) break;
      }
    }

    if (outOfBounds) {
      return {
        valid: false,
        error: 'Coordinates exceed WGS84 geographic bounds (longitude [-180, 180] / latitude [-90, 90]). Ensure data does not use planar UTM meter coordinates.'
      };
    }

    return { valid: true, data: fc };
  }

  public addGeoJSONLayer(layerId: string, layerName: string, geojson: any, color: string = '#3b82f6'): boolean {
    const validated = GeoJsonLoader.normalizeAndValidate(geojson);
    if (!validated.valid || !validated.data) {
      logger.warn(`[GeoJsonLoader] GeoJSON for layer "${layerName}" is invalid: ${validated.error}`);
      return false;
    }

    const cleanGeoJSON = validated.data;

    // Determine primary geometry type robustly
    let primaryType: 'point' | 'line' | 'polygon' = 'point';
    for (const feat of cleanGeoJSON.features) {
      if (!feat || !feat.geometry) continue;
      const t = feat.geometry.type;
      if (t.includes('Polygon')) {
        primaryType = 'polygon';
        break;
      }
      if (t.includes('Line')) {
        primaryType = 'line';
      }
    }

    // Register in state map so sidebar UI stays accurate immediately
    this.customLayers.set(layerId, {
      id: layerId,
      name: layerName,
      type: primaryType,
      visible: true,
      color,
      featureCount: cleanGeoJSON.features.length,
      data: cleanGeoJSON
    });

    this.attachLayerToMap(layerId);
    this.notifyLayersChange();
    return true;
  }

  public attachLayerToMap(layerId: string) {
    const item = this.customLayers.get(layerId);
    if (!item) return;

    // If map style object is not initialized yet, wait for style.load
    if (!this.map || !this.map.getStyle()) {
      this.map.once('style.load', () => this.attachLayerToMap(layerId));
      return;
    }

    const sourceId = `source-${layerId}`;
    const fillLayerId = `layer-fill-${layerId}`;
    const lineLayerId = `layer-line-${layerId}`;
    const pointLayerId = `layer-point-${layerId}`;
    const visibility = item.visible ? 'visible' : 'none';

    try {
      if (!this.map.getSource(sourceId)) {
        this.map.addSource(sourceId, {
          type: 'geojson',
          data: item.data
        });
      } else {
        const src = this.map.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (src && typeof src.setData === 'function') {
          src.setData(item.data);
        }
      }

      if (item.type === 'polygon') {
        if (!this.map.getLayer(fillLayerId)) {
          this.map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility },
            paint: {
              'fill-color': item.color,
              'fill-opacity': 0.5
            }
          });
        }
        if (!this.map.getLayer(lineLayerId)) {
          this.map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            layout: { visibility },
            paint: {
              'line-color': item.color,
              'line-width': 2
            }
          });
        }
      } else if (item.type === 'line') {
        if (!this.map.getLayer(lineLayerId)) {
          this.map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            layout: { visibility },
            paint: {
              'line-color': item.color,
              'line-width': 3
            }
          });
        }
      } else {
        if (!this.map.getLayer(pointLayerId)) {
          this.map.addLayer({
            id: pointLayerId,
            type: 'circle',
            source: sourceId,
            layout: { visibility },
            paint: {
              'circle-radius': 9,
              'circle-color': item.color,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 1,
              'circle-stroke-opacity': 1
            }
          });
        }
      }

      // NOTE: Layer ordering is handled centrally by MapManager.bringCustomLayersToTop()
      this.bindClickPopup(layerId);
    } catch (e) {
      ErrorHandler.getInstance().showThrottledError(`Failed to load geospatial layer "${item.name}".`);
      logger.warn(`[GeoJsonLoader] Notice attaching layer "${item.name}":`, e);
    }
  }

  private bindClickPopup(layerId: string) {
    const fillId = `layer-fill-${layerId}`;
    const lineId = `layer-line-${layerId}`;
    const pointId = `layer-point-${layerId}`;
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '320px' });

    [pointId, fillId, lineId].forEach((lid) => {
      if (this.map.getLayer(lid)) {
        this.map.off('click', lid, (this as any)[`_popupClick_${lid}`]);
        const clickHandler = (e: any) => {
          if (!e.features || e.features.length === 0) return;
          const props = e.features[0].properties || {};
          let content = `<div class="gee-popup-card">`;
          content += `<h4>📍 ${props.name || props.title || 'Geospatial Feature'}</h4>`;
          content += `<table class="gee-popup-table">`;
          for (const [k, v] of Object.entries(props)) {
            content += `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`;
          }
          content += `</table></div>`;
          popup.setLngLat(e.lngLat).setHTML(content).addTo(this.map);
        };
        (this as any)[`_popupClick_${lid}`] = clickHandler;
        this.map.on('click', lid, clickHandler);

        this.map.on('mouseenter', lid, () => {
          this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', lid, () => {
          this.map.getCanvas().style.cursor = '';
        });
      }
    });
  }

  /** Returns all MapLibre layer IDs owned by this loader (for MapManager's ordering sweep). */
  public getAllMapLayerIds(): string[] {
    const ids: string[] = [];
    this.customLayers.forEach((item) => {
      ids.push(`layer-fill-${item.id}`, `layer-line-${item.id}`, `layer-point-${item.id}`);
    });
    return ids;
  }

  public reattachLayersIfNeeded() {
    this.customLayers.forEach((layer) => {
      this.attachLayerToMap(layer.id);
      this.toggleLayerVisibility(layer.id, layer.visible);
    });
    this.notifyLayersChange();
  }

  public toggleLayerVisibility(layerId: string, visible: boolean) {
    const item = this.customLayers.get(layerId);
    if (!item) return;

    item.visible = visible;
    const visibility = visible ? 'visible' : 'none';

    const sourceId = `source-${layerId}`;
    if (!this.map.getSource(sourceId)) {
      this.attachLayerToMap(layerId);
    }

    [`layer-fill-${layerId}`, `layer-line-${layerId}`, `layer-point-${layerId}`].forEach((id) => {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', visibility);
      }
    });
    // NOTE: Layer ordering is handled centrally by MapManager.bringCustomLayersToTop()
  }

  public zoomToLayer(layerId: string) {
    const item = this.customLayers.get(layerId);
    if (!item || !item.data.features || item.data.features.length === 0) return;

    const coords: [number, number][] = [];
    item.data.features.forEach((feat: any) => {
      if (feat.geometry.type === 'Point') {
        coords.push(feat.geometry.coordinates);
      } else if (feat.geometry.type === 'Polygon') {
        feat.geometry.coordinates[0]?.forEach((c: [number, number]) => coords.push(c));
      } else if (feat.geometry.type === 'LineString') {
        feat.geometry.coordinates.forEach((c: [number, number]) => coords.push(c));
      }
    });

    if (coords.length === 0) return;

    let minX = coords[0][0], maxX = coords[0][0], minY = coords[0][1], maxY = coords[0][1];
    coords.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    if (coords.length === 1 || (minX === maxX && minY === maxY)) {
      this.map.flyTo({ center: [minX, minY], zoom: 12, duration: 1500 });
    } else {
      this.map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 80, duration: 1500 });
    }
  }

  public removeLayer(layerId: string) {
    const item = this.customLayers.get(layerId);
    if (!item) return;

    [`layer-fill-${layerId}`, `layer-line-${layerId}`, `layer-point-${layerId}`].forEach((id) => {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    });

    const sourceId = `source-${layerId}`;
    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId);
    }

    this.customLayers.delete(layerId);
    this.notifyLayersChange();
  }

  public clearAllLayers() {
    const ids = Array.from(this.customLayers.keys());
    ids.forEach((id) => this.removeLayer(id));
  }

  public getLayers(): CustomLayerItem[] {
    return Array.from(this.customLayers.values());
  }

  public getLayer(layerId: string): CustomLayerItem | undefined {
    return this.customLayers.get(layerId);
  }

  /**
   * Exports a loaded vector layer as a downloadable GeoJSON file
   */
  public exportLayerGeoJSON(layerId: string): boolean {
    const item = this.customLayers.get(layerId);
    if (!item || !item.data) return false;

    try {
      const jsonStr = JSON.stringify(item.data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const safeName = (item.name || 'custom-layer').toLowerCase().replace(/[^a-z0-9]/g, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}-${Date.now()}.geojson`;
      link.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      logger.error('Failed to export layer GeoJSON:', err);
      return false;
    }
  }

  /**
   * Exports a loaded vector layer as a downloadable KML file
   */
  public exportLayerKML(layerId: string): boolean {
    const item = this.customLayers.get(layerId);
    if (!item || !item.data) return false;

    try {
      import('../utils/kml-exporter').then(({ geoJsonToKml, downloadKml }) => {
        const kmlString = geoJsonToKml(item.data, item.name || 'Custom Layer');
        const safeName = (item.name || 'custom-layer').toLowerCase().replace(/[^a-z0-9]/g, '_');
        downloadKml(kmlString, `${safeName}-${Date.now()}.kml`);
      });
      return true;
    } catch (err) {
      logger.error('Failed to export layer KML:', err);
      return false;
    }
  }

  /**
   * Loads a vector layer from string content (supports GeoJSON, OGC KML 2.2, and Spatial CSV/TSV)
   */
  public loadFromFileText(
    fileName: string,
    content: string,
    color?: string
  ): { success: boolean; layerId?: string; error?: string; featureCount?: number; detectedColumns?: any } {
    const isKML = fileName.toLowerCase().endsWith('.kml') || content.trim().startsWith('<?xml') || content.includes('<kml');
    const isCSV = fileName.toLowerCase().endsWith('.csv') || fileName.toLowerCase().endsWith('.tsv') || fileName.toLowerCase().endsWith('.txt');
    const layerName = fileName.replace(/\.[^/.]+$/, '').trim() || 'Layer Spasial';
    const layerId = `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const layerColor = color || '#3b82f6';

    try {
      let geojson: GeoJSON.FeatureCollection;
      let detectedCols: any = undefined;

      if (isKML) {
        geojson = parseKMLToGeoJSON(content);
      } else if (isCSV) {
        const csvRes = parseCSVToGeoJSON(content);
        if (!csvRes.success || !csvRes.data) {
          return { success: false, error: csvRes.error || 'Failed to process CSV file' };
        }
        geojson = csvRes.data;
        detectedCols = csvRes.detectedColumns;
      } else {
        geojson = JSON.parse(content);
      }

      const added = this.addGeoJSONLayer(layerId, layerName, geojson, layerColor);
      if (!added) {
        return { success: false, error: 'Invalid spatial data format or coordinates out of bounds.' };
      }

      const item = this.customLayers.get(layerId);
      return {
        success: true,
        layerId,
        featureCount: item?.featureCount || 0,
        detectedColumns: detectedCols
      };
    } catch (err: any) {
      logger.error('[GeoJsonLoader] Error parsing file content:', err);
      return {
        success: false,
        error: `Failed to read file: ${err?.message || 'Unrecognized format'}`
      };
    }
  }

  /**
   * Creates a geodesic proximity buffer around an existing custom layer (lazily loaded)
   * with optional spatial intersection against an overlay target layer.
   */
  public async createBufferForLayer(
    sourceLayerId: string,
    radius: number,
    units: 'meters' | 'kilometers' | 'miles' = 'kilometers',
    overlayLayerId?: string
  ): Promise<{
    success: boolean;
    bufferLayerId?: string;
    error?: string;
    areaKm2?: number;
    warning?: string;
    intersection?: import('./spatial-buffer').BufferIntersectionResult;
  }> {
    const sourceItem = this.customLayers.get(sourceLayerId);
    if (!sourceItem || !sourceItem.data) {
      return { success: false, error: 'Lapisan target sumber tidak ditemukan.' };
    }

    let overlayGeoJSON: GeoJSON.FeatureCollection | undefined;
    let overlayLayerName: string | undefined;

    if (overlayLayerId) {
      const overlayItem = this.customLayers.get(overlayLayerId);
      if (overlayItem && overlayItem.data) {
        overlayGeoJSON = overlayItem.data;
        overlayLayerName = overlayItem.name;
      }
    }

    try {
      const { SpatialBufferAnalyzer } = await import('./spatial-buffer');
      const bufferRes = SpatialBufferAnalyzer.createBuffer(sourceItem.data, {
        radius,
        units,
        overlayGeoJSON,
        overlayLayerName
      });

      if (!bufferRes.success || !bufferRes.data) {
        return { success: false, error: bufferRes.error || 'Gagal menghitung zona penyangga.' };
      }

      const bufferLayerId = `buffer-${Date.now()}`;
      const bufferLayerName = `Buffer (${radius} ${units}) - ${sourceItem.name}`;
      const bufferColor = '#a855f7'; // Distinctive purple-violet for buffer zones

      const added = this.addGeoJSONLayer(bufferLayerId, bufferLayerName, bufferRes.data, bufferColor);
      if (!added) {
        return { success: false, error: 'Gagal menambahkan layer buffer ke peta.' };
      }

      // Set gentle fill opacity for buffer zones
      this.setLayerOpacity(bufferLayerId, 0.45);
      this.notifyLayersChange();

      return {
        success: true,
        bufferLayerId,
        areaKm2: bufferRes.areaKm2,
        warning: bufferRes.warning,
        intersection: bufferRes.intersection
      };
    } catch (err: any) {
      logger.error('Failed to dynamically load spatial buffer analyzer:', err);
      return { success: false, error: 'Gagal memuat modul analisis buffer.' };
    }
  }

  /**
   * Removes all generated buffer layers from the map and custom layer registry
   */
  public removeBufferLayers(): number {
    const bufferLayerIds: string[] = [];
    this.customLayers.forEach((_, id) => {
      if (id.startsWith('buffer-')) {
        bufferLayerIds.push(id);
      }
    });

    bufferLayerIds.forEach((id) => {
      this.removeLayer(id);
    });

    if (bufferLayerIds.length > 0) {
      this.notifyLayersChange();
    }

    return bufferLayerIds.length;
  }
}


