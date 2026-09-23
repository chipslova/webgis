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
        properties: { name: 'Kota Wilayah A', id: 'poly-a' },
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
        properties: { name: 'Kawasan Industri B', id: 'poly-b' },
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
        properties: { name: 'Pulau Terpencil C', id: 'poly-c' },
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
        properties: { name: 'Jalur Tol Jakarta-Cikampek' },
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

  describe('Polygon-Polygon Geometric Intersection', () => {
    it('should compute overlapping polygon intersection and area correctly', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, polyB_overlapping, {
        layerAName: 'Wilayah A',
        layerBName: 'Industri B'
      });

      expect(result.success).toBe(true);
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

  describe('Point-in-Polygon Overlay', () => {
    it('should filter points inside the polygon when polygon is Layer A and points are Layer B', () => {
      const result = SpatialIntersectAnalyzer.intersect(polyA, pointsLayer, {
        layerAName: 'Batas Wilayah A',
        layerBName: 'Titik Stasiun'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(1);
      expect(result.data?.features.length).toBe(1);
      expect(result.data?.features[0].properties?.name).toBe('Stasiun Pusat Jakarta');
      expect(result.featureSummaries[0].name).toContain('Stasiun Pusat Jakarta');
    });

    it('should filter points inside the polygon when points are Layer A and polygon is Layer B', () => {
      const result = SpatialIntersectAnalyzer.intersect(pointsLayer, polyA, {
        layerAName: 'Titik Stasiun',
        layerBName: 'Batas Wilayah A'
      });

      expect(result.success).toBe(true);
      expect(result.intersectedCount).toBe(1);
      expect(result.data?.features[0].properties?.name).toBe('Stasiun Pusat Jakarta');
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
