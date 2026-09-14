import { describe, it, expect } from 'vitest';
import { geoJsonToKml } from '../src/utils/kml-exporter';

describe('OGC KML 2.2 Exporter', () => {
  it('should serialize a Point FeatureCollection into standard KML', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Monas Jakarta', height: '132m' },
          geometry: {
            type: 'Point',
            coordinates: [106.8272, -6.1754, 0]
          }
        }
      ]
    };

    const kml = geoJsonToKml(geojson, 'Jakarta Landmark');
    expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>Jakarta Landmark</name>');
    expect(kml).toContain('<name>Monas Jakarta</name>');
    expect(kml).toContain('<Point><coordinates>106.8272,-6.1754,0</coordinates></Point>');
  });

  it('should serialize a LineString (distance measurement) into standard KML', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Jalur Pengukuran' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [106.82, -6.17, 0],
              [106.85, -6.20, 0]
            ]
          }
        }
      ]
    };

    const kml = geoJsonToKml(geojson, 'Pengukuran Jarak');
    expect(kml).toContain('<LineString>');
    expect(kml).toContain('<coordinates>106.82,-6.17,0 106.85,-6.2,0</coordinates>');
    expect(kml).toContain('</LineString>');
  });

  it('should serialize a Polygon (area measurement) with LinearRing into standard KML', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Area Taman' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [106.82, -6.17, 0],
                [106.85, -6.17, 0],
                [106.85, -6.20, 0],
                [106.82, -6.20, 0],
                [106.82, -6.17, 0]
              ]
            ]
          }
        }
      ]
    };

    const kml = geoJsonToKml(geojson, 'Pengukuran Luas');
    expect(kml).toContain('<Polygon>');
    expect(kml).toContain('<outerBoundaryIs><LinearRing><coordinates>');
    expect(kml).toContain('106.82,-6.17,0 106.85,-6.17,0 106.85,-6.2,0 106.82,-6.2,0 106.82,-6.17,0');
    expect(kml).toContain('</LinearRing></outerBoundaryIs></Polygon>');
  });

  it('should escape unsafe characters in Placemark names and properties', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: '<script>alert(1)</script>', note: 'A & B "Test"' },
          geometry: {
            type: 'Point',
            coordinates: [110.4, -7.5, 0]
          }
        }
      ]
    };

    const kml = geoJsonToKml(geojson, '<Unsafe Doc>');
    expect(kml).toContain('&lt;Unsafe Doc&gt;');
    expect(kml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(kml).not.toContain('<script>');
  });
});
