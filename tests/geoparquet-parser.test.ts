import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockParquetReadObjects = vi.fn();

vi.mock('hyparquet', () => ({
  parquetReadObjects: (...args: any[]) => mockParquetReadObjects(...args)
}));

import { parseGeoParquetToGeoJSON } from '../src/utils/geoparquet-parser';

describe('geoparquet-parser', () => {
  beforeEach(() => {
    mockParquetReadObjects.mockReset();
  });

  it('should parse parquet rows with WKB geometry column', async () => {
    // Little endian point [106.8456, -6.2088]
    const wkbPoint = new Uint8Array(21);
    const view = new DataView(wkbPoint.buffer);
    view.setUint8(0, 1);
    view.setUint32(1, 1, true);
    view.setFloat64(5, 106.8456, true);
    view.setFloat64(13, -6.2088, true);

    mockParquetReadObjects.mockResolvedValueOnce([
      { id: 1, geometry: wkbPoint, class_name: 'Hutan', site: 'Java' }
    ]);

    const dummyBuffer = new ArrayBuffer(10);
    const result = await parseGeoParquetToGeoJSON(dummyBuffer);

    expect(result.success).toBe(true);
    expect(result.data?.features.length).toBe(1);
    expect(result.data?.features[0].geometry.type).toBe('Point');
    if (result.data?.features[0].geometry.type === 'Point') {
      expect(result.data.features[0].geometry.coordinates[0]).toBeCloseTo(106.8456);
      expect(result.data.features[0].geometry.coordinates[1]).toBeCloseTo(-6.2088);
    }
    expect(result.data?.features[0].properties?.class_name).toBe('Hutan');
    expect(result.data?.features[0].properties?.geometry).toBeUndefined(); // binary stripped from properties
  });

  it('should parse parquet rows with lat / lon numeric columns', async () => {
    mockParquetReadObjects.mockResolvedValueOnce([
      { id: 10, latitude: -7.25, longitude: 112.75, landcover: 'Permukiman' }
    ]);

    const dummyBuffer = new ArrayBuffer(10);
    const result = await parseGeoParquetToGeoJSON(dummyBuffer);

    expect(result.success).toBe(true);
    expect(result.data?.features.length).toBe(1);
    if (result.data?.features[0].geometry.type === 'Point') {
      expect(result.data.features[0].geometry.coordinates).toEqual([112.75, -7.25]);
    }
    expect(result.detectedColumns?.lat).toBe('latitude');
    expect(result.detectedColumns?.lon).toBe('longitude');
    expect(result.detectedColumns?.classCol).toBe('landcover');
  });

  it('should flag needsMapping if neither geometry nor lat/lon are recognized', async () => {
    mockParquetReadObjects.mockResolvedValueOnce([
      { col_a: 100, col_b: 200, info: 'test' }
    ]);

    const dummyBuffer = new ArrayBuffer(10);
    const result = await parseGeoParquetToGeoJSON(dummyBuffer);

    expect(result.success).toBe(false);
    expect(result.needsMapping).toBe(true);
    expect(result.columns).toContain('col_a');
    expect(result.columns).toContain('col_b');
  });

  it('should handle corrupted buffer or read exception gracefully', async () => {
    mockParquetReadObjects.mockRejectedValueOnce(
      new Error('Parquet magic bytes invalid')
    );

    const dummyBuffer = new ArrayBuffer(10);
    const result = await parseGeoParquetToGeoJSON(dummyBuffer);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Parquet magic bytes invalid');
  });
});
