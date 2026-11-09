// Excel (.xlsx, .xls) Parser and Exporter for Geospatial Data & Training Samples
import * as XLSX from 'xlsx';
import { detectLatLonColumns, CLASS_ALIASES } from './csv-parser';
import { guessIndonesianProjection, reprojectGeoJSON } from './projections';

export interface ExcelParseOptions {
  sheetName?: string;
  latCol?: string;
  lonCol?: string;
  classCol?: string;
  targetCrs?: string;
}

export interface ExcelParseResult {
  success: boolean;
  data?: GeoJSON.FeatureCollection;
  error?: string;
  sheets: string[];
  selectedSheet: string;
  columns: string[];
  previewRows: Record<string, any>[];
  detectedColumns?: {
    lat: string;
    lon: string;
    classCol?: string;
  };
  needsMapping?: boolean;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
}

export function parseExcelToGeoJSON(
  data: ArrayBuffer | Uint8Array,
  options?: ExcelParseOptions
): ExcelParseResult {
  try {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheets = workbook.SheetNames;

    if (!sheets || sheets.length === 0) {
      return {
        success: false,
        error: 'Berkas Excel tidak memiliki sheet yang valid.',
        sheets: [],
        selectedSheet: '',
        columns: [],
        previewRows: [],
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0
      };
    }

    const selectedSheet = options?.sheetName && sheets.includes(options.sheetName)
      ? options.sheetName
      : sheets[0];

    const worksheet = workbook.Sheets[selectedSheet];
    if (!worksheet) {
      return {
        success: false,
        error: `Sheet "${selectedSheet}" tidak ditemukan dalam berkas Excel.`,
        sheets,
        selectedSheet,
        columns: [],
        previewRows: [],
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0
      };
    }

    // Convert sheet to array of objects
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: `Sheet "${selectedSheet}" tidak memiliki baris data.`,
        sheets,
        selectedSheet,
        columns: [],
        previewRows: [],
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0
      };
    }

    // Extract all column headers from first few rows
    const colSet = new Set<string>();
    rows.slice(0, 10).forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
    const columns = Array.from(colSet);
    const previewRows = rows.slice(0, 5);

    // Detect Lat/Lon columns
    let latCol = options?.latCol;
    let lonCol = options?.lonCol;
    let classCol = options?.classCol;

    if (!latCol || !lonCol) {
      const detected = detectLatLonColumns(columns);
      if (!latCol && detected.latCol) latCol = detected.latCol;
      if (!lonCol && detected.lonCol) lonCol = detected.lonCol;
    }

    // Detect class column if not provided
    if (!classCol) {
      const lowerCols = columns.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '_').trim());
      for (let i = 0; i < lowerCols.length; i++) {
        if (CLASS_ALIASES.some((a) => lowerCols[i] === a || lowerCols[i].startsWith(`${a}_`))) {
          classCol = columns[i];
          break;
        }
      }
    }

    // If either lat or lon could not be detected, require manual mapping
    if (!latCol || !lonCol) {
      return {
        success: false,
        needsMapping: true,
        error: 'Kolom koordinat (Lintang/Bujur atau X/Y) tidak terdeteksi otomatis. Silakan petakan kolom secara manual.',
        sheets,
        selectedSheet,
        columns,
        previewRows,
        detectedColumns: {
          lat: latCol || '',
          lon: lonCol || '',
          classCol
        },
        totalRows: rows.length,
        importedCount: 0,
        skippedCount: rows.length
      };
    }

    // Parse features
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawLat = row[latCol];
      const rawLon = row[lonCol];

      const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat).replace(',', '.'));
      const lon = typeof rawLon === 'number' ? rawLon : parseFloat(String(rawLon).replace(',', '.'));

      if (isNaN(lat) || isNaN(lon)) {
        skipped++;
        continue;
      }

      // Check if coordinates need inversion (e.g. user swapped lat/lon)
      let finalLat = lat;
      let finalLon = lon;
      if (Math.abs(lat) > 90 && Math.abs(lon) <= 90 && Math.abs(lat) <= 180) {
        // Swapped lat and lon in decimal degrees
        finalLat = lon;
        finalLon = lat;
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [finalLon, finalLat]
        },
        properties: { ...row }
      });
    }

    if (features.length === 0) {
      return {
        success: false,
        error: `Tidak ada koordinat numerik yang valid pada kolom "${latCol}" dan "${lonCol}".`,
        sheets,
        selectedSheet,
        columns,
        previewRows,
        totalRows: rows.length,
        importedCount: 0,
        skippedCount: skipped
      };
    }

    let fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features
    };

    // Check UTM reprojection if coordinate values exceed normal degree bounds
    const firstCoord = features[0].geometry.coordinates as [number, number];
    const isProjected = Math.abs(firstCoord[0]) > 180 || Math.abs(firstCoord[1]) > 90;

    if (isProjected) {
      const crsCode = options?.targetCrs || guessIndonesianProjection(firstCoord);
      if (crsCode && crsCode !== 'EPSG:4326') {
        fc = reprojectGeoJSON(fc, crsCode, 'EPSG:4326');
      }
    }

    return {
      success: true,
      data: fc,
      sheets,
      selectedSheet,
      columns,
      previewRows,
      detectedColumns: {
        lat: latCol,
        lon: lonCol,
        classCol
      },
      totalRows: rows.length,
      importedCount: features.length,
      skippedCount: skipped
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal membaca berkas Excel: ${err?.message || err}`,
      sheets: [],
      selectedSheet: '',
      columns: [],
      previewRows: [],
      totalRows: 0,
      importedCount: 0,
      skippedCount: 0
    };
  }
}

/**
 * Exports an array of objects to an Excel (.xlsx) file buffer
 */
export function exportRowsToExcel(
  rows: Record<string, any>[],
  sheetName: string = 'Data'
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(buffer);
}
