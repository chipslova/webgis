import proj4 from 'proj4';
import { logger } from './logger';

let projectionsInitialized = false;

/**
 * Initializes and registers Indonesian projection systems into proj4:
 * 1. DGN95 / UTM Zones 46S - 54S (EPSG: 23866 - 23874)
 * 2. DGN95 / UTM Zones 46N - 52N (EPSG: 23886 - 23892)
 * 3. WGS 84 / UTM Zones 46S - 54S (EPSG: 32746 - 32754)
 * 4. WGS 84 / UTM Zones 46N - 52N (EPSG: 32646 - 32652)
 * 5. DGN95 / Indonesia TM-3° Zones (BPN Standards, EPSG: 23830 - 23846)
 * 6. Common ESRI WKT Names (DGN_1995_UTM_Zone_*, WGS_1984_UTM_Zone_*)
 */
export function initIndonesianProjections(): void {
  if (projectionsInitialized) return;

  try {
    // 1. DGN95 / UTM Southern Hemisphere (EPSG: 23866 - 23874)
    const southUtmZones = [46, 47, 48, 49, 50, 51, 52, 53, 54];
    southUtmZones.forEach((zone) => {
      const epsgCode = 23866 + (zone - 46);
      const wgsCode = 32700 + zone;
      const projDef = `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;

      proj4.defs(`EPSG:${epsgCode}`, projDef);
      proj4.defs(`EPSG:${wgsCode}`, projDef);
      proj4.defs(`DGN_1995_UTM_Zone_${zone}S`, projDef);
      proj4.defs(`DGN95 / UTM zone ${zone}S`, projDef);
      proj4.defs(`WGS_1984_UTM_Zone_${zone}S`, projDef);
      proj4.defs(`WGS 84 / UTM zone ${zone}S`, projDef);
    });

    // 2. DGN95 / UTM Northern Hemisphere (EPSG: 23886 - 23892)
    const northUtmZones = [46, 47, 48, 49, 50, 51, 52];
    northUtmZones.forEach((zone) => {
      const epsgCode = 23886 + (zone - 46);
      const wgsCode = 32600 + zone;
      const projDef = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;

      proj4.defs(`EPSG:${epsgCode}`, projDef);
      proj4.defs(`EPSG:${wgsCode}`, projDef);
      proj4.defs(`DGN_1995_UTM_Zone_${zone}N`, projDef);
      proj4.defs(`DGN95 / UTM zone ${zone}N`, projDef);
      proj4.defs(`WGS_1984_UTM_Zone_${zone}N`, projDef);
      proj4.defs(`WGS 84 / UTM zone ${zone}N`, projDef);
    });

    // 3. DGN95 / Indonesia TM-3° (Badan Pertanahan Nasional / BPN)
    // 3-degree Transverse Mercator with False Easting 200,000, False Northing 1,500,000, k0 = 0.9999
    const tm3Defs: Array<{ zone: string; cm: number; epsg: number }> = [
      { zone: '46.2', cm: 94.5, epsg: 23831 },
      { zone: '47.1', cm: 97.5, epsg: 23832 },
      { zone: '47.2', cm: 100.5, epsg: 23833 },
      { zone: '48.1', cm: 103.5, epsg: 23834 },
      { zone: '48.2', cm: 106.5, epsg: 23835 }, // Jakarta, Jabar, Banten
      { zone: '49.1', cm: 109.5, epsg: 23836 }, // Jateng
      { zone: '49.2', cm: 112.5, epsg: 23837 }, // Jatim
      { zone: '50.1', cm: 115.5, epsg: 23838 }, // Bali, NTB
      { zone: '50.2', cm: 118.5, epsg: 23839 },
      { zone: '51.1', cm: 121.5, epsg: 23840 },
      { zone: '51.2', cm: 124.5, epsg: 23841 },
      { zone: '52.1', cm: 127.5, epsg: 23842 },
      { zone: '52.2', cm: 130.5, epsg: 23843 },
      { zone: '53.1', cm: 133.5, epsg: 23844 },
      { zone: '53.2', cm: 136.5, epsg: 23845 },
      { zone: '54.1', cm: 139.5, epsg: 23846 }
    ];

    tm3Defs.forEach(({ zone, cm, epsg }) => {
      const projDef = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=0.9999 +x_0=200000 +y_0=1500000 +datum=WGS84 +units=m +no_defs`;
      proj4.defs(`EPSG:${epsg}`, projDef);
      proj4.defs(`DGN95 / Indonesia TM-3 zone ${zone}`, projDef);
      proj4.defs(`DGN_1995_Indonesia_TM-3_Zone_${zone}`, projDef);
      proj4.defs(`TM3_${zone}`, projDef);
    });

    // 4. Web Mercator
    proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');

    projectionsInitialized = true;
    logger.debug('[Projections] Indonesian GIS coordinate definitions initialized in proj4.');
  } catch (err) {
    logger.error('[Projections] Error registering Indonesian projections:', err);
  }
}

// Auto-initialize on module load
initIndonesianProjections();

/**
 * Checks if a GeoJSON or coordinates structure uses projected planar coordinates (exceeding WGS84 degrees [-180, 180], [-90, 90]).
 */
export function isProjectedCoordinates(coords: any): boolean {
  if (!Array.isArray(coords)) return false;

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [x, y] = coords;
    return Math.abs(x) > 180 || Math.abs(y) > 90;
  }

  for (const item of coords) {
    if (isProjectedCoordinates(item)) return true;
  }

  return false;
}

