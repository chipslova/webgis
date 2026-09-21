import { describe, it, expect } from 'vitest';
import { SpatialBufferAnalyzer } from '../src/tools/spatial-buffer';

describe('Spatial Buffer & Spatial Intersection (Overlay) Analysis', () => {
  const mockCenterPoint: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [106.8456, -6.2088] // Monas, Jakarta
        },
        properties: {
          name: 'Monas Pusat'
        }
      }
    ]
  };

  const mockTargetPOIs: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [106.847, -6.21] // Very close to Monas (~200m)
        },
        properties: {
          name: 'Stasiun Gambir',
          category: 'Transport'
        }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [106.85, -6.22] // ~1.5 km from Monas
        },
        properties: {
          name: 'Kwitang Library',
          category: 'Education'
        }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [107.61, -6.91] // Bandung (~120 km away)
        },
        properties: {
          name: 'Gedung Sate Bandung',
          category: 'Government'
        }
      }
    ]
  };

  it('should successfully create geodesic buffer geometry and compute total area', () => {
    const result = SpatialBufferAnalyzer.createBuffer(mockCenterPoint, {
      radius: 5,
      units: 'kilometers'
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.features.length).toBe(1);
    expect(result.data!.features[0].geometry.type).toBe('Polygon');
    expect(result.areaKm2).toBeGreaterThan(70); // π * r² = π * 25 ≈ 78.5 km²
    expect(result.areaKm2).toBeLessThan(85);
  });

  it('should execute spatial intersection (Point-in-Polygon) and find features inside the buffer', () => {
    // 5 km buffer around Monas: should include Gambir & Kwitang, exclude Bandung
    const result = SpatialBufferAnalyzer.createBuffer(mockCenterPoint, {
      radius: 5,
      units: 'kilometers',
      overlayGeoJSON: mockTargetPOIs,
      overlayLayerName: 'Fasilitas Jakarta'
    });

    expect(result.success).toBe(true);
    expect(result.intersection).toBeDefined();

    const isect = result.intersection!;
    expect(isect.totalTargetFeatures).toBe(3);
    expect(isect.insideCount).toBe(2);
    expect(isect.insidePercentage).toBeCloseTo(66.7, 1);
    expect(isect.insideFeatures.features.length).toBe(2);

    const namesInside = isect.insideFeatures.features.map((f) => f.properties?.name);
    expect(namesInside).toContain('Stasiun Gambir');
    expect(namesInside).toContain('Kwitang Library');
    expect(namesInside).not.toContain('Gedung Sate Bandung');
  });

  it('should exclude all target features when buffer radius is tiny', () => {
    // 0.05 km (50 meters) buffer around Monas: none of the POIs should be inside
    const result = SpatialBufferAnalyzer.createBuffer(mockCenterPoint, {
      radius: 0.05,
      units: 'kilometers',
      overlayGeoJSON: mockTargetPOIs,
      overlayLayerName: 'Fasilitas Jakarta'
    });

    expect(result.success).toBe(true);
    expect(result.intersection).toBeDefined();
    expect(result.intersection!.insideCount).toBe(0);
    expect(result.intersection!.insidePercentage).toBe(0);
  });

  it('should safeguard against massive datasets by capping features at MAX_SAFE_FEATURES', () => {
    const hugeFeatures: GeoJSON.Feature[] = [];
    for (let i = 0; i < 1050; i++) {
      hugeFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [106.8 + (i * 0.001), -6.2 + (i * 0.001)]
        },
        properties: { id: i }
      });
    }

    const hugeCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: hugeFeatures
    };

    const result = SpatialBufferAnalyzer.createBuffer(hugeCollection, {
      radius: 1,
      units: 'kilometers'
    });

    expect(result.success).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('1000');
    expect(result.data!.features.length).toBe(1000);
  });
});
