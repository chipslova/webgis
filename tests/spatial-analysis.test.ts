import { describe, it, expect } from 'vitest';
import {
  SpatialAnalysisEngine,
  PRESET_REGIONS,
  LULC_CLASSES,
  ZonalAnalysisResult
} from '../src/tools/spatial-analysis';
import { polygon } from '@turf/helpers';

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

  it('should compute accurate Zonal Statistics for IKN Nusantara preset', () => {
    const iknPreset = PRESET_REGIONS.find((p) => p.id === 'ikn-nusantara')!;
    const polyFeature = polygon(iknPreset.coordinates);

    const result = SpatialAnalysisEngine.computeZonalStats(polyFeature, iknPreset.name);

    expect(result.regionName).toBe(iknPreset.name);
    expect(result.totalAreaKm2).toBeGreaterThan(500);
    expect(result.totalAreaHa).toBeCloseTo(result.totalAreaKm2 * 100, 1);
    expect(result.landCoverBreakdown.length).toBeGreaterThan(3);

    // Percentages should sum to approx 100%
    const totalPercentage = result.landCoverBreakdown.reduce((sum, item) => sum + item.percentage, 0);
    expect(totalPercentage).toBeGreaterThanOrEqual(98);
    expect(totalPercentage).toBeLessThanOrEqual(102);

    // Forest should be prominent in IKN
    const forestStat = result.landCoverBreakdown.find((b) => b.code === 2);
    expect(forestStat).toBeDefined();
    expect(forestStat!.percentage).toBeGreaterThan(40);

    // Thermal metrics check
    expect(result.thermalStats.meanTempC).toBeGreaterThan(20);
    expect(result.thermalStats.maxTempC).toBeGreaterThan(result.thermalStats.minTempC);
    expect(result.thermalStats.hotspotAreaKm2).toBeLessThanOrEqual(result.totalAreaKm2);
  });

  it('should compute accurate Urban Heat Island and Built-up dominance for DKI Jakarta', () => {
    const jktPreset = PRESET_REGIONS.find((p) => p.id === 'dki-jakarta')!;
    const polyFeature = polygon(jktPreset.coordinates);

    const result = SpatialAnalysisEngine.computeZonalStats(polyFeature, jktPreset.name);

    expect(result.totalAreaKm2).toBeGreaterThan(600);
    
    // Built Area should be dominant in Jakarta
    const builtStat = result.landCoverBreakdown.find((b) => b.code === 7);
    expect(builtStat).toBeDefined();
    expect(builtStat!.percentage).toBeGreaterThan(50);

    // High mean temperature for dense urban Jakarta
    expect(result.thermalStats.meanTempC).toBeGreaterThan(30);
    expect(result.thermalStats.hotspotPercentage).toBeGreaterThan(50);
  });

  it('should export formatted CSV report with complete statistics and metadata', () => {
    const bandungPreset = PRESET_REGIONS.find((p) => p.id === 'cekungan-bandung')!;
    const polyFeature = polygon(bandungPreset.coordinates);
    const result = SpatialAnalysisEngine.computeZonalStats(polyFeature, bandungPreset.name);

    const csvOutput = SpatialAnalysisEngine.exportToCSV(result);

    expect(csvOutput).toContain('LAPORAN ANALISIS STATISTIK SPASIAL WILAYAH');
    expect(csvOutput).toContain(bandungPreset.name);
    expect(csvOutput).toContain('STATISTIK SUHU PERMUKAAN TANAH');
    expect(csvOutput).toContain('KOMPOSISI TUTUPAN LAHAN');
    expect(csvOutput).toContain('Kode,Nama Kelas,Nama Indonesia,Luas (km²),Proporsi (%)');
    expect(csvOutput).toContain('Tutupan Pohon / Hutan');
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
});
