import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelToGeoJSON, exportRowsToExcel } from '../src/utils/excel-parser';

describe('excel-parser', () => {
  function createMockWorkbook(rows: Record<string, any>[], sheetName = 'Sheet1'): Uint8Array {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Uint8Array(buf);
  }

  it('should parse standard lat/lon Excel data into GeoJSON FeatureCollection', () => {
    const mockData = [
      { name: 'Titik A', lat: -6.2, lon: 106.8, class: 'Hutan' },
      { name: 'Titik B', lat: -6.9, lon: 107.6, class: 'Sawah' }
    ];
    const buffer = createMockWorkbook(mockData);
    const result = parseExcelToGeoJSON(buffer);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.features.length).toBe(2);
    expect(result.data?.features[0].geometry.type).toBe('Point');
    expect((result.data?.features[0].geometry as GeoJSON.Point).coordinates).toEqual([106.8, -6.2]);
    expect(result.detectedColumns?.lat).toBe('lat');
    expect(result.detectedColumns?.lon).toBe('lon');
    expect(result.detectedColumns?.classCol).toBe('class');
  });

  it('should detect Indonesian headers lintang/bujur', () => {
    const mockData = [
      { nama: 'Plot 1', lintang: -7.25, bujur: 112.75, tutupan: 'Permukiman' }
    ];
    const buffer = createMockWorkbook(mockData);
    const result = parseExcelToGeoJSON(buffer);

    expect(result.success).toBe(true);
    expect(result.data?.features.length).toBe(1);
    expect((result.data?.features[0].geometry as GeoJSON.Point).coordinates).toEqual([112.75, -7.25]);
    expect(result.detectedColumns?.lat).toBe('lintang');
    expect(result.detectedColumns?.lon).toBe('bujur');
  });

  it('should mark needsMapping when columns are unknown and no options are given', () => {
    const mockData = [
      { nama_tempat: 'Pos A', nilai_a: 100, nilai_b: 200, label: 'Kategori 1' }
    ];
    const buffer = createMockWorkbook(mockData);
    const result = parseExcelToGeoJSON(buffer);

    expect(result.success).toBe(false);
    expect(result.needsMapping).toBe(true);
    expect(result.columns).toContain('nilai_a');
    expect(result.columns).toContain('nilai_b');
  });

  it('should parse successfully when manual column options are provided for unknown columns', () => {
    const mockData = [
      { nama_tempat: 'Pos A', nilai_y: -6.5, nilai_x: 106.5, label: 'Kategori 1' }
    ];
    const buffer = createMockWorkbook(mockData);
    const result = parseExcelToGeoJSON(buffer, {
      latCol: 'nilai_y',
      lonCol: 'nilai_x'
    });

    expect(result.success).toBe(true);
    expect(result.data?.features.length).toBe(1);
    expect((result.data?.features[0].geometry as GeoJSON.Point).coordinates).toEqual([106.5, -6.5]);
  });

  it('should export rows to Excel (.xlsx) buffer and allow re-parsing', () => {
    const rows = [
      { id: 1, class_id: 1, class_name: 'Air', lat: -5.0, lon: 105.0 }
    ];
    const exportedBytes = exportRowsToExcel(rows, 'GroundTruth');
    expect(exportedBytes).toBeInstanceOf(Uint8Array);
    expect(exportedBytes.length).toBeGreaterThan(0);

    const reparse = parseExcelToGeoJSON(exportedBytes);
    expect(reparse.success).toBe(true);
    expect(reparse.data?.features.length).toBe(1);
    expect((reparse.data?.features[0].geometry as GeoJSON.Point).coordinates).toEqual([105.0, -5.0]);
  });
});
