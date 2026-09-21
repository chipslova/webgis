/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MeasureTool } from '../src/tools/measure';
import * as fs from 'fs';
import * as path from 'path';

describe('Elevation Cross-Section Profile & Dark Glassmorphic Scale Bar', () => {
  let mockMap: any;
  let queryTerrainElevationStub: any;

  beforeEach(() => {
    queryTerrainElevationStub = (coord: [number, number]) => {
      // Simulate terrain: elevation rises with latitude/longitude
      const [lng, lat] = coord;
      return 500 + Math.round((lng - 110) * 1000 + (lat + 7) * 500);
    };

    mockMap = {
      getSource: () => null,
      getLayer: () => null,
      addSource: () => {},
      addLayer: () => {},
      setLayoutProperty: () => {},
      getStyle: () => ({ layers: [] }),
      on: () => {},
      once: () => {},
      getCanvas: () => ({
        style: {},
        addEventListener: () => {},
        clientWidth: 800,
        clientHeight: 600
      }),
      getCanvasContainer: () => document.createElement('div'),
      queryTerrainElevation: queryTerrainElevationStub
    };
  });

  it('should return null profile when measure mode is not distance or has < 2 points', () => {
    const measure = new MeasureTool(mockMap);
    
    // Mode is none
    expect(measure.computeElevationProfile([[110.0, -7.0]])).toBeNull();

    // Mode is area
    measure.setMode('area');
    expect(measure.computeElevationProfile([[110.0, -7.0], [110.1, -7.1]])).toBeNull();

    // Mode is distance but only 1 point
    measure.setMode('distance');
    expect(measure.computeElevationProfile([[110.0, -7.0]])).toBeNull();
  });

  it('should compute elevation profile along multiple line segments with min, max, gain and loss', () => {
    const measure = new MeasureTool(mockMap);
    measure.setMode('distance');

    const coords: [number, number][] = [
      [110.0, -7.0],
      [110.05, -7.02],
      [110.1, -7.05]
    ];

    const profile = measure.computeElevationProfile(coords);
    expect(profile).not.toBeNull();
    if (!profile) return;

    expect(profile.points.length).toBeGreaterThanOrEqual(20);
    expect(profile.minElevation).toBeGreaterThanOrEqual(0);
    expect(profile.maxElevation).toBeGreaterThan(profile.minElevation);
    expect(profile.totalGain).toBeGreaterThan(0);
    expect(profile.points[0].distanceKm).toBe(0);
    expect(profile.points[profile.points.length - 1].distanceKm).toBeGreaterThan(0);
  });

  it('should gracefully handle maps where queryTerrainElevation is missing or returns NaN/null', () => {
    const flatMap = {
      ...mockMap,
      queryTerrainElevation: () => null
    };

    const measure = new MeasureTool(flatMap);
    measure.setMode('distance');

    const coords: [number, number][] = [
      [110.0, -7.0],
      [110.05, -7.0]
    ];

    const profile = measure.computeElevationProfile(coords);
    expect(profile).toBeNull();
  });

  it('should manage highlight marker on map without throwing', () => {
    const measure = new MeasureTool(mockMap);
    expect(() => measure.highlightProfileCoordinate([110.02, -7.01])).not.toThrow();
    expect(() => measure.highlightProfileCoordinate(null)).not.toThrow();
  });

  it('should verify that index.html contains all elevation profile DOM elements', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
    expect(html).toContain('id="measure-elevation-profile"');
    expect(html).toContain('id="profile-min-elev"');
    expect(html).toContain('id="profile-max-elev"');
    expect(html).toContain('id="profile-gain-elev"');
    expect(html).toContain('id="profile-loss-elev"');
    expect(html).toContain('id="measure-elevation-svg"');
    expect(html).toContain('id="profile-chart-tooltip"');
  });

  it('should verify that style.css contains .maplibregl-ctrl-scale dark glassmorphic styling', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf-8');
    expect(css).toContain('.maplibregl-ctrl-scale');
    expect(css).toContain('rgba(0, 240, 255');
    expect(css).toContain('.measure-elevation-profile');
  });
});
