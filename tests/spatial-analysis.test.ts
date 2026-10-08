import { describe, it, expect } from 'vitest';
import {
  SpatialAnalysisEngine,
  PRESET_REGIONS,
  LULC_CLASSES,
  ZonalAnalysisResult
} from '../src/tools/spatial-analysis';
describe('Spatial Analysis & AOI Zonal Statistics Engine', () => {
  it('should have complete and valid PRESET_REGIONS definitions', () => {
    expect(PRESET_REGIONS.length).toBeGreaterThanOrEqual(6);
    
    PRESET_REGIONS.forEach((preset) => {
      expect(preset.id).toBeDefined();
      expect(preset.name).toBeDefined();
      expect(preset.center.length).toBe(2);
      expect(preset.coordinates[0].length).toBeGreaterThanOrEqual(4); // Closed ring
      expect(preset.zoom).toBeGreaterThan(5);
    });
  });
  it('should accurately test point-in-geometry with polygons, holes, and multipolygons', async () => {
    const { isPointInGeometry, isPointInRing, isPointInPolyRings } = await import('../src/tools/spatial-analysis');
    const ring = [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 10]
    ];
    expect(isPointInRing(15, 15, ring)).toBe(true);
    expect(isPointInRing(5, 5, ring)).toBe(false);
    // Poly with hole
    const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0]
    ];
    const hole = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3]
    ];
    expect(isPointInPolyRings(5, 5, [outer, hole])).toBe(false); // Inside hole
    expect(isPointInPolyRings(1, 1, [outer, hole])).toBe(true);  // Inside outer, outside hole
    expect(isPointInPolyRings(15, 15, [outer, hole])).toBe(false);
    // GeoJSON MultiPolygon
    const multiGeom: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [outer],
        [[
          [50, 50],
          [60, 50],
          [60, 60],
          [50, 60],
          [50, 50]
        ]]
      ]
    };
    expect(isPointInGeometry(1, 1, multiGeom)).toBe(true);
    expect(isPointInGeometry(55, 55, multiGeom)).toBe(true);
    expect(isPointInGeometry(30, 30, multiGeom)).toBe(false);
  });
  it('should verify all 9 Sentinel-2 LULC official class codes and colors exist', () => {
    expect(LULC_CLASSES.length).toBe(9);
    const codes = LULC_CLASSES.map((c) => c.code);
    expect(codes).toContain(1); // Water
    expect(codes).toContain(2); // Trees
    expect(codes).toContain(4); // Flooded Veg
    expect(codes).toContain(5); // Crops
    expect(codes).toContain(7); // Built Area
    expect(codes).toContain(8); // Bare Ground
    expect(codes).toContain(9); // Snow/Ice
    expect(codes).toContain(10); // Clouds
    expect(codes).toContain(11); // Rangeland
  });
  it('should format CSV export correctly when result is client-side sampled (100% free)', () => {
    const mockSampledResult: ZonalAnalysisResult = {
      regionName: 'Wilayah Uji Client Sampling',
      totalAreaKm2: 120.5,
      totalAreaHa: 12050,
      dominantClass: 'Lahan Terbangun / Kota (65%)',
      timestamp: '21 Sep 2026',
      isEstimated: false,
      isRealGEE: false,
      isClientSampled: true,
      totalPixelCount: 12500,
      computationSource: 'Sentinel-2 10m LULC (ArcGIS/Esri) + Open-Meteo Realtime',
      estimationMethod: 'Sampling Piksel Satelit Sentinel-2 10m & Open-Meteo LST (Client-Side)',
      thermalStats: {
        minTempC: 25.1,
        meanTempC: 31.8,
        maxTempC: 36.4,
        hotspotAreaKm2: 60.25,
        hotspotPercentage: 50.0
      },
      landCoverBreakdown: [
        { code: 7, name: 'Built Area', nameId: 'Lahan Terbangun / Kota', color: '#ED022A', areaKm2: 78.3, percentage: 65.0 },
        { code: 2, name: 'Trees (Forest)', nameId: 'Tutupan Pohon / Hutan', color: '#358221', areaKm2: 42.2, percentage: 35.0 }
      ],
      geojson: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[106.8, -6.2], [106.9, -6.2], [106.9, -6.3], [106.8, -6.3], [106.8, -6.2]]]
        },
        properties: {}
      }
    };
    const csvOutput = SpatialAnalysisEngine.exportToCSV(mockSampledResult);
    expect(csvOutput.startsWith('\uFEFF')).toBe(true);
    expect(csvOutput).toContain('SAMPLING PIKSEL CITRA SATELIT ASLI (Sentinel-2 10m LULC & Open-Meteo LST - 100% Free)');
    expect(csvOutput).toContain('Sentinel-2 10m LULC (ArcGIS/Esri) + Open-Meteo Realtime');
    expect(csvOutput).toContain('12.500');
    expect(csvOutput).toContain('Lahan Terbangun / Kota');
  });
});