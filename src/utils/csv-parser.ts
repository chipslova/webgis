// Spatial CSV / TSV Parser to GeoJSON FeatureCollection (Zero External Dependencies)
// Automatically detects delimiters (comma, semicolon, tab, pipe) and Lat/Lon column names

export interface CSVParseOptions {
  latCol?: string;
  lonCol?: string;
  delimiter?: string;
}

export interface CSVParseResult {
  success: boolean;
  data?: GeoJSON.FeatureCollection;
  error?: string;
  detectedColumns?: {
    lat: string;
    lon: string;
    delimiter: string;
  };
  totalRows?: number;
  importedCount?: number;
  skippedCount?: number;
}

const LAT_ALIASES = [
  'lat',
  'latitude',
  'lintang',
  'y',
  'koordinat_y',
  'koordinat y',
  'coord_y',
  'coord y',
  'geo_lat',
  'point_y',
  'dec_lat',
  'dec_latitude'
];

const LON_ALIASES = [
  'lon',
  'lng',
  'long',
  'longitude',
  'bujur',
  'x',
  'koordinat_x',
  'koordinat x',
  'coord_x',
  'coord x',
  'geo_lon',
  'geo_lng',
  'point_x',
  'dec_lon',
  'dec_long',
  'dec_longitude'
];

/**
 * Detects the most probable delimiter in CSV/TSV text (, ; \t |)
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0] || '';
  const counts: Record<string, number> = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length
  };

  let maxDelim = ',';
  let maxCount = 0;

  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxDelim = delim;
    }
  }

  return maxDelim;
}

/**
 * Robust RFC 4180 CSV parser supporting quoted cells and escaped quotes
 */
export function parseCSVRows(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const sanitized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    const nextChar = sanitized[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Flush remaining cell/row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Automatically identifies Lat and Lon column indices from header array
 */
export function detectLatLonColumns(headers: string[]): {
  latCol?: string;
  lonCol?: string;
  latIndex: number;
  lonIndex: number;
} {
  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '_').trim()
  );

  let latIndex = -1;
  let lonIndex = -1;

  // 1. Exact or startsWith alias matching
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const norm = normalizedHeaders[i];
    if (latIndex === -1 && LAT_ALIASES.some((alias) => norm === alias || norm.startsWith(`${alias}_`))) {
      latIndex = i;
    }
    if (lonIndex === -1 && LON_ALIASES.some((alias) => norm === alias || norm.startsWith(`${alias}_`))) {
      lonIndex = i;
    }
  }

  // 2. Loose fallback (includes alias substring)
  if (latIndex === -1) {
    latIndex = normalizedHeaders.findIndex((h) => h.includes('lat') || h.includes('lintang'));
  }
  if (lonIndex === -1) {
    lonIndex = normalizedHeaders.findIndex((h) => h.includes('lon') || h.includes('lng') || h.includes('bujur'));
  }

  return {
    latCol: latIndex !== -1 ? headers[latIndex] : undefined,
    lonCol: lonIndex !== -1 ? headers[lonIndex] : undefined,
    latIndex,
    lonIndex
  };
}

/**
 * Parses CSV/TSV text into a GeoJSON Point FeatureCollection
 */
export function parseCSVToGeoJSON(csvText: string, options?: CSVParseOptions): CSVParseResult {
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return { success: false, error: 'Konten file CSV/TSV kosong.' };
  }

  const delimiter = options?.delimiter || detectDelimiter(csvText);
  const rows = parseCSVRows(csvText, delimiter);

  if (rows.length < 2) {
    return { success: false, error: 'CSV file must contain at least a header row and 1 data row.' };
  }

  const headers = rows[0];
  let latIndex = -1;
  let lonIndex = -1;
  let latColName = options?.latCol;
  let lonColName = options?.lonCol;

  if (latColName) {
    latIndex = headers.findIndex((h) => h.toLowerCase() === latColName!.toLowerCase());
  }
  if (lonColName) {
    lonIndex = headers.findIndex((h) => h.toLowerCase() === lonColName!.toLowerCase());
  }

  if (latIndex === -1 || lonIndex === -1) {
    const detected = detectLatLonColumns(headers);
    if (latIndex === -1) latIndex = detected.latIndex;
    if (lonIndex === -1) lonIndex = detected.lonIndex;
    latColName = detected.latCol;
    lonColName = detected.lonCol;
  }

  if (latIndex === -1 || lonIndex === -1) {
    return {
      success: false,
      error: `Coordinate columns not found. Ensure CSV contains latitude (lat/latitude/y) and longitude (lon/lng/longitude/x) columns. Detected columns: ${headers.join(', ')}`
    };
  }

  const features: GeoJSON.Feature[] = [];
  let skippedCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || row.every((val) => val === '')) {
      skippedCount++;
      continue;
    }

    const rawLat = (row[latIndex] || '').replace(',', '.'); // Handle European decimal comma
    const rawLon = (row[lonIndex] || '').replace(',', '.');

    const lat = parseFloat(rawLat);
    const lon = parseFloat(rawLon);

    // Validate coordinates
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skippedCount++;
      continue;
    }

    const properties: Record<string, any> = {};
    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c] || `col_${c + 1}`;
      const cellVal = row[c] ?? '';

      // Auto-cast number if clean numeric
      if (cellVal !== '' && !isNaN(Number(cellVal)) && !cellVal.startsWith('0') && cellVal.length < 15) {
        properties[headerKey] = Number(cellVal);
      } else {
        properties[headerKey] = cellVal;
      }
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      properties
    });
  }

  if (features.length === 0) {
    return {
      success: false,
      error: 'No rows with valid Latitude/Longitude coordinates found in this CSV file.'
    };
  }

  return {
    success: true,
    data: {
      type: 'FeatureCollection',
      features
    },
    detectedColumns: {
      lat: latColName || headers[latIndex],
      lon: lonColName || headers[lonIndex],
      delimiter
    },
    totalRows: rows.length - 1,
    importedCount: features.length,
    skippedCount
  };
}
