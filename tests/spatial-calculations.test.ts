import { describe, it, expect } from 'vitest';
import { point, polygon } from '@turf/helpers';
import { distance } from '@turf/distance';
import { area } from '@turf/area';

describe('Spatial & Geodetic Calculations (Turf.js)', () => {
  it('should calculate accurate geodesic distance between Jakarta and Bogor (~45 km)', () => {
    const jakarta: [number, number] = [106.8272, -6.1754]; // Monas
    const bogor: [number, number] = [106.7972, -6.5950];   // Kebun Raya Bogor

    const from = point(jakarta);
    const to = point(bogor);
    const distanceKm = distance(from, to, { units: 'kilometers' });

    // Actual geodesic distance is approx ~46.6 km
    expect(distanceKm).toBeGreaterThan(45);
    expect(distanceKm).toBeLessThan(49);
  });

  it('should calculate accurate geodesic distance across Java (Jakarta to Semarang ~407 km)', () => {
    const jakarta: [number, number] = [106.8272, -6.1754];
    const semarang: [number, number] = [110.4200, -6.9900];

    const from = point(jakarta);
    const to = point(semarang);
    const distanceKm = distance(from, to, { units: 'kilometers' });

    expect(distanceKm).toBeGreaterThan(395);
    expect(distanceKm).toBeLessThan(420);
  });

  it('should calculate polygon area correctly in square kilometers and hectares', () => {
    // 0.01 deg x 0.01 deg approx 1.1 km x 1.1 km = ~1.2 km^2 = ~120 hectares near equator
    const bboxPolygon = polygon([[
      [106.80, -6.20],
      [106.81, -6.20],
      [106.81, -6.19],
      [106.80, -6.19],
      [106.80, -6.20]
    ]]);

    const areaSqMeters = area(bboxPolygon);
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

  it('should accurately convert NASA MODIS Land Surface Temperature DN to Celsius', () => {
    // NASA LP DAAC formula: T_Kelvin = DN * 0.02, T_Celsius = T_Kelvin - 273.15
    const convertDNToCelsius = (dn: number): number => {
      return Number(((dn * 0.02) - 273.15).toFixed(2));
    };

    // Reference test 1: 300.0 Kelvin (tropical average) -> DN = 15000
    expect(convertDNToCelsius(15000)).toBe(26.85);

    // Reference test 2: 305.0 Kelvin (~31.85°C urban daytime) -> DN = 15250
    expect(convertDNToCelsius(15250)).toBe(31.85);

    // Reference test 3: 280.0 Kelvin (cold highland mountain summit 6.85°C) -> DN = 14000
    expect(convertDNToCelsius(14000)).toBe(6.85);
  });

  it('should compute valid Spectral Indices formulas (NDVI, NDWI, NDBI)', () => {
    // Healthy vegetation: high NIR (0.60), low Red (0.08)
    const nirVeg = 0.60;
    const redVeg = 0.08;
    const ndvi = (nirVeg - redVeg) / (nirVeg + redVeg);
    expect(ndvi).toBeCloseTo(0.765, 2); // Typical dense tropical forest NDVI

    // Clear water: higher Green (0.15) than NIR (0.02)
    const greenWater = 0.15;
    const nirWater = 0.02;
    const ndwi = (greenWater - nirWater) / (greenWater + nirWater);
    expect(ndwi).toBeCloseTo(0.765, 2); // Positive water body signature

    // Urban built-up: high SWIR (0.35), lower NIR (0.22)
    const swirUrban = 0.35;
    const nirUrban = 0.22;
    const ndbi = (swirUrban - nirUrban) / (swirUrban + nirUrban);
    expect(ndbi).toBeCloseTo(0.228, 2); // Positive built-up signature
  });

  it('should verify atmospheric environmental lapse rate baseline for Jakarta vs Bandung topography', () => {
    // Standard atmosphere lapse rate: 6.5°C per 1000m (0.0065°C/m)
    const lapseRate = 0.0065;
    const jakartaElev = 8;    // meters
    const bandungElev = 768;  // meters
    const deltaZ = bandungElev - jakartaElev;
    const expectedTopographicCooling = deltaZ * lapseRate;

    // A elevation difference of 760m naturally accounts for ~4.9°C cooling
    expect(expectedTopographicCooling).toBeGreaterThan(4.5);
    expect(expectedTopographicCooling).toBeLessThan(5.5);
  });
});
