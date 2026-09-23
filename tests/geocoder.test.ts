// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeocoderTool } from '../src/tools/geocoder';
import * as maplibregl from 'maplibre-gl';

describe('GeocoderTool', () => {
  let mockMap: any;
  let geocoder: GeocoderTool;

  beforeEach(() => {
    mockMap = {
      on: vi.fn(),
      off: vi.fn(),
      loaded: vi.fn().mockReturnValue(true),
      isMoving: vi.fn().mockReturnValue(false),
      isZooming: vi.fn().mockReturnValue(false),
      isRotating: vi.fn().mockReturnValue(false),
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
      _camera: {
        transform: {
          width: 800,
          height: 600,
          center: { lng: 106, lat: -6 },
          zoom: 10,
          pitch: 0,
          bearing: 0,
          isLocationOccluded: vi.fn().mockReturnValue(false),
          getCoveringTilesDetailsProvider: vi.fn().mockReturnValue({ allowWorldCopies: vi.fn().mockReturnValue(false) })
        }
      },
      transform: {
        width: 800,
        height: 600,
        center: { lng: 106, lat: -6 },
        zoom: 10,
        pitch: 0,
        bearing: 0,
        locationPoint: vi.fn().mockReturnValue(new maplibregl.Point(100, 100)),
        isLocationOccluded: vi.fn().mockReturnValue(false),
        getCoveringTilesDetailsProvider: vi.fn().mockReturnValue({ allowWorldCopies: vi.fn().mockReturnValue(false) })
      },
      project: vi.fn().mockReturnValue(new maplibregl.Point(100, 100)),
      getCanvas: vi.fn().mockReturnValue({ style: {} }),
      getCanvasContainer: vi.fn().mockReturnValue(document.createElement('div'))
    };

    geocoder = new GeocoderTool(mockMap);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty results for queries shorter than 2 characters', async () => {
    const res1 = await geocoder.search('');
    const res2 = await geocoder.search('a');
    expect(res1).toEqual([]);
    expect(res2).toEqual([]);
  });

  it('should match local Indonesian landmarks instantly (Jakarta, Bromo, IKN, Bandung)', async () => {
    const resJakarta = await geocoder.search('jakarta');
    expect(resJakarta.length).toBeGreaterThan(0);
    expect(resJakarta[0].display_name).toContain('Jakarta');

    const resBromo = await geocoder.search('bromo');
    expect(resBromo.length).toBeGreaterThan(0);
    expect(resBromo[0].display_name).toContain('Bromo');

    const resIKN = await geocoder.search('ikn');
    expect(resIKN.length).toBeGreaterThan(0);
    expect(resIKN[0].display_name).toContain('IKN Nusantara');
  }, 15000);

  it('should merge remote Nominatim results when available and filter duplicates', async () => {
    const mockNominatimResults = [
      {
        display_name: 'Semarang, Jawa Tengah', // Duplicate with local landmark
        lat: '-6.9667',
        lon: '110.4167',
        type: 'city'
      },
      {
        display_name: 'Candi Borobudur, Magelang, Jawa Tengah', // New unique result
        lat: '-7.6079',
        lon: '110.2038',
        type: 'tourism'
      }
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockNominatimResults
    } as any);

    const results = await geocoder.search('borobudur');
    expect(results.some(r => r.display_name.includes('Borobudur'))).toBe(true);
  });

  it('should gracefully fallback to local matches when network fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const results = await geocoder.search('bandung');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].display_name).toContain('Bandung');
  });

  it('should fitBounds when result has a valid boundingbox', () => {
    const resultWithBBox = {
      display_name: 'Bali (Denpasar, Provinsi Bali)',
      lat: '-8.4095',
      lon: '115.1889',
      boundingbox: ['-8.88', '-8.06', '114.43', '115.71']
    };

    geocoder.flyToResult(resultWithBBox);
    expect(mockMap.fitBounds).toHaveBeenCalledWith(
      [
        [114.43, -8.88],
        [115.71, -8.06]
      ],
      expect.objectContaining({
        padding: 60,
        maxZoom: 15
      })
    );
  });

  it('should flyTo coordinate when result has no boundingbox', () => {
    const resultWithoutBBox = {
      display_name: 'Custom Location',
      lat: '-6.2000',
      lon: '106.8166'
    };

    geocoder.flyToResult(resultWithoutBBox);
    expect(mockMap.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [106.8166, -6.2000],
        zoom: 13
      })
    );
  });

  it('should ignore results with invalid coordinates', () => {
    const invalidResult = {
      display_name: 'Invalid Place',
      lat: 'not-a-number',
      lon: 'not-a-number'
    };

    geocoder.flyToResult(invalidResult);
    expect(mockMap.flyTo).not.toHaveBeenCalled();
    expect(mockMap.fitBounds).not.toHaveBeenCalled();
  });

  it('should clear active marker cleanly', () => {
    const result = {
      display_name: 'Jakarta',
      lat: '-6.1754',
      lon: '106.8272'
    };

    geocoder.flyToResult(result);
    expect(() => geocoder.clear()).not.toThrow();
  });
});
