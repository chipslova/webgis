import { describe, it, expect } from 'vitest';
import { BASEMAPS } from '../src/config/basemaps';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../src/config/piksel';

describe('Configuration & Data Schema Integrity', () => {
  it('should have unique IDs and valid configuration for all basemaps', () => {
    const ids = new Set<string>();

    BASEMAPS.forEach((bm) => {
      expect(bm.id).toBeDefined();
      expect(typeof bm.id).toBe('string');
      expect(bm.id.length).toBeGreaterThan(0);
      expect(ids.has(bm.id), `Duplicate basemap id: ${bm.id}`).toBe(false);
      ids.add(bm.id);

      expect(bm.name).toBeDefined();
      expect(bm.category).toBeDefined();
      expect(bm.styleUrl).toBeDefined();
      expect(bm.styleUrl.startsWith('/') || bm.styleUrl.startsWith('http')).toBe(true);

      if (bm.initialBounds) {
        expect(bm.initialBounds.center).toHaveLength(2);
        expect(bm.initialBounds.zoom).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should have valid Piksel EO products metadata and OGC parameters', () => {
    const pIds = new Set<string>();

    PIKSEL_PRODUCTS.forEach((prod) => {
      expect(prod.id).toBeDefined();
      expect(pIds.has(prod.id), `Duplicate product id: ${prod.id}`).toBe(false);
      pIds.add(prod.id);

      expect(prod.name).toBeDefined();
      expect(prod.layer).toBeDefined();
      expect(prod.serviceUrl).toBeDefined();
      if (prod.minZoom !== undefined) {
        expect(prod.minZoom).toBeGreaterThanOrEqual(0);
        expect(prod.minZoom).toBeLessThanOrEqual(18);
      }

      if (prod.timeEnabled) {
        expect(Array.isArray(prod.availableYears)).toBe(true);
        expect(prod.availableYears!.length).toBeGreaterThan(0);
      }
    });
  });

  it('should have valid geographic bounding presets for key Indonesian regions', () => {
    PIKSEL_PRESETS.forEach((preset) => {
      expect(preset.name).toBeDefined();
      expect(preset.center).toHaveLength(2);
      const [lng, lat] = preset.center;

      // Indonesian territory coordinates range: 94°E - 142°E, 11°S - 6°N
      expect(lng).toBeGreaterThanOrEqual(94);
      expect(lng).toBeLessThanOrEqual(142);
      expect(lat).toBeGreaterThanOrEqual(-12);
      expect(lat).toBeLessThanOrEqual(7);

      expect(preset.zoom).toBeGreaterThan(0);
    });
  });
});
