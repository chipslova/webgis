// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { parseShapefileZip } from '../src/utils/shapefile-parser';

// Mock shpjs
vi.mock('shpjs', () => {
  return {
    default: vi.fn().mockImplementation((buffer: ArrayBuffer) => {
      const view = new Uint8Array(buffer);
      // If empty buffer or magic error trigger
      if (view.length === 0) {
        throw new Error('Invalid zip data');
      }

      // If view[0] === 1, simulate single shapefile
      if (view[0] === 1) {
        return Promise.resolve({
          type: 'FeatureCollection',
          fileName: 'batas_provinsi',
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
              properties: {
                KODE_PROV: '31',
                PROVINSI: 'DKI JAKARTA',
                LUAS_KM2: 664.01
              }
            }
          ]
        });
      }

      // If view[0] === 2, simulate multiple shapefiles in one zip
      if (view[0] === 2) {
        return Promise.resolve([
          {
            type: 'FeatureCollection',
            fileName: 'jalan_arteri',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [106.82, -6.17],
                    [106.83, -6.18]
                  ]
                },
                properties: { NAMA_JALAN: 'Jl. M.H. Thamrin', KELAS: 'Arteri Primer' }
              }
            ]
          },
          {
            type: 'FeatureCollection',
            fileName: 'kantor_pemerintah',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [106.827, -6.175]
                },
                properties: { NAMA_OBJEK: 'Monumen Nasional (Monas)', TIPE: 'Cagar Budaya' }
              }
            ]
          }
        ]);
      }

      // Default mock fallback
      return Promise.resolve({
        type: 'FeatureCollection',
        fileName: 'sample_shp',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [110.36, -7.79] },
            properties: { KOTA: 'Yogyakarta' }
          }
        ]
      });
    })
  };
});

describe('Shapefile (.zip) Client-Side Importer', () => {
  const createMockMap = () => ({
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    getStyle: vi.fn().mockReturnValue({ version: 8 }),
    getZoom: vi.fn().mockReturnValue(10),
    getCenter: vi.fn().mockReturnValue({ lng: 106.8, lat: -6.2 }),
    getPitch: vi.fn().mockReturnValue(0),
    getBearing: vi.fn().mockReturnValue(0),
    getLayer: vi.fn().mockReturnValue(null),
    getSource: vi.fn().mockReturnValue(null),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    fitBounds: vi.fn(),
    getCanvas: vi.fn().mockReturnValue({ style: {} })
  });

  it('should parse single Shapefile from zip buffer correctly via parseShapefileZip', async () => {
    const buffer = new Uint8Array([1, 0, 0, 0]).buffer;
    const res = await parseShapefileZip(buffer, 'dki_jakarta.zip');

    expect(res.success).toBe(true);
    expect(res.layers).toBeDefined();
    expect(res.layers?.length).toBe(1);
    expect(res.layers?.[0].fileName).toBe('batas_provinsi');
    expect(res.layers?.[0].featureCount).toBe(1);
    expect(res.layers?.[0].geojson.features[0].properties?.PROVINSI).toBe('DKI JAKARTA');
  });

  it('should parse multi-layer Shapefile archives containing multiple layers', async () => {
    const buffer = new Uint8Array([2, 0, 0, 0]).buffer;
    const res = await parseShapefileZip(buffer, 'infrastruktur_jakarta.zip');

    expect(res.success).toBe(true);
    expect(res.layers?.length).toBe(2);
    expect(res.layers?.[0].fileName).toBe('jalan_arteri');
    expect(res.layers?.[1].fileName).toBe('kantor_pemerintah');
    expect(res.layers?.[0].geojson.features[0].geometry.type).toBe('LineString');
    expect(res.layers?.[1].geojson.features[0].geometry.type).toBe('Point');
  });

  it('should handle corrupt or invalid zip files gracefully without throwing unhandled exceptions', async () => {
    const emptyBuffer = new Uint8Array([]).buffer;
    const res = await parseShapefileZip(emptyBuffer, 'corrupt.zip');

    expect(res.success).toBe(false);
    expect(res.error).toContain('Gagal membaca Shapefile .zip');
  });

  it('should add Shapefile layers to GeoJsonLoader and register in customLayers with proper geometry types', async () => {
    const mockMap: any = createMockMap();
    const loader = new GeoJsonLoader(mockMap);

    const buffer = new Uint8Array([1, 0, 0, 0]).buffer;
    const result = await loader.loadFromZipBuffer('tata_ruang.zip', buffer, '#10b981');

    expect(result.success).toBe(true);
    expect(result.layersCreated?.length).toBe(1);
    expect(result.totalFeatures).toBe(1);

    const customLayers = loader.getCustomLayers();
    expect(customLayers.length).toBe(1);
    expect(customLayers[0].name).toBe('batas_provinsi');
    expect(customLayers[0].type).toBe('polygon');
    expect(customLayers[0].color).toBe('#10b981');
    expect(customLayers[0].featureCount).toBe(1);

    // Verify map layers were attached
    expect(mockMap.addSource).toHaveBeenCalledWith(
      expect.stringContaining('source-layer-shp-'),
      expect.objectContaining({ type: 'geojson' })
    );
    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fill' })
    );
  });

  it('should import multi-layer Shapefile zip and create multiple distinct layers in GeoJsonLoader', async () => {
    const mockMap: any = createMockMap();
    const loader = new GeoJsonLoader(mockMap);

    const buffer = new Uint8Array([2, 0, 0, 0]).buffer;
    const result = await loader.loadFromZipBuffer('jakarta_multi.zip', buffer);

    expect(result.success).toBe(true);
    expect(result.layersCreated?.length).toBe(2);
    expect(result.totalFeatures).toBe(2);

    const customLayers = loader.getCustomLayers();
    expect(customLayers.length).toBe(2);
    expect(customLayers.some(l => l.name === 'jalan_arteri' && l.type === 'line')).toBe(true);
    expect(customLayers.some(l => l.name === 'kantor_pemerintah' && l.type === 'point')).toBe(true);
  });
});
