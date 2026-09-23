import { featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { intersect } from '@turf/intersect';
import { area } from '@turf/area';
import { bbox } from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { logger } from '../utils/logger';

export interface IntersectOptions {
  layerAName?: string;
  layerBName?: string;
  maxFeatures?: number;
}

export interface IntersectFeatureSummary {
  name: string;
  type: string;
  layerA: string;
  layerB: string;
  areaKm2?: number;
  properties: Record<string, any>;
}

export interface IntersectAnalysisResult {
  success: boolean;
  error?: string;
  warning?: string;
  data?: GeoJSON.FeatureCollection;
  layerAName: string;
  layerBName: string;
  totalFeatures: number;
  intersectedCount: number;
  intersectedAreaKm2: number;
  intersectedAreaHa: number;
  sourceAAreaKm2: number;
  overlapPercentage: number;
  bbox?: [number, number, number, number];
  featureSummaries: IntersectFeatureSummary[];
}

export class SpatialIntersectAnalyzer {
  public static readonly MAX_SAFE_FEATURES = 1000;

  /**
   * Computes the geometric and topological intersection between Layer A and Layer B.
   * Supports: Polygon-Polygon (Geometric clipping), Polygon-Point, Point-Polygon, and Polygon-Line.
   */
  public static intersect(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): IntersectAnalysisResult {
    const layerAName = options.layerAName || 'Lapisan A';
    const layerBName = options.layerBName || 'Lapisan B';

    if (!layerA || !layerA.features || layerA.features.length === 0) {
      return {
        success: false,
        error: `Lapisan "${layerAName}" tidak memiliki fitur data yang valid.`,
        layerAName,
        layerBName,
        totalFeatures: 0,
        intersectedCount: 0,
        intersectedAreaKm2: 0,
        intersectedAreaHa: 0,
        sourceAAreaKm2: 0,
        overlapPercentage: 0,
        featureSummaries: []
      };
    }

    if (!layerB || !layerB.features || layerB.features.length === 0) {
      return {
        success: false,
        error: `Lapisan "${layerBName}" tidak memiliki fitur data yang valid.`,
        layerAName,
        layerBName,
        totalFeatures: 0,
        intersectedCount: 0,
        intersectedAreaKm2: 0,
        intersectedAreaHa: 0,
        sourceAAreaKm2: 0,
        overlapPercentage: 0,
        featureSummaries: []
      };
    }

    try {
      const maxFeatures = options.maxFeatures || this.MAX_SAFE_FEATURES;
      let featsA = layerA.features;
      let featsB = layerB.features;
      let warning: string | undefined;

      if (featsA.length > maxFeatures || featsB.length > maxFeatures) {
        warning = `Jumlah fitur dataset melebihi batas performa (${maxFeatures} fitur). Diproses dengan fitur terbatas untuk menjaga stabilitas browser.`;
        featsA = featsA.slice(0, maxFeatures);
        featsB = featsB.slice(0, maxFeatures);
      }

      // Calculate total area of Layer A (if it has polygons)
      let sourceAAreaKm2 = 0;
      try {
        const polyFeatsA = featsA.filter(
          (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        );
        if (polyFeatsA.length > 0) {
          sourceAAreaKm2 = area(featureCollection(polyFeatsA)) / 1_000_000;
        }
      } catch {
        sourceAAreaKm2 = 0;
      }

      const intersectedFeatures: GeoJSON.Feature[] = [];
      const featureSummaries: IntersectFeatureSummary[] = [];
      let totalIntersectedAreaKm2 = 0;

      for (let i = 0; i < featsA.length; i++) {
        const featA = featsA[i];
        if (!featA || !featA.geometry) continue;

        const geomTypeA = featA.geometry.type;
        const nameA = this.getFeatureName(featA, `Fitur A#${i + 1}`);

        for (let j = 0; j < featsB.length; j++) {
          const featB = featsB[j];
          if (!featB || !featB.geometry) continue;

          const geomTypeB = featB.geometry.type;
          const nameB = this.getFeatureName(featB, `Fitur B#${j + 1}`);

          // 1. Polygon ↔ Polygon Intersection (Geometric Clipping)
          if (
            (geomTypeA === 'Polygon' || geomTypeA === 'MultiPolygon') &&
            (geomTypeB === 'Polygon' || geomTypeB === 'MultiPolygon')
          ) {
            try {
              const polyA = featA as Feature<Polygon | MultiPolygon>;
              const polyB = featB as Feature<Polygon | MultiPolygon>;
              const isect = intersect(featureCollection([polyA, polyB]));

              if (isect && isect.geometry) {
                const isectAreaM2 = area(isect);
                if (isectAreaM2 > 0.01) {
                  const isectAreaKm2 = isectAreaM2 / 1_000_000;
                  const isectAreaHa = isectAreaKm2 * 100;
                  totalIntersectedAreaKm2 += isectAreaKm2;

                  const mergedProps: Record<string, any> = {
                    ...(featA.properties || {}),
                    ...(featB.properties || {}),
                    _intersect_source_a: nameA,
                    _intersect_source_b: nameB,
                    _intersect_layer_a: layerAName,
                    _intersect_layer_b: layerBName,
                    _intersect_type: 'Polygon ∩ Polygon',
                    _intersect_area_km2: Number(isectAreaKm2.toFixed(4)),
                    _intersect_area_ha: Number(isectAreaHa.toFixed(2))
                  };

                  isect.properties = mergedProps;
                  intersectedFeatures.push(isect);

                  if (featureSummaries.length < 50) {
                    featureSummaries.push({
                      name: `${nameA} ∩ ${nameB}`,
                      type: isect.geometry.type,
                      layerA: layerAName,
                      layerB: layerBName,
                      areaKm2: Number(isectAreaKm2.toFixed(4)),
                      properties: mergedProps
                    });
                  }
                }
              }
            } catch (err) {
              logger.warn('[SpatialIntersect] Polygon intersect error:', err);
            }
          }

          // 2. Polygon A ↔ Point B (Point-in-Polygon)
          else if (
            (geomTypeA === 'Polygon' || geomTypeA === 'MultiPolygon') &&
            (geomTypeB === 'Point' || geomTypeB === 'MultiPoint')
          ) {
            const isInside = this.isPointInsidePoly(featB, featA);
            if (isInside) {
              const mergedProps: Record<string, any> = {
                ...(featB.properties || {}),
                _intersect_parent_poly: nameA,
                _intersect_layer_a: layerAName,
                _intersect_layer_b: layerBName,
                _intersect_type: 'Point in Polygon'
              };

              const newFeat: GeoJSON.Feature = {
                type: 'Feature',
                geometry: featB.geometry,
                properties: mergedProps
              };

              intersectedFeatures.push(newFeat);

              if (featureSummaries.length < 50) {
                featureSummaries.push({
                  name: nameB,
                  type: 'Point',
                  layerA: layerAName,
                  layerB: layerBName,
                  properties: mergedProps
                });
              }
            }
          }

          // 3. Point A ↔ Polygon B (Point-in-Polygon Symmetric)
          else if (
            (geomTypeA === 'Point' || geomTypeA === 'MultiPoint') &&
            (geomTypeB === 'Polygon' || geomTypeB === 'MultiPolygon')
          ) {
            const isInside = this.isPointInsidePoly(featA, featB);
            if (isInside) {
              const mergedProps: Record<string, any> = {
                ...(featA.properties || {}),
                _intersect_parent_poly: nameB,
                _intersect_layer_a: layerAName,
                _intersect_layer_b: layerBName,
                _intersect_type: 'Point in Polygon'
              };

              const newFeat: GeoJSON.Feature = {
                type: 'Feature',
                geometry: featA.geometry,
                properties: mergedProps
              };

              intersectedFeatures.push(newFeat);

              if (featureSummaries.length < 50) {
                featureSummaries.push({
                  name: nameA,
                  type: 'Point',
                  layerA: layerAName,
                  layerB: layerBName,
                  properties: mergedProps
                });
              }
            }
          }

          // 4. LineString ↔ Polygon
          else if (
            (geomTypeA === 'Polygon' || geomTypeA === 'MultiPolygon') &&
            (geomTypeB === 'LineString' || geomTypeB === 'MultiLineString')
          ) {
            const isLineInside = this.isLineIntersectingPoly(featB, featA);
            if (isLineInside) {
              const mergedProps: Record<string, any> = {
                ...(featB.properties || {}),
                _intersect_parent_poly: nameA,
                _intersect_layer_a: layerAName,
                _intersect_layer_b: layerBName,
                _intersect_type: 'Line in Polygon'
              };

              intersectedFeatures.push({
                type: 'Feature',
                geometry: featB.geometry,
                properties: mergedProps
              });

              if (featureSummaries.length < 50) {
                featureSummaries.push({
                  name: nameB,
                  type: 'LineString',
                  layerA: layerAName,
                  layerB: layerBName,
                  properties: mergedProps
                });
              }
            }
          }
        }
      }

      const resultFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: intersectedFeatures
      };

      let resultBbox: [number, number, number, number] | undefined;
      if (intersectedFeatures.length > 0) {
        try {
          resultBbox = bbox(resultFC) as [number, number, number, number];
        } catch {
          resultBbox = undefined;
        }
      }

      const overlapPercentage =
        sourceAAreaKm2 > 0
          ? Number(Math.min(100, (totalIntersectedAreaKm2 / sourceAAreaKm2) * 100).toFixed(1))
          : 0;

      return {
        success: true,
        warning,
        data: resultFC,
        layerAName,
        layerBName,
        totalFeatures: featsA.length + featsB.length,
        intersectedCount: intersectedFeatures.length,
        intersectedAreaKm2: Number(totalIntersectedAreaKm2.toFixed(4)),
        intersectedAreaHa: Number((totalIntersectedAreaKm2 * 100).toFixed(2)),
        sourceAAreaKm2: Number(sourceAAreaKm2.toFixed(4)),
        overlapPercentage,
        bbox: resultBbox,
        featureSummaries
      };
    } catch (err: any) {
      logger.error('[SpatialIntersect] Execution error:', err);
      return {
        success: false,
        error: `Gagal menjalankan analisis intersect: ${err?.message || 'Kesalahan kalkulasi geometris'}`,
        layerAName,
        layerBName,
        totalFeatures: 0,
        intersectedCount: 0,
        intersectedAreaKm2: 0,
        intersectedAreaHa: 0,
        sourceAAreaKm2: 0,
        overlapPercentage: 0,
        featureSummaries: []
      };
    }
  }

  private static isPointInsidePoly(pointFeat: GeoJSON.Feature, polyFeat: GeoJSON.Feature): boolean {
    const ptGeom = pointFeat.geometry;
    const polyGeom = polyFeat.geometry;
    if (!ptGeom || !polyGeom) return false;

    try {
      if (ptGeom.type === 'Point') {
        return booleanPointInPolygon(ptGeom.coordinates, polyFeat as any);
      } else if (ptGeom.type === 'MultiPoint') {
        return ptGeom.coordinates.some((c) => booleanPointInPolygon(c, polyFeat as any));
      }
    } catch {
      return false;
    }
    return false;
  }

  private static isLineIntersectingPoly(lineFeat: GeoJSON.Feature, polyFeat: GeoJSON.Feature): boolean {
    const lineGeom = lineFeat.geometry;
    if (!lineGeom) return false;

    try {
      if (lineGeom.type === 'LineString') {
        return lineGeom.coordinates.some((coord) => booleanPointInPolygon(coord, polyFeat as any));
      } else if (lineGeom.type === 'MultiLineString') {
        return lineGeom.coordinates.some((line) =>
          line.some((coord) => booleanPointInPolygon(coord, polyFeat as any))
        );
      }
    } catch {
      return false;
    }
    return false;
  }

  private static getFeatureName(feat: GeoJSON.Feature, fallback: string): string {
    return (
      feat.properties?.name ||
      feat.properties?.nama ||
      feat.properties?.title ||
      feat.properties?.label ||
      feat.properties?.id ||
      fallback
    );
  }
}
