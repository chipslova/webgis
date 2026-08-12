import * as maplibregl from 'maplibre-gl';

export interface CustomLayerItem {
  id: string;
  name: string;
  type: 'point' | 'line' | 'polygon';
  visible: boolean;
  color: string;
  featureCount: number;
}

export class GeoJsonLoader {
  private map: maplibregl.Map;
  private customLayers: Map<string, CustomLayerItem> = new Map();

  constructor(map: maplibregl.Map) {
    this.map = map;
  }

  public async loadSampleData() {
    // Add sample Indonesia Major Cities vector points
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

    this.addGeoJSONLayer('sample-indonesia-cities', 'Major Cities of Indonesia', sampleCitiesGeoJSON, '#f59e0b');
  }

  public addGeoJSONLayer(layerId: string, layerName: string, geojson: GeoJSON.FeatureCollection, color: string = '#3b82f6') {
    if (!geojson.features || geojson.features.length === 0) return;

    const sourceId = `source-${layerId}`;
    const fillLayerId = `layer-fill-${layerId}`;
    const lineLayerId = `layer-line-${layerId}`;
    const pointLayerId = `layer-point-${layerId}`;

    if (this.map.getSource(sourceId)) {
      (this.map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
      return;
    }

    this.map.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });

    const firstFeatureType = geojson.features[0].geometry.type;
    let primaryType: 'point' | 'line' | 'polygon' = 'point';

    if (firstFeatureType.includes('Polygon')) {
      primaryType = 'polygon';
      this.map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': color,
          'fill-opacity': 0.4
        }
      });
      this.map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': 2
        }
      });
    } else if (firstFeatureType.includes('Line')) {
      primaryType = 'line';
      this.map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': 3
        }
      });
    } else {
      primaryType = 'point';
      this.map.addLayer({
        id: pointLayerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 8,
          'circle-color': color,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
    }

    this.customLayers.set(layerId, {
      id: layerId,
      name: layerName,
      type: primaryType,
      visible: true,
      color,
      featureCount: geojson.features.length
    });
  }

  public toggleLayerVisibility(layerId: string, visible: boolean) {
    const item = this.customLayers.get(layerId);
    if (!item) return;

    item.visible = visible;
    const visibility = visible ? 'visible' : 'none';

    [`layer-fill-${layerId}`, `layer-line-${layerId}`, `layer-point-${layerId}`].forEach((id) => {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', visibility);
      }
    });
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
  }

  public getLayers(): CustomLayerItem[] {
    return Array.from(this.customLayers.values());
  }
}
