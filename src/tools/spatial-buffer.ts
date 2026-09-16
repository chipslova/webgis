import { buffer } from '@turf/buffer';
import { area } from '@turf/area';
import { logger } from '../utils/logger';

export interface BufferOptions {
  radius: number; // e.g. 500, 1000, 5000
  units?: 'meters' | 'kilometers' | 'miles';
  steps?: number;
}

export class SpatialBufferAnalyzer {
  /**
   * Generates geodesic buffer polygon FeatureCollection from source GeoJSON
   */
  public static createBuffer(
    sourceGeoJSON: GeoJSON.FeatureCollection,
    options: BufferOptions
  ): { success: boolean; data?: GeoJSON.FeatureCollection; error?: string; areaKm2?: number } {
    if (!sourceGeoJSON || !sourceGeoJSON.features || sourceGeoJSON.features.length === 0) {
      return { success: false, error: 'Source layer contains no valid features to buffer.' };
    }

    try {
      const units = options.units || 'kilometers';
      const radius = options.radius;
      const steps = options.steps || 32;

      const bufferFeatures: GeoJSON.Feature[] = [];

      for (let i = 0; i < sourceGeoJSON.features.length; i++) {
        const feat = sourceGeoJSON.features[i];
        if (!feat || !feat.geometry) continue;

        const buffered = buffer(feat, radius, { units, steps });
        if (buffered) {
          const origName = feat.properties?.name || `Feature #${i + 1}`;
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
        return { success: false, error: 'Failed to generate buffer geometry from the selected layer.' };
      }

      const resultFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: bufferFeatures
      };

      const totalArea = area(resultFC) / 1_000_000;

      return {
        success: true,
        data: resultFC,
        areaKm2: Number(totalArea.toFixed(3))
      };
    } catch (err: any) {
      logger.error('[SpatialBuffer] Error creating buffer:', err);
      return {
        success: false,
        error: `Failed to process buffer analysis: ${err?.message || 'Spatial calculation error'}`
      };
    }
  }
}
