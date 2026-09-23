import { describe, it, expect } from 'vitest';
import { SpatialIntersectAnalyzer } from '../src/tools/spatial-intersect';
import { FeatureCollection, Polygon, Point, LineString } from 'geojson';

describe('SpatialIntersectAnalyzer', () => {
  // Setup sample test geometries
  const polyA: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Kota Wilayah A', id: 'poly-a', category: 'Urban' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [106.8, -6.2],
              [107.0, -6.2],
              [107.0, -6.0],
              [106.8, -6.0],
              [106.8, -6.2]
            ]
          ]
        }
      }
    ]
  };

  const polyB_overlapping: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Kawasan Industri B', id: 'poly-b', category: 'Industrial' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [106.9, -6.3],
              [107.1, -6.3],
              [107.1, -6.1],
              [106.9, -6.1],
              [106.9, -6.3]
            ]
          ]
        }
      }
    ]
  };

  const polyC_disjoint: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Pulau Terpencil C', id: 'poly-c', category: 'Island' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [110.0, -7.0],
              [110.2, -7.0],
              [110.2, -6.8],
              [110.0, -6.8],
              [110.0, -7.0]
            ]
          ]
        }
      }
    ]
  };

  const pointsLayer: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Stasiun Pusat Jakarta', category: 'Transit' },
        geometry: {
          type: 'Point',
          coordinates: [106.85, -6.15] // Inside polyA
        }
      },
      {
        type: 'Feature',
        properties: { name: 'Stasiun Gambir', category: 'Transit' },
        geometry: {
          type: 'Point',
          coordinates: [106.83, -6.17] // Inside polyA
        }
      },
      {
        type: 'Feature',
        properties: { name: 'Pelabuhan Merak', category: 'Port' },
        geometry: {
          type: 'Point',
          coordinates: [105.9, -5.9] // Outside polyA
        }
      }
    ]
  };

  const lineLayer: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Jalur Tol Jakarta-Cikampek', category: 'Highway' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.7, -6.1],
            [106.9, -6.1],
            [107.2, -6.1]
          ]
        }
      }
    ]
  };

  describe('Polygon-Polygon Geometric Intersection (Irisan)', () => {
    it('should compute overlapping polygon intersection and area correctly', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, polyB_overlapping, {
        layerAName: 'Wilayah A',
        layerBName: 'Industri B'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('intersect');
      expect(result.intersectedCount).toBe(1);
      expect(result.intersectedAreaKm2).toBeGreaterThan(0);
      expect(result.intersectedAreaHa).toBeGreaterThan(0);
      expect(result.overlapPercentage).toBeGreaterThan(0);
      expect(result.overlapPercentage).toBeLessThanOrEqual(100);
      expect(result.data).toBeDefined();
      expect(result.data?.features.length).toBe(1);
      expect(result.bbox).toBeDefined();

      const feature = result.data?.features[0];
      expect(feature?.properties?.['_intersect_layer_a']).toBe('Wilayah A');
      expect(feature?.properties?.['_intersect_layer_b']).toBe('Industri B');
      expect(feature?.properties?.['_intersect_source_a']).toContain('Kota Wilayah A');
      expect(feature?.properties?.['_intersect_source_b']).toContain('Kawasan Industri B');
    });

    it('should return 0 intersected features for disjoint polygons', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, polyC_disjoint, {
        layerAName: 'Wilayah A',
        layerBName: 'Pulau C'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(0);
      expect(result.intersectedAreaKm2).toBe(0);
      expect(result.intersectedAreaHa).toBe(0);
      expect(result.overlapPercentage).toBe(0);
      expect(result.data?.features.length).toBe(0);
    });
  });

  describe('Polygon Geometric Difference (Pemotongan / Erase)', () => {
    it('should compute difference subtracting layer B from layer A', () => {
      const result = SpatialIntersectAnalyzer.difference(polyA, polyB_overlapping, {
        layerAName: 'Wilayah A',
        layerBName: 'Industri B'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('difference');
      expect(result.intersectedCount).toBe(1);
      expect(result.intersectedAreaKm2).toBeGreaterThan(0);
      expect(result.data?.features.length).toBe(1);
    });

    it('should retain full polygon A if subtracting disjoint polygon C', () => {
      const result = SpatialIntersectAnalyzer.difference(polyA, polyC_disjoint, {
        layerAName: 'Wilayah A',
        layerBName: 'Pulau C'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(1);
      expect(result.intersectedAreaKm2).toBeGreaterThan(0);
    });
  });

  describe('Polygon Geometric Union (Penggabungan)', () => {
    it('should merge overlapping polygons into a single union geometry', () => {
      const result = SpatialIntersectAnalyzer.union(polyA, polyB_overlapping, {
        layerAName: 'Wilayah A',
        layerBName: 'Industri B'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('union');
      expect(result.intersectedCount).toBeGreaterThanOrEqual(1);
      expect(result.intersectedAreaKm2).toBeGreaterThan(0);
      expect(result.data?.features.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Polygon Symmetric Difference (Beda Simetris / XOR)', () => {
    it('should compute exclusive areas of polyA and polyB without the overlap', () => {
      const result = SpatialIntersectAnalyzer.symmetricDifference(polyA, polyB_overlapping, {
        layerAName: 'Wilayah A',
        layerBName: 'Industri B'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('sym_difference');
      expect(result.intersectedCount).toBeGreaterThanOrEqual(1);
      expect(result.intersectedAreaKm2).toBeGreaterThan(0);
    });
  });

  describe('Point-in-Polygon Overlay', () => {
    it('should filter points inside the polygon when polygon is Layer A and points are Layer B', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, pointsLayer, {
        layerAName: 'Batas Wilayah A',
        layerBName: 'Titik Stasiun'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(2);
      expect(result.data?.features.length).toBe(2);
      expect(result.data?.features.some((f) => f.properties?.name === 'Stasiun Pusat Jakarta')).toBe(true);
      expect(result.data?.features.some((f) => f.properties?.name === 'Pelabuhan Merak')).toBe(false);
    });

    it('should filter points inside the polygon when points are Layer A and polygon is Layer B', () => {
      const result = SpatialIntersectAnalyzer.intersect(pointsLayer, polyA, {
        layerAName: 'Titik Stasiun',
        layerBName: 'Batas Wilayah A'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(2);
      expect(result.data?.features.some((f) => f.properties?.name === 'Stasiun Pusat Jakarta')).toBe(true);
    });
  });

  describe('Line-Polygon Overlay', () => {
    it('should identify line features intersecting polygon bounding vertices', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, lineLayer, {
        layerAName: 'Batas Wilayah A',
        layerBName: 'Jalur Tol'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(1);
      expect(result.data?.features[0].properties?.name).toBe('Jalur Tol Jakarta-Cikampek');
    });
  });

  describe('Thematic Category Breakdown', () => {
    it('should compute category distributions with percentages and colors', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, pointsLayer, {
        layerAName: 'Wilayah A',
        layerBName: 'Titik Stasiun'
      });

      expect(result.categoryBreakdowns.length).toBeGreaterThan(0);
      const transitCat = result.categoryBreakdowns.find((c) => c.category === 'Transit');
      expect(transitCat).toBeDefined();
      expect(transitCat?.count).toBe(2);
      expect(transitCat?.percentage).toBe(100);
      expect(transitCat?.color).toBeDefined();
    });
  });

  describe('Multi-Layer Batch Cascade Overlay', () => {
    it('should batch overlay a base polygon across multiple vector target layers', () => {
      const targets = [
        { id: 'ind-b', name: 'Kawasan Industri', data: polyB_overlapping },
        { id: 'pts', name: 'Titik Stasiun', data: pointsLayer },
        { id: 'disjoint', name: 'Pulau C', data: polyC_disjoint }
      ];

      const batchResult = SpatialIntersectAnalyzer.batchOverlay(polyA, targets, {
        mode: 'intersect',
        layerAName: 'AOI Jakarta'
      });

      expect(batchResult.totalLayersProcessed).toBe(3);
      expect(batchResult.totalIntersectedCount).toBe(3); // 1 poly + 2 pts + 0 disjoint
      expect(batchResult.totalIntersectedAreaKm2).toBeGreaterThan(0);
      expect(batchResult.results.length).toBe(3);
      expect(batchResult.results[0].result.intersectedCount).toBe(1);
      expect(batchResult.results[1].result.intersectedCount).toBe(2);
      expect(batchResult.results[2].result.intersectedCount).toBe(0);
    });
  });

  describe('Generic Overlay Dispatcher and Mode Labels', () => {
    it('should route correctly to each mode using overlay()', () => {
      const resIntersect = SpatialIntersectAnalyzer.overlay(polyA, polyB_overlapping, { mode: 'intersect' });
      expect(resIntersect.mode).toBe('intersect');
      expect(SpatialIntersectAnalyzer.getModeLabel('intersect')).toContain('Irisan');

      const resDiff = SpatialIntersectAnalyzer.overlay(polyA, polyB_overlapping, { mode: 'difference' });
      expect(resDiff.mode).toBe('difference');
      expect(SpatialIntersectAnalyzer.getModeLabel('difference')).toContain('Difference');

      const resUnion = SpatialIntersectAnalyzer.overlay(polyA, polyB_overlapping, { mode: 'union' });
      expect(resUnion.mode).toBe('union');
      expect(SpatialIntersectAnalyzer.getModeLabel('union')).toContain('Union');

      const resSym = SpatialIntersectAnalyzer.overlay(polyA, polyB_overlapping, { mode: 'sym_difference' });
      expect(resSym.mode).toBe('sym_difference');
      expect(SpatialIntersectAnalyzer.getModeLabel('sym_difference')).toContain('Beda');
    });
  });

  describe('Input Validation and Edge Cases', () => {
    it('should gracefully handle empty feature collections', () => {
      const emptyFC: FeatureCollection = { type: 'FeatureCollection', features: [] };
      const result = SpatialIntersectAnalyzer.intersect(emptyFC, polyA, {
        layerAName: 'Kosong A',
        layerBName: 'Wilayah B'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('tidak memiliki fitur data');
    });

    it('should handle null/undefined layers safely', () => {
      const result = SpatialIntersectAnalyzer.intersect(
        null as any,
        polyA as any
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should enforce MAX_SAFE_FEATURES limit and truncate with a warning', () => {
      const hugeFeatures = Array.from({ length: 1050 }, (_, i) => ({
        type: 'Feature' as const,
        properties: { id: i },
        geometry: {
          type: 'Point' as const,
          coordinates: [106.85, -6.15]
        }
      }));

      const hugeLayer: FeatureCollection = {
        type: 'FeatureCollection',
        features: hugeFeatures
      };

      const result = SpatialIntersectAnalyzer.intersect(polyA, hugeLayer, {
        layerAName: 'Wilayah A',
        layerBName: 'Huge Layer'
      });

      expect(result.success).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('1000');
    });
  });
});
