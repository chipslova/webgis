// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpatialBufferAnalyzer } from '../src/tools/spatial-buffer';
import { SpatialIntersectAnalyzer } from '../src/tools/spatial-intersect';
import { SpatialWorkerClient } from '../src/workers/spatial-worker-client';

describe('Spatial Web Worker & Background Computation Suite', () => {
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
          coordinates: [106.847, -6.21] // Near Monas (~200m)
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
          coordinates: [107.61, -6.91] // Bandung (~120km)
        },
        properties: {
          name: 'Gedung Sate Bandung',
          category: 'Government'
        }
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. should initialize SpatialWorkerClient instance as singleton', () => {
    const client1 = SpatialWorkerClient.getInstance();
    const client2 = SpatialWorkerClient.getInstance();
    expect(client1).toBe(client2);
    expect(typeof client1.runBuffer).toBe('function');
    expect(typeof client1.runIntersect).toBe('function');
  });

  it('2. should execute buffer analysis asynchronously via createBufferAsync', async () => {
    const result = await SpatialBufferAnalyzer.createBufferAsync(mockCenterPoint, {
      radius: 5,
      units: 'kilometers',
      overlayGeoJSON: mockTargetPOIs,
      overlayLayerName: 'Fasilitas Transportasi'
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.features.length).toBe(1);
    expect(result.data?.features[0].geometry.type).toBe('Polygon');
    expect(result.areaKm2).toBeGreaterThan(70);
    expect(result.areaKm2).toBeLessThan(85);

    // Verify intersection
    expect(result.intersection).toBeDefined();
    expect(result.intersection?.totalTargetFeatures).toBe(2);
    expect(result.intersection?.insideCount).toBe(1); // Only Gambir
    expect(result.intersection?.insideFeatures.features[0].properties?.name).toBe('Stasiun Gambir');
  });

  it('3. should support higher feature counts in createBufferAsync without truncation', async () => {
    // Generate 1200 points
    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < 1200; i++) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [106.8 + (i * 0.0001), -6.2 + (i * 0.0001)]
        },
        properties: { id: i }
      });
    }

    const largeFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features
    };

    const res = await SpatialBufferAnalyzer.createBufferAsync(largeFC, {
      radius: 1,
      units: 'kilometers',
      maxFeatures: 3000
    });

    expect(res.success).toBe(true);
    // Should process all 1200 features without capping at 1000
    expect(res.data?.features.length).toBe(1200);
    expect(res.warning).toBeUndefined();
  });

  it('4. should execute spatial overlay analysis asynchronously via overlayAsync', async () => {
    const polyA: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [106.8, -6.2],
                [106.9, -6.2],
                [106.9, -6.1],
                [106.8, -6.1],
                [106.8, -6.2]
              ]
            ]
          },
          properties: { name: 'Area A' }
        }
      ]
    };

    const polyB: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [106.85, -6.25],
                [106.95, -6.25],
                [106.95, -6.15],
                [106.85, -6.15],
                [106.85, -6.25]
              ]
            ]
          },
          properties: { name: 'Area B' }
        }
      ]
    };

    const res = await SpatialIntersectAnalyzer.overlayAsync(polyA, polyB, {
      mode: 'intersect',
      layerAName: 'Zonasi Lindung',
      layerBName: 'Konsesi Lahan'
    });

    expect(res.success).toBe(true);
    expect(res.mode).toBe('intersect');
    expect(res.intersectedCount).toBe(1);
    expect(res.intersectedAreaKm2).toBeGreaterThan(0);
  });

  it('5. should handle simulated Web Worker communication and message exchange', async () => {
    let workerMessageHandler: ((e: MessageEvent) => void) | null = null;
    const mockWorker = {
      postMessage: vi.fn((data: any) => {
        // Echo back success result through mock
        setTimeout(() => {
          if (workerMessageHandler) {
            workerMessageHandler({
              data: {
                id: data.id,
                success: true,
                result: { success: true, data: { type: 'FeatureCollection', features: [] }, areaKm2: 42 }
              }
            } as MessageEvent);
          }
        }, 10);
      }),
      terminate: vi.fn(),
      set onmessage(handler: any) {
        workerMessageHandler = handler;
      },
      get onmessage() {
        return workerMessageHandler;
      },
      onerror: null
    };

    const client = SpatialWorkerClient.getInstance();
    // Inject mock worker via setWorkerForTesting
    client.setWorkerForTesting(mockWorker);

    const result = await client.runBuffer(mockCenterPoint, { radius: 2 });
    expect(result.success).toBe(true);
    expect(result.areaKm2).toBe(42);
    expect(mockWorker.postMessage).toHaveBeenCalled();

    // Clean up
    client.setWorkerForTesting(null);
  });
});
