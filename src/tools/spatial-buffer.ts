import { buffer } from '@turf/buffer';
import { area } from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { logger } from '../utils/logger';

export interface BufferOptions {
  radius: number; // e.g. 1, 5, 10, 25, 50
  units?: 'meters' | 'kilometers' | 'miles';
  steps?: number;
  overlayGeoJSON?: GeoJSON.FeatureCollection;
  overlayLayerName?: string;
}

export interface BufferIntersectionResult {
  targetLayerName: string;
  totalTargetFeatures: number;
  insideCount: number;
  insidePercentage: number;
  insideFeatures: GeoJSON.FeatureCollection;
  featureSummaries: Array<{ name: string; type: string; properties: Record<string, any> }>;
}

export interface BufferAnalysisResult {
  success: boolean;
  data?: GeoJSON.FeatureCollection;
  error?: string;
  areaKm2?: number;
  warning?: string;
  intersection?: BufferIntersectionResult;
}

export class SpatialBufferAnalyzer {
  public static readonly MAX_SAFE_FEATURES = 1000;

  /**
   * Generates geodesic buffer polygon FeatureCollection from source GeoJSON
   * and optionally executes spatial intersection / point-in-polygon against an overlay layer.
   */
  public static createBuffer(
    sourceGeoJSON: GeoJSON.FeatureCollection,
    options: BufferOptions
  ): BufferAnalysisResult {
    if (!sourceGeoJSON || !sourceGeoJSON.features || sourceGeoJSON.features.length === 0) {
      return { success: false, error: 'Lapisan sumber tidak memiliki fitur yang valid untuk dibuat buffer (contains no valid features).' };
    }

    try {
      const units = options.units || 'kilometers';
      const radius = options.radius;
      const steps = options.steps || 32;

      let featuresToProcess = sourceGeoJSON.features;
      let warning: string | undefined;

      // Safeguard: prevent browser freeze on massive vector datasets
      if (featuresToProcess.length > this.MAX_SAFE_FEATURES) {
        warning = `Lapisan memiliki ${featuresToProcess.length} fitur. Demi performa browser, hanya ${this.MAX_SAFE_FEATURES} fitur pertama yang diproses.`;
        logger.warn(`[SpatialBuffer] Large dataset detected: capping at ${this.MAX_SAFE_FEATURES} features.`);
        featuresToProcess = featuresToProcess.slice(0, this.MAX_SAFE_FEATURES);
      }

      const bufferFeatures: GeoJSON.Feature[] = [];

      for (let i = 0; i < featuresToProcess.length; i++) {
        const feat = featuresToProcess[i];
        if (!feat || !feat.geometry) continue;

        const buffered = buffer(feat, radius, { units, steps });
        if (buffered) {
          const origName = feat.properties?.name || feat.properties?.nama || feat.properties?.title || `Fitur #${i + 1}`;
          const bufferedArea = area(buffered) / 1_000_000; // in km²

          buffered.properties = {
            ...(feat.properties || {}),
            buffer_source: origName,
            buffer_radius: `${radius} ${units}`,
            buffer_area_km2: Number(bufferedArea.toFixed(3))
          };

          bufferFeatures.push(buffered);
        }
      }

      if (bufferFeatures.length === 0) {
        return { success: false, error: 'Gagal membuat geometri buffer dari lapisan yang dipilih.' };
      }

      const resultFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: bufferFeatures
      };

      const totalArea = area(resultFC) / 1_000_000;

      // Optional: Spatial Intersection / Overlay Query with a secondary layer
      let intersectionResult: BufferIntersectionResult | undefined;
      if (options.overlayGeoJSON && options.overlayGeoJSON.features && options.overlayGeoJSON.features.length > 0) {
        intersectionResult = this.calculateIntersection(resultFC, options.overlayGeoJSON, options.overlayLayerName || 'Lapisan Overlay');
      }

      return {
        success: true,
        data: resultFC,
        areaKm2: Number(totalArea.toFixed(3)),
        warning,
        intersection: intersectionResult
      };
    } catch (err: any) {
      logger.error('[SpatialBuffer] Error creating buffer:', err);
      return {
        success: false,
        error: `Gagal memproses analisis buffer: ${err?.message || 'Kesalahan kalkulasi spasial'}`
      };
    }
  }

  /**
   * Evaluates which features from an overlay dataset fall within the computed buffer polygons
   */
  public static calculateIntersection(
    bufferFC: GeoJSON.FeatureCollection,
    targetFC: GeoJSON.FeatureCollection,
    targetLayerName: string
  ): BufferIntersectionResult {
    const insideFeatures: GeoJSON.Feature[] = [];
    const featureSummaries: Array<{ name: string; type: string; properties: Record<string, any> }> = [];

    const bufferPolys = bufferFC.features.filter(
      (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    );

    targetFC.features.forEach((targetFeat, idx) => {
      if (!targetFeat || !targetFeat.geometry) return;

      const isInside = this.isFeatureInsideAnyBuffer(targetFeat, bufferPolys);
      if (isInside) {
        insideFeatures.push(targetFeat);

        const name =
          targetFeat.properties?.name ||
          targetFeat.properties?.nama ||
          targetFeat.properties?.title ||
          targetFeat.properties?.label ||
          `Objek #${idx + 1}`;

        if (featureSummaries.length < 50) {
          featureSummaries.push({
            name: String(name),
            type: targetFeat.geometry.type,
            properties: { ...(targetFeat.properties || {}) }
          });
        }
      }
    });

    const totalTarget = targetFC.features.length;
    const insideCount = insideFeatures.length;
    const insidePercentage = totalTarget > 0 ? Number(((insideCount / totalTarget) * 100).toFixed(1)) : 0;

    return {
      targetLayerName,
      totalTargetFeatures: totalTarget,
      insideCount,
      insidePercentage,
      insideFeatures: {
        type: 'FeatureCollection',
        features: insideFeatures
      },
      featureSummaries
    };
  }

  private static isFeatureInsideAnyBuffer(
    feature: GeoJSON.Feature,
    bufferPolys: GeoJSON.Feature[]
  ): boolean {
    const geom = feature.geometry;
    if (!geom) return false;

    // 1. Point: use turf booleanPointInPolygon
    if (geom.type === 'Point') {
      return bufferPolys.some((bufPoly) => {
        try {
          return booleanPointInPolygon(geom.coordinates, bufPoly as any);
        } catch {
          return false;
        }
      });
    }

    // 2. MultiPoint: check if any sub-point is inside
    if (geom.type === 'MultiPoint') {
      return geom.coordinates.some((coord) => {
        return bufferPolys.some((bufPoly) => {
          try {
            return booleanPointInPolygon(coord, bufPoly as any);
          } catch {
            return false;
          }
        });
      });
    }

    // 3. LineString / MultiLineString / Polygon: check sample vertices
    const sampleCoords: number[][] = [];
    if (geom.type === 'LineString') {
      sampleCoords.push(geom.coordinates[0], geom.coordinates[Math.floor(geom.coordinates.length / 2)], geom.coordinates[geom.coordinates.length - 1]);
    } else if (geom.type === 'Polygon' && geom.coordinates[0]) {
      sampleCoords.push(geom.coordinates[0][0], geom.coordinates[0][Math.floor(geom.coordinates[0].length / 2)]);
    }

    if (sampleCoords.length > 0) {
      return sampleCoords.some((coord) => {
        if (!coord) return false;
        return bufferPolys.some((bufPoly) => {
          try {
            return booleanPointInPolygon(coord, bufPoly as any);
          } catch {
            return false;
          }
        });
      });
    }

    return false;
  }
}

