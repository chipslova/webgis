import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';

describe('Spatial & Geodetic Calculations (Turf.js)', () => {
  it('should calculate accurate geodesic distance between Jakarta and Bogor (~45 km)', () => {
    const jakarta: [number, number] = [106.8272, -6.1754]; // Monas
    const bogor: [number, number] = [106.7972, -6.5950];   // Kebun Raya Bogor

    const from = turf.point(jakarta);
    const to = turf.point(bogor);
    const distanceKm = turf.distance(from, to, { units: 'kilometers' });

    // Actual geodesic distance is approx ~46.6 km
    expect(distanceKm).toBeGreaterThan(45);
    expect(distanceKm).toBeLessThan(49);
  });

  it('should calculate accurate geodesic distance across Java (Jakarta to Semarang ~407 km)', () => {
    const jakarta: [number, number] = [106.8272, -6.1754];
    const semarang: [number, number] = [110.4200, -6.9900];

    const from = turf.point(jakarta);
    const to = turf.point(semarang);
    const distanceKm = turf.distance(from, to, { units: 'kilometers' });

    expect(distanceKm).toBeGreaterThan(395);
    expect(distanceKm).toBeLessThan(420);
  });

  it('should calculate polygon area correctly in square kilometers and hectares', () => {
    // 0.01 deg x 0.01 deg approx 1.1 km x 1.1 km = ~1.2 km^2 = ~120 hectares near equator
    const bboxPolygon = turf.polygon([[
      [106.80, -6.20],
      [106.81, -6.20],
      [106.81, -6.19],
      [106.80, -6.19],
      [106.80, -6.20]
    ]]);

    const areaSqMeters = turf.area(bboxPolygon);
    const areaSqKm = areaSqMeters / 1_000_000;
    const areaHectares = areaSqMeters / 10_000;

    expect(areaSqKm).toBeGreaterThan(1.1);
    expect(areaSqKm).toBeLessThan(1.3);
    expect(areaHectares).toBeGreaterThan(110);
    expect(areaHectares).toBeLessThan(130);
  });

  it('should accurately convert Decimal Degrees to Degrees Minutes Seconds (DMS)', () => {
    const toDMS = (val: number, isLat: boolean): string => {
      const abs = Math.abs(val);
      const deg = Math.floor(abs);
      const min = Math.floor((abs - deg) * 60);
      const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
      const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
      return `${deg}° ${min}' ${sec}" ${dir}`;
    };

    // Monas Jakarta (-6.1754° S, 106.8272° E)
    expect(toDMS(-6.1754, true)).toBe("6° 10' 31.4\" S");
    expect(toDMS(106.8272, false)).toBe("106° 49' 37.9\" E");
  });
});
