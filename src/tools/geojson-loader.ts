import * as maplibregl from 'maplibre-gl';

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
        console.error('Error in layers change callback:', err);
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

  public addGeoJSONLayer(layerId: string, layerName: string, geojson: GeoJSON.FeatureCollection, color: string = '#3b82f6'): boolean {
    if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
      console.warn(`[GeoJsonLoader] GeoJSON for layer "${layerName}" is empty or invalid.`);
      return false;
    }

    // Determine primary geometry type robustly
    let primaryType: 'point' | 'line' | 'polygon' = 'point';
    for (const feat of geojson.features) {
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
      featureCount: geojson.features.length,
      data: geojson
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
      console.warn(`[GeoJsonLoader] Notice attaching layer "${item.name}":`, e);
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
          const props = e.features[0].properties;
          let content = `<div style="padding: 6px 10px; font-family: sans-serif;">`;
          content += `<h4 style="margin: 0 0 6px 0; color: #0f172a; font-weight: 700; font-size: 14px;">📍 ${props.name || 'Feature'}</h4>`;
          content += `<table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #334155;">`;
          for (const [k, v] of Object.entries(props)) {
            content += `<tr><td style="padding: 2px 4px; font-weight: 600; color: #64748b;">${k}:</td><td style="padding: 2px 4px; font-weight: 500;">${v}</td></tr>`;
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

  public getLayers(): CustomLayerItem[] {
    return Array.from(this.customLayers.values());
  }
}
