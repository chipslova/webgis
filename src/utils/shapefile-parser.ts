import { logger } from './logger';

export interface ParsedShapefileResult {
  fileName: string;
  geojson: GeoJSON.FeatureCollection;
  featureCount: number;
}

/**
 * Parses an ESRI Shapefile (.zip containing .shp, .dbf, .shx, .prj) into GeoJSON FeatureCollections.
 * Dynamically imports 'shpjs' so that the shapefile library is lazily loaded only when requested.
 */
export async function parseShapefileZip(
  buffer: ArrayBuffer,
  baseZipName: string = 'shapefile'
): Promise<{
  success: boolean;
  layers?: ParsedShapefileResult[];
  error?: string;
}> {
  try {
    const shpModule = await import('shpjs');
    const shp = (shpModule as any).default || shpModule;

    const parsed = await shp(buffer);

    const results: ParsedShapefileResult[] = [];

    if (Array.isArray(parsed)) {
      parsed.forEach((fc: any, index: number) => {
        if (fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
          const subName = fc.fileName || `${baseZipName.replace(/\.zip$/i, '')}_${index + 1}`;
          results.push({
            fileName: subName,
            geojson: fc,
            featureCount: fc.features.length
          });
        }
      });
    } else if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
      const name = (parsed as any).fileName || baseZipName.replace(/\.zip$/i, '');
      results.push({
        fileName: name,
        geojson: parsed,
        featureCount: parsed.features.length
      });
    }

    if (results.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan data geometri Shapefile yang valid di dalam berkas .zip.'
      };
    }

    return {
      success: true,
      layers: results
    };
  } catch (err: any) {
    logger.error('[ShapefileParser] Error parsing zip buffer:', err);
    return {
      success: false,
      error: `Gagal membaca Shapefile .zip: ${err?.message || 'Format arsip zip tidak valid'}`
    };
  }
}
