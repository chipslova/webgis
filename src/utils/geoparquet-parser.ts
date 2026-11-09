// GeoParquet and Parquet Spatial Data Parser to GeoJSON FeatureCollection
import { parquetReadObjects } from 'hyparquet';
import { parseWKBToGeoJSON } from './wkb-parser';
import { detectLatLonColumns, CLASS_ALIASES } from './csv-parser';
import { guessIndonesianProjection, reprojectGeoJSON } from './projections';

export interface GeoParquetParseOptions {
  geomCol?: string;
  latCol?: string;
  lonCol?: string;
  classCol?: string;
  targetCrs?: string;
}

export interface GeoParquetParseResult {
  success: boolean;
  data?: GeoJSON.FeatureCollection;
  error?: string;
  columns: string[];
  previewRows: Record<string, any>[];
  detectedColumns?: {
    geometry?: string;
    lat?: string;
    lon?: string;
    classCol?: string;
  };
  needsMapping?: boolean;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
}

export async function parseGeoParquetToGeoJSON(
  data: ArrayBuffer | Uint8Array,
  options?: GeoParquetParseOptions
): Promise<GeoParquetParseResult> {
  try {
    const arrayBuffer = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer : data;

    const rows = await parquetReadObjects({ file: arrayBuffer });
    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: 'Berkas Parquet kosong atau tidak memiliki baris data.',
        columns: [],
        previewRows: [],
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0
      };
    }

    // Extract column keys
    const colSet = new Set<string>();
    rows.slice(0, 10).forEach((r: any) => {
      if (r && typeof r === 'object') {
        Object.keys(r).forEach((k) => colSet.add(k));
      }
    });
    const columns = Array.from(colSet);

    // Sanitize preview rows for JSON display (remove Uint8Array raw bytes)
    const previewRows = rows.slice(0, 5).map((r: any) => {
      const sanitized: Record<string, any> = {};
      for (const [k, v] of Object.entries(r || {})) {
        if (v instanceof Uint8Array) {
          sanitized[k] = `[Binary WKB: ${v.byteLength} bytes]`;
        } else {
          sanitized[k] = v;
        }
      }
      return sanitized;
    });

    // Detect Geometry column (GeoParquet standard specifies 'geometry')
    const GEOM_NAMES = ['geometry', 'geom', 'wkb_geometry', 'the_geom', 'shape'];
    let geomCol = options?.geomCol;
    if (!geomCol) {
      geomCol = columns.find((c) => GEOM_NAMES.includes(c.toLowerCase()));
    }

    // Detect Lat/Lon if not geomCol
    let latCol = options?.latCol;
    let lonCol = options?.lonCol;
    let classCol = options?.classCol;

    if (!geomCol && (!latCol || !lonCol)) {
      const detected = detectLatLonColumns(columns);
      if (!latCol && detected.latCol) latCol = detected.latCol;
      if (!lonCol && detected.lonCol) lonCol = detected.lonCol;
    }

    // Detect class column
    if (!classCol) {
      const lowerCols = columns.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '_').trim());
      for (let i = 0; i < lowerCols.length; i++) {
        if (CLASS_ALIASES.some((a) => lowerCols[i] === a || lowerCols[i].startsWith(`${a}_`))) {
          classCol = columns[i];
          break;
        }
      }
    }

    if (!geomCol && (!latCol || !lonCol)) {
      return {
        success: false,
        needsMapping: true,
        error: 'Kolom geometri atau koordinat spasial tidak terdeteksi otomatis pada berkas Parquet.',
        columns,
        previewRows,
        detectedColumns: {
          geometry: geomCol,
          lat: latCol,
          lon: lonCol,
          classCol
        },
        totalRows: rows.length,
        importedCount: 0,
        skippedCount: rows.length
      };
    }

    const features: GeoJSON.Feature[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, any>;
      let geometry: GeoJSON.Geometry | null = null;

      // Extract geometry from WKB / geometry column
      if (geomCol && row[geomCol]) {
        const rawGeom = row[geomCol];
        if (rawGeom && typeof rawGeom === 'object' && 'type' in rawGeom && 'coordinates' in rawGeom) {
          geometry = rawGeom as GeoJSON.Geometry;
        } else if (rawGeom instanceof Uint8Array || rawGeom instanceof ArrayBuffer) {
          geometry = parseWKBToGeoJSON(rawGeom);
        } else if (typeof rawGeom === 'string' && /^[0-9a-fA-F]+$/.test(rawGeom) && rawGeom.length >= 10) {
          // Hex-encoded WKB
          const byteLen = rawGeom.length / 2;
          const u8 = new Uint8Array(byteLen);
          for (let b = 0; b < byteLen; b++) {
            u8[b] = parseInt(rawGeom.substr(b * 2, 2), 16);
          }
          geometry = parseWKBToGeoJSON(u8);
        }
      }

      // Fallback: extract from lat / lon columns
      if (!geometry && latCol && lonCol) {
        const rawLat = row[latCol];
        const rawLon = row[lonCol];
        const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat).replace(',', '.'));
        const lon = typeof rawLon === 'number' ? rawLon : parseFloat(String(rawLon).replace(',', '.'));

        if (!isNaN(lat) && !isNaN(lon)) {
          let finalLat = lat;
          let finalLon = lon;
          if (Math.abs(lat) > 90 && Math.abs(lon) <= 90 && Math.abs(lat) <= 180) {
            finalLat = lon;
            finalLon = lat;
          }
          geometry = {
            type: 'Point',
            coordinates: [finalLon, finalLat]
          };
        }
      }

      if (!geometry) {
        skipped++;
        continue;
      }

      // Build properties without heavy raw binary geometry buffers
      const properties: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === geomCol) continue;
        if (v instanceof Uint8Array) continue;
        properties[k] = v;
      }

      features.push({
        type: 'Feature',
        geometry,
        properties
      });
    }

    if (features.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan geometri yang valid dalam berkas Parquet.',
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

    // Check reprojection if first point is projected
    const firstGeom = features[0].geometry;
    let isProjected = false;
    let sampleCoord: [number, number] | null = null;
    if (firstGeom.type === 'Point') {
      sampleCoord = [firstGeom.coordinates[0], firstGeom.coordinates[1]];
      isProjected = Math.abs(sampleCoord[0]) > 180 || Math.abs(sampleCoord[1]) > 90;
    }

    if (isProjected && sampleCoord) {
      const crsCode = options?.targetCrs || guessIndonesianProjection(sampleCoord);
      if (crsCode && crsCode !== 'EPSG:4326') {
        fc = reprojectGeoJSON(fc, crsCode, 'EPSG:4326');
      }
    }

    return {
      success: true,
      data: fc,
      columns,
      previewRows,
      detectedColumns: {
        geometry: geomCol,
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
      error: `Gagal membaca berkas Parquet: ${err?.message || err}`,
      columns: [],
      previewRows: [],
      totalRows: 0,
      importedCount: 0,
      skippedCount: 0
    };
  }
}
