import { describe, it, expect } from 'vitest';
import {
  initIndonesianProjections,
  transformCoordinate,
  reprojectGeoJSON,
  guessIndonesianProjection,
  isProjectedCoordinates,
  hasProjectedFeatures
} from '../src/utils/projections';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import proj4 from 'proj4';

describe('Indonesian Projections & Auto-Reprojection Engine', () => {
  it('should initialize Indonesian projections and register them into proj4', () => {
    initIndonesianProjections();

    // DGN95 / UTM Zone 48S (EPSG: 23868)
    expect(proj4.defs('EPSG:23868')).toBeDefined();
    expect(proj4.defs('DGN_1995_UTM_Zone_48S')).toBeDefined();

    // DGN95 / UTM Zone 50S (EPSG: 23870)
    expect(proj4.defs('EPSG:23870')).toBeDefined();

    // DGN95 / UTM Zone 48N (EPSG: 23888)
    expect(proj4.defs('EPSG:23888')).toBeDefined();

    // DGN95 / Indonesia TM-3 Zone 48.2 (EPSG: 23835)
    expect(proj4.defs('EPSG:23835')).toBeDefined();
    expect(proj4.defs('DGN_1995_Indonesia_TM-3_Zone_48.2')).toBeDefined();

    // Web Mercator
    expect(proj4.defs('EPSG:3857')).toBeDefined();
  });

  it('should transform UTM Zone 48S coordinates into valid WGS84 coordinates in Indonesia', () => {
    // Jakarta Monas approximate UTM 48S coordinates: X ~ 704,400, Y ~ 9,316,500
    const utmCoord: [number, number] = [704400, 9316500];
    const wgs84Coord = transformCoordinate(utmCoord, 'EPSG:23868', 'WGS84');

    expect(wgs84Coord[0]).toBeGreaterThan(106.8);
    expect(wgs84Coord[0]).toBeLessThan(106.9);
    expect(wgs84Coord[1]).toBeGreaterThan(-6.2);
    expect(wgs84Coord[1]).toBeLessThan(-6.15);
  });

  it('should transform Indonesia TM-3 Zone 48.2 coordinates to WGS84', () => {
    // TM-3 Zone 48.2 has Central Meridian 106.5, False Easting 200,000, False Northing 1,500,000 (at equator)
    // Point at Central Meridian, equator:
    const tm3Coord: [number, number] = [200000, 1500000];
    const wgs84Coord = transformCoordinate(tm3Coord, 'EPSG:23835', 'WGS84');

    expect(wgs84Coord[0]).toBeCloseTo(106.5, 2);
    expect(wgs84Coord[1]).toBeCloseTo(0.0, 2);
  });

  it('should detect projected planar coordinates accurately', () => {
    // WGS84 (Jakarta)
    expect(isProjectedCoordinates([106.8, -6.2])).toBe(false);

    // UTM Zone 48S (Jakarta)
    expect(isProjectedCoordinates([704400, 9316500])).toBe(true);

    const projectedFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [704400, 9316500]
          },
          properties: { name: 'Monas' }
        }
      ]
    };
    expect(hasProjectedFeatures(projectedFC)).toBe(true);
  });

  it('should guess the most probable Indonesian projection based on coordinate ranges', () => {
    // UTM Zone 48S (Southern Hemisphere: Easting ~ 700k, Northing ~ 9.3M)
    expect(guessIndonesianProjection([704400, 9316500])).toBe('EPSG:23868');

    // TM-3 Zone 48.2 (Easting ~ 200k, Northing ~ 1.5M)
    expect(guessIndonesianProjection([205000, 1480000])).toBe('EPSG:23835');

    // UTM Zone 48N (Northern Hemisphere: Easting ~ 500k, Northing ~ 400k)
    expect(guessIndonesianProjection([500000, 400000])).toBe('EPSG:23888');

    // Web Mercator
    expect(guessIndonesianProjection([11890000, -690000])).toBe('EPSG:3857');
  });

  it('should reproject a full GeoJSON FeatureCollection with Point and Polygon geometries', () => {
    const projectedFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [704400, 9316500]
          },
          properties: { id: 1 }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [704000, 9316000],
                [705000, 9316000],
                [705000, 9317000],
                [704000, 9317000],
                [704000, 9316000]
              ]
            ]
          },
          properties: { id: 2 }
        }
      ]
    };

    const reprojected = reprojectGeoJSON(projectedFC, 'EPSG:23868', 'WGS84');
    expect(hasProjectedFeatures(reprojected)).toBe(false);

    const ptCoord = (reprojected.features[0].geometry as GeoJSON.Point).coordinates;
    expect(ptCoord[0]).toBeGreaterThan(106.8);
    expect(ptCoord[0]).toBeLessThan(106.9);
    expect(ptCoord[1]).toBeGreaterThan(-6.2);
    expect(ptCoord[1]).toBeLessThan(-6.15);
  });

  it('should auto-reproject projected GeoJSON in GeoJsonLoader.normalizeAndValidate instead of rejecting', () => {
    const utmGeoJSON = {
      type: 'FeatureCollection',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:EPSG::32748' }
      },
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [704400, 9316500]
          },
          properties: { name: 'Monas UTM' }
        }
      ]
    };

    const res = GeoJsonLoader.normalizeAndValidate(utmGeoJSON);
    expect(res.valid).toBe(true);
    expect(res.data).toBeDefined();

    const coords = (res.data!.features[0].geometry as GeoJSON.Point).coordinates;
    expect(Math.abs(coords[0])).toBeLessThanOrEqual(180);
    expect(Math.abs(coords[1])).toBeLessThanOrEqual(90);
    expect(coords[0]).toBeGreaterThan(106.8);
    expect(coords[0]).toBeLessThan(106.9);
  });
});
