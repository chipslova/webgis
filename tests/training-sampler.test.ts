import { describe, it, expect } from 'vitest';
import { TrainingSampler } from '../src/tools/training-sampler';
import { parseExcelToGeoJSON } from '../src/utils/excel-parser';

describe('TrainingSampler', () => {
  it('should initialize with default classes and active class 1', () => {
    const sampler = new TrainingSampler();
    expect(sampler.getClasses().length).toBe(5);
    expect(sampler.getActiveClassId()).toBe(1);
    expect(sampler.getSamplingActive()).toBe(false);
  });

  it('should add sample points and compute class counts correctly', () => {
    const sampler = new TrainingSampler();
    sampler.setActiveClass(1); // Air
    sampler.addSample([106.8, -6.2], 'manual');
    sampler.addSample([106.9, -6.3], 'manual');

    sampler.setActiveClass(2); // Hutan
    sampler.addSample([107.0, -6.5], 'manual');

    expect(sampler.getSamples().length).toBe(3);
    const counts = sampler.getClassCounts();
    expect(counts[1]).toBe(2);
    expect(counts[2]).toBe(1);
    expect(counts[3]).toBe(0);
  });

  it('should import points from a FeatureCollection and detect classes', () => {
    const sampler = new TrainingSampler();
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [100.0, 0.0] },
          properties: { class_name: 'Hutan / Vegetasi' }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [101.0, 1.0] },
          properties: { class: 'Lahan Baru Unik' }
        }
      ]
    };

    const count = sampler.importFromFeatureCollection(fc);
    expect(count).toBe(2);
    expect(sampler.getSamples().length).toBe(2);
    // 'Lahan Baru Unik' should be dynamically registered as a new class
    expect(sampler.getClasses().some((c) => c.name === 'Lahan Baru Unik')).toBe(true);
  });

  it('should export samples to valid GeoJSON and CSV', () => {
    const sampler = new TrainingSampler();
    sampler.setActiveClass(3);
    sampler.addSample([110.0, -7.0], 'manual', undefined, 'Plot Uji');

    const geojson = sampler.toGeoJSON();
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBe(1);
    expect((geojson.features[0].geometry as GeoJSON.Point).coordinates).toEqual([110.0, -7.0]);
    expect(geojson.features[0].properties?.className).toBe('Pertanian / Sawah');

    const csv = sampler.toCSV();
    expect(csv).toContain('latitude,longitude');
    expect(csv).toContain('-7,110');
    expect(csv).toContain('Pertanian / Sawah');
  });

  it('should export samples to valid Excel buffer and allow re-parsing', () => {
    const sampler = new TrainingSampler();
    sampler.setActiveClass(4);
    sampler.addSample([112.7, -7.2], 'manual');

    const excelBytes = sampler.toExcelBuffer();
    expect(excelBytes.length).toBeGreaterThan(0);

    const reparse = parseExcelToGeoJSON(excelBytes);
    expect(reparse.success).toBe(true);
    expect(reparse.data?.features.length).toBe(1);
    const reparseGeom = reparse.data?.features[0].geometry as GeoJSON.Point;
    expect(reparseGeom.coordinates[0]).toBeCloseTo(112.7);
    expect(reparseGeom.coordinates[1]).toBeCloseTo(-7.2);
  });

  it('should remove specific sample or clear by class', () => {
    const sampler = new TrainingSampler();
    const s1 = sampler.addSample([100, 0], 'manual', 1);
    const s2 = sampler.addSample([101, 1], 'manual', 2);

    sampler.removeSample(s1.id);
    expect(sampler.getSamples().length).toBe(1);
    expect(sampler.getSamples()[0].id).toBe(s2.id);

    sampler.clearSamples();
    expect(sampler.getSamples().length).toBe(0);
  });
});
