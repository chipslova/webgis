import { describe, it, expect } from 'vitest';
import { parseWKBToGeoJSON } from '../src/utils/wkb-parser';

describe('wkb-parser', () => {
  it('should parse Little Endian Point WKB', () => {
    // Little endian (1), type Point (1), x = 106.8456, y = -6.2088
    const buffer = new ArrayBuffer(21);
    const view = new DataView(buffer);
    view.setUint8(0, 1); // Little endian
    view.setUint32(1, 1, true); // Point
    view.setFloat64(5, 106.8456, true);
    view.setFloat64(13, -6.2088, true);

    const geom = parseWKBToGeoJSON(buffer);
    expect(geom).not.toBeNull();
    expect(geom?.type).toBe('Point');
    if (geom?.type === 'Point') {
      expect(geom.coordinates[0]).toBeCloseTo(106.8456);
      expect(geom.coordinates[1]).toBeCloseTo(-6.2088);
    }
  });

  it('should parse Big Endian Point WKB', () => {
    const buffer = new ArrayBuffer(21);
    const view = new DataView(buffer);
    view.setUint8(0, 0); // Big endian
    view.setUint32(1, 1, false); // Point
    view.setFloat64(5, 110.0, false);
    view.setFloat64(13, -7.5, false);

    const geom = parseWKBToGeoJSON(buffer);
    expect(geom).not.toBeNull();
    expect(geom?.type).toBe('Point');
    if (geom?.type === 'Point') {
      expect(geom.coordinates[0]).toBeCloseTo(110.0);
      expect(geom.coordinates[1]).toBeCloseTo(-7.5);
    }
  });

  it('should parse EWKB with SRID', () => {
    // Little endian (1), type Point | 0x20000000, SRID 4326, x = 100, y = 0
    const buffer = new ArrayBuffer(25);
    const view = new DataView(buffer);
    view.setUint8(0, 1);
    view.setUint32(1, 1 | 0x20000000, true);
    view.setUint32(5, 4326, true); // SRID
    view.setFloat64(9, 100.0, true);
    view.setFloat64(17, 0.0, true);

    const geom = parseWKBToGeoJSON(buffer);
    expect(geom).not.toBeNull();
    expect(geom?.type).toBe('Point');
    if (geom?.type === 'Point') {
      expect(geom.coordinates[0]).toBe(100.0);
      expect(geom.coordinates[1]).toBe(0.0);
    }
  });

  it('should return null for invalid or truncated buffer', () => {
    const buffer = new ArrayBuffer(3);
    expect(parseWKBToGeoJSON(buffer)).toBeNull();
  });
});