/**
 * Checks whether any geometry in a GeoJSON FeatureCollection exceeds WGS84 degree bounds.
 */
export function hasProjectedFeatures(geojson: GeoJSON.FeatureCollection | GeoJSON.Feature | any): boolean {
  if (!geojson) return false;

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feat of geojson.features) {
      if (feat && feat.geometry && feat.geometry.coordinates) {
        if (isProjectedCoordinates(feat.geometry.coordinates)) return true;
      }
    }
  } else if (geojson.type === 'Feature' && geojson.geometry && geojson.geometry.coordinates) {
    return isProjectedCoordinates(geojson.geometry.coordinates);
  } else if (geojson.coordinates) {
    return isProjectedCoordinates(geojson.coordinates);
  }

  return false;
}

/**
 * Transforms an individual coordinate pair [x, y] from source projection to WGS84 [lon, lat].
 */
export function transformCoordinate(coord: [number, number], fromProj: string, toProj: string = 'WGS84'): [number, number] {
  initIndonesianProjections();
  try {
    const res = proj4(fromProj, toProj, [coord[0], coord[1]]);
    return [Number(res[0].toFixed(7)), Number(res[1].toFixed(7))];
  } catch (err) {
    logger.warn(`[Projections] Failed to transform coordinate [${coord[0]}, ${coord[1]}]:`, err);
    return coord;
  }
}

/**
 * Recursively reprojects coordinates inside a geometry structure.
 */
function reprojectCoords(coords: any, fromProj: string, toProj: string = 'WGS84'): any {
  if (!Array.isArray(coords)) return coords;

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return transformCoordinate([coords[0], coords[1]], fromProj, toProj);
  }

  return coords.map((sub) => reprojectCoords(sub, fromProj, toProj));
}

/**
 * Recursively transforms all geometries in a GeoJSON object from source projection to target projection (defaults to WGS84).
 */
export function reprojectGeoJSON<T = any>(geojson: T, fromProj: string, toProj: string = 'WGS84'): T {
  if (!geojson || typeof geojson !== 'object') return geojson;
  initIndonesianProjections();

  try {
    const clone = JSON.parse(JSON.stringify(geojson));

    if (clone.type === 'FeatureCollection' && Array.isArray(clone.features)) {
      clone.features.forEach((feat: any) => {
        if (feat && feat.geometry && feat.geometry.coordinates) {
          feat.geometry.coordinates = reprojectCoords(feat.geometry.coordinates, fromProj, toProj);
        }
      });
      // Clear or recompute bbox if it existed
      delete clone.bbox;
      return clone;
    }

    if (clone.type === 'Feature' && clone.geometry && clone.geometry.coordinates) {
      clone.geometry.coordinates = reprojectCoords(clone.geometry.coordinates, fromProj, toProj);
      delete clone.bbox;
      return clone;
    }

    if (clone.coordinates) {
      clone.coordinates = reprojectCoords(clone.coordinates, fromProj, toProj);
      delete clone.bbox;
      return clone;
    }

    return clone;
  } catch (err) {
    logger.error('[Projections] Error during reprojectGeoJSON:', err);
    return geojson;
  }
}

/**
 * Guesses the most likely Indonesian projection based on coordinate magnitudes and Indonesian geography:
 * - If Easting ~ 150k-850k and Northing ~ 8.5M - 10M: UTM Southern Hemisphere (Zones 46S - 54S)
 * - Default central zone: EPSG:23868 / UTM Zone 48S (covers Jakarta, West Java, South Sumatra)
 * - If Easting ~ 100k-300k and Northing ~ 1.2M - 1.8M: Indonesia TM-3° (Zone 48.2)
 */
export function guessIndonesianProjection(sampleCoord: [number, number]): string | null {
  const [x, y] = sampleCoord;

  // Indonesian TM-3° coordinate ranges:
  // False Easting is 200,000 (usually 100,000 to 300,000)
  // False Northing is 1,500,000 (usually 500,000 to 2,500,000)
  if (x >= 50000 && x <= 400000 && y >= 500000 && y <= 2500000) {
    return 'EPSG:23835'; // DGN95 / Indonesia TM-3 zone 48.2 (Jakarta/Jabar)
  }

  // Indonesian UTM Southern Hemisphere coordinate ranges:
  // False Easting: 150,000 - 850,000
  // False Northing in Indonesia South of Equator: 8,800,000 - 10,000,000
  if (x >= 100000 && x <= 900000 && y >= 8500000 && y <= 10000000) {
    return 'EPSG:23868'; // DGN95 / UTM Zone 48S (Standard for Western Java / Southern Sumatra)
  }

  // Indonesian UTM Northern Hemisphere (Aceh, Riau, Kalbar Utara, Kaltara, Sulut):
  // False Northing 0 to 600,000
  if (x >= 100000 && x <= 900000 && y >= 0 && y <= 700000) {
    return 'EPSG:23888'; // DGN95 / UTM Zone 48N
  }

  // Web Mercator (EPSG:3857)
  if (Math.abs(x) > 20037508 || Math.abs(y) > 20037508) {
    return null;
  }
  if (Math.abs(x) > 1000000 || Math.abs(y) > 1000000) {
    return 'EPSG:3857';
  }

  return null;
}
