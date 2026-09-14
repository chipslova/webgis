// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseKMLToGeoJSON } from '../src/utils/kml-parser';
import { SpatialBufferAnalyzer } from '../src/tools/spatial-buffer';
import { GeoJsonLoader } from '../src/tools/geojson-loader';

describe('OGC KML 2.2 Parser & Import', () => {
  it('should parse Point Placemarks with name and ExtendedData', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Titik Pantau</name>
    <Placemark>
      <name>Stasiun BMKG Jakarta</name>
      <description>Stasiun Meteorologi Pusat</description>
      <ExtendedData>
        <Data name="altitude_m"><value>15</value></Data>
        <Data name="sensor_type"><value>AWS Vaisala</value></Data>
      </ExtendedData>
      <Point>
        <coordinates>106.8272,-6.1754,15</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

    const geojson = parseKMLToGeoJSON(kml);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBe(1);

    const feat = geojson.features[0];
    expect(feat.geometry.type).toBe('Point');
    expect((feat.geometry as GeoJSON.Point).coordinates[0]).toBeCloseTo(106.8272);
    expect((feat.geometry as GeoJSON.Point).coordinates[1]).toBeCloseTo(-6.1754);
    expect(feat.properties?.name).toBe('Stasiun BMKG Jakarta');
    expect(feat.properties?.description).toBe('Stasiun Meteorologi Pusat');
    expect(feat.properties?.altitude_m).toBe('15');
    expect(feat.properties?.sensor_type).toBe('AWS Vaisala');
  });

  it('should parse LineString Placemarks correctly', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Jalur Transjakarta Koridor 1</name>
      <LineString>
        <coordinates>
          106.82,-6.17,0
          106.83,-6.19,0
          106.84,-6.21,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

    const geojson = parseKMLToGeoJSON(kml);
    expect(geojson.features.length).toBe(1);
    const feat = geojson.features[0];
    expect(feat.geometry.type).toBe('LineString');
    const coords = (feat.geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBe(3);
    expect(coords[0][0]).toBeCloseTo(106.82);
    expect(coords[2][1]).toBeCloseTo(-6.21);
  });

  it('should parse Polygon Placemarks with closed outer ring', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Kawasan Monas</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              106.82,-6.17,0 106.83,-6.17,0 106.83,-6.18,0 106.82,-6.18,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

    const geojson = parseKMLToGeoJSON(kml);
    expect(geojson.features.length).toBe(1);
    const feat = geojson.features[0];
    expect(feat.geometry.type).toBe('Polygon');
    const polyCoords = (feat.geometry as GeoJSON.Polygon).coordinates[0];
    expect(polyCoords.length).toBe(5); // Auto-closed 4-coord list to 5
    expect(polyCoords[0]).toEqual(polyCoords[4]);
  });

  it('should throw error on malformed/invalid XML', () => {
    const malformed = `<kml><Document><Placemark><name>Broken</Placemark></Document>`;
    expect(() => parseKMLToGeoJSON(malformed)).toThrow();
  });
});

describe('Spatial Proximity Buffer Analyzer (Turf.js)', () => {
  const samplePointFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Pusat Gempa' },
        geometry: {
          type: 'Point',
          coordinates: [106.8272, -6.1754]
        }
      }
    ]
  };

  it('should generate a 5 km geodesic buffer polygon with correct metadata and area', () => {
    const result = SpatialBufferAnalyzer.createBuffer(samplePointFC, {
      radius: 5,
      units: 'kilometers'
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.features.length).toBe(1);

    const bufferFeature = result.data!.features[0];
    expect(bufferFeature.geometry.type).toBe('Polygon');
    expect(bufferFeature.properties?.buffer_source).toBe('Pusat Gempa');
    expect(bufferFeature.properties?.buffer_radius).toBe('5 kilometers');
    expect(bufferFeature.properties?.buffer_area_km2).toBeGreaterThan(70); // π * r² = ~78.5 km²
    expect(bufferFeature.properties?.buffer_area_km2).toBeLessThan(85);
    expect(result.areaKm2).toBeCloseTo(bufferFeature.properties?.buffer_area_km2, 1);
  });

  it('should generate buffer in meters correctly', () => {
    const result = SpatialBufferAnalyzer.createBuffer(samplePointFC, {
      radius: 500,
      units: 'meters'
    });

    expect(result.success).toBe(true);
    const bufferFeature = result.data!.features[0];
    expect(bufferFeature.properties?.buffer_radius).toBe('500 meters');
    // 500m radius area ~ 0.785 km²
    expect(bufferFeature.properties?.buffer_area_km2).toBeGreaterThan(0.7);
    expect(bufferFeature.properties?.buffer_area_km2).toBeLessThan(0.9);
  });

  it('should return failure if given empty FeatureCollection', () => {
    const emptyFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };

    const result = SpatialBufferAnalyzer.createBuffer(emptyFC, { radius: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('tidak memiliki fitur yang valid');
  });
});

describe('GeoJsonLoader File Import & Buffer Workflow', () => {
  const createMockMap = () =>
    ({
      getSource: () => null,
      addSource: () => {},
      getLayer: () => null,
      addLayer: () => {},
      removeLayer: () => {},
      removeSource: () => {},
      setPaintProperty: () => {},
      setLayoutProperty: () => {},
      on: () => {},
      off: () => {},
      setFilter: () => {},
      flyTo: () => {},
      fitBounds: () => {},
      loaded: () => true,
      isMoving: () => false,
      getStyle: () => ({ layers: [] }),
      getCanvasContainer: () => document.createElement('div')
    } as any);

  it('should load GeoJSON string correctly via loadFromFileText', () => {
    const mockMap = createMockMap();
    const loader = new GeoJsonLoader(mockMap);
    const jsonString = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Test Geo' },
          geometry: { type: 'Point', coordinates: [100, 0] }
        }
      ]
    });

    const res = loader.loadFromFileText('test_data.geojson', jsonString);
    expect(res.success).toBe(true);
    expect(res.layerId).toBeDefined();
    expect(res.featureCount).toBe(1);

    const layer = loader.getLayer(res.layerId!);
    expect(layer).toBeDefined();
    expect(layer?.name).toBe('test_data');
    expect(layer?.type).toBe('point');
  });

  it('should load KML string correctly via loadFromFileText and generate a buffer', () => {
    const mockMap = createMockMap();
    const loader = new GeoJsonLoader(mockMap);
    const kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>KML Sample Point</name>
      <Point>
        <coordinates>110.36,-7.79,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

    const res = loader.loadFromFileText('jogja_monument.kml', kmlString);
    expect(res.success).toBe(true);
    expect(res.layerId).toBeDefined();
    expect(res.featureCount).toBe(1);

    const layer = loader.getLayer(res.layerId!);
    expect(layer).toBeDefined();
    expect(layer?.name).toBe('jogja_monument');
    expect(layer?.type).toBe('point');

    // Test buffer generation from this loaded layer
    const bufRes = loader.createBufferForLayer(res.layerId!, 2, 'kilometers');
    expect(bufRes.success).toBe(true);
    expect(bufRes.bufferLayerId).toBeDefined();
    expect(bufRes.areaKm2).toBeGreaterThan(10); // ~12.56 km²
    expect(bufRes.areaKm2).toBeLessThan(15);

    const bufLayer = loader.getLayer(bufRes.bufferLayerId!);
    expect(bufLayer).toBeDefined();
    expect(bufLayer?.name).toContain('Buffer');
    expect(bufLayer?.type).toBe('polygon');
  });
});
