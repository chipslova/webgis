import * as turf from '@turf/turf';
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
      return { success: false, error: 'Layer sumber tidak memiliki fitur yang valid untuk dibuffer.' };
    }

    try {
      const units = options.units || 'kilometers';
      const radius = options.radius;
      const steps = options.steps || 32;

      const bufferFeatures: GeoJSON.Feature[] = [];

      for (let i = 0; i < sourceGeoJSON.features.length; i++) {
        const feat = sourceGeoJSON.features[i];
        if (!feat || !feat.geometry) continue;

        const buffered = turf.buffer(feat, radius, { units, steps });
        if (buffered) {
          const origName = feat.properties?.name || `Fitur #${i + 1}`;
          const bufferedArea = turf.area(buffered) / 1_000_000; // in km²

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
        return { success: false, error: 'Gagal menghasilkan geometri buffer dari layer yang dipilih.' };
      }

      const resultFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: bufferFeatures
      };

      const totalArea = turf.area(resultFC) / 1_000_000;

      return {
        success: true,
        data: resultFC,
        areaKm2: Number(totalArea.toFixed(3))
      };
    } catch (err: any) {
      logger.error('[SpatialBuffer] Error creating buffer:', err);
      return {
        success: false,
        error: `Gagal memproses analisis buffer: ${err?.message || 'Kesalahan kalkulasi spasial'}`
      };
    }
  }
}
