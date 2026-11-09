import { logger } from './logger';
import {
  initIndonesianProjections,
  hasProjectedFeatures,
  guessIndonesianProjection,
  reprojectGeoJSON
} from './projections';

export interface ParsedShapefileResult {
  fileName: string;
  geojson: GeoJSON.FeatureCollection;
  featureCount: number;
  reprojected?: boolean;
  detectedProjection?: string;
}

/**
 * Parses an ESRI Shapefile (.zip containing .shp, .dbf, .shx, .prj) into GeoJSON FeatureCollections.
 * Dynamically imports 'shpjs' so that the shapefile library is lazily loaded only when requested.
 * Automatically initializes Indonesian projections (UTM Zones 46S-54S, DGN95, BPN TM-3°)
 * and safely reprojects any non-WGS84 planar coordinates.
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
    // 1. Ensure Indonesian and national projections are registered in proj4 before parsing
    initIndonesianProjections();

    const shpModule = await import('shpjs');
    const shp = (shpModule as any).default || shpModule;

    const parsed = await shp(buffer);

    const rawResults: ParsedShapefileResult[] = [];

    if (Array.isArray(parsed)) {
      parsed.forEach((fc: any, index: number) => {
        if (fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
          const subName = fc.fileName || `${baseZipName.replace(/\.zip$/i, '')}_${index + 1}`;
          rawResults.push({
            fileName: subName,
            geojson: fc,
            featureCount: fc.features.length
          });
        }
      });
    } else if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
      const name = (parsed as any).fileName || baseZipName.replace(/\.zip$/i, '');
      rawResults.push({
        fileName: name,
        geojson: parsed,
        featureCount: parsed.features.length
      });
    }

    if (rawResults.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan data geometri Shapefile yang valid di dalam berkas .zip.'
      };
    }

    // 2. Post-processing: verify coordinate bounds and perform fallback reprojection if necessary
    const results: ParsedShapefileResult[] = rawResults.map((item) => {
      if (hasProjectedFeatures(item.geojson)) {
        // Find a representative sample coordinate
        let sampleCoord: [number, number] | null = null;
        for (const feat of item.geojson.features) {
          if (feat && feat.geometry && (feat.geometry as any).coordinates) {
            const coords = (feat.geometry as any).coordinates;
            const extractFirst = (c: any): [number, number] | null => {
              if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
                return [c[0], c[1]];
              }
              if (Array.isArray(c) && c.length > 0) {
                return extractFirst(c[0]);
              }
              return null;
            };
            sampleCoord = extractFirst(coords);
            if (sampleCoord && (Math.abs(sampleCoord[0]) > 180 || Math.abs(sampleCoord[1]) > 90)) {
              break;
            }
          }
        }

        if (sampleCoord) {
          const guessedProj = guessIndonesianProjection(sampleCoord);
          if (guessedProj) {
            logger.info(`[ShapefileParser] Layer "${item.fileName}" has projected coordinates. Auto-reprojecting from ${guessedProj} to WGS84.`);
            const reprojected = reprojectGeoJSON(item.geojson, guessedProj, 'WGS84');
            return {
              ...item,
              geojson: reprojected,
              reprojected: true,
              detectedProjection: guessedProj
            };
          }
        }
      }

      return item;
    });

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
