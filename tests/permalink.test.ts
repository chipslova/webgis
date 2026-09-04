import { describe, it, expect } from 'vitest';
import { PermalinkManager } from '../src/tools/permalink';

describe('PermalinkManager - URL Hash Parsing & Serialization', () => {
  it('should return empty state for empty or missing hash', () => {
    expect(PermalinkManager.parseHash('')).toEqual({});
    expect(PermalinkManager.parseHash('#')).toEqual({});
    expect(PermalinkManager.parseHash('   ')).toEqual({});
  });

  it('should parse standard 2D map query parameters correctly', () => {
    const hash = '#map=8.50/-6.1754/106.8272&basemap=esri-satellite&product=s2-ndvi&year=2024';
    const state = PermalinkManager.parseHash(hash);

    expect(state.zoom).toBe(8.5);
    expect(state.lat).toBe(-6.1754);
    expect(state.lng).toBe(106.8272);
    expect(state.pitch).toBeUndefined();
    expect(state.bearing).toBeUndefined();
    expect(state.basemapId).toBe('esri-satellite');
    expect(state.productId).toBe('s2-ndvi');
    expect(state.year).toBe('2024');
  });

  it('should parse 3D camera orientation parameters (pitch, bearing, 3D globe projection)', () => {
    const hash = '#map=12.00/-7.5407/110.4463/55/30&proj=globe&pitch=55&bearing=30';
    const state = PermalinkManager.parseHash(hash);

    expect(state.zoom).toBe(12.0);
    expect(state.lat).toBe(-7.5407);
    expect(state.lng).toBe(110.4463);
    expect(state.pitch).toBe(55);
    expect(state.bearing).toBe(30);
    expect(state.projection).toBe('globe');
  });

  it('should parse layer opacities and GEE active layer lists', () => {
    const hash = '#map=6.00/-2.5500/117.8900&gee=lst,elevation,poi&p_op=0.75&g_op=0.60';
    const state = PermalinkManager.parseHash(hash);

    expect(state.geeLayers).toEqual(['lst', 'elevation', 'poi']);
    expect(state.pikselOpacity).toBe(0.75);
    expect(state.geeOpacity).toBe(0.6);
  });

  it('should parse legacy slash format correctly', () => {
    const legacyHash = '#106.8272/-6.1754/10/osm-standard/s2-true-color/2024';
    const state = PermalinkManager.parseHash(legacyHash);

    expect(state.lng).toBe(106.8272);
    expect(state.lat).toBe(-6.1754);
    expect(state.zoom).toBe(10);
    expect(state.basemapId).toBe('osm-standard');
    expect(state.productId).toBe('s2-true-color');
    expect(state.year).toBe('2024');
  });

  it('should clamp out-of-range pitch values to max 85 degrees', () => {
    const hash = '#map=10/-6.2/106.8/120/0&pitch=120';
    const state = PermalinkManager.parseHash(hash);

    expect(state.pitch).toBe(85);
  });

  it('should gracefully handle malformed or partial coordinates', () => {
    const hash = '#map=invalid/lat/lng';
    const state = PermalinkManager.parseHash(hash);

    expect(state.lat).toBeUndefined();
    expect(state.lng).toBeUndefined();
    expect(state.zoom).toBeUndefined();
  });
});
