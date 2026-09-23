import { featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { intersect } from '@turf/intersect';
import { difference } from '@turf/difference';
import { union } from '@turf/union';
import { area } from '@turf/area';
import { bbox } from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { logger } from '../utils/logger';

export type SpatialOverlayMode = 'intersect' | 'difference' | 'union' | 'sym_difference';

export interface IntersectOptions {
  mode?: SpatialOverlayMode;
  layerAName?: string;
  layerBName?: string;
  maxFeatures?: number;
  categoryProperty?: string;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  areaKm2: number;
  areaHa: number;
  percentage: number;
  color: string;
}

export interface IntersectFeatureSummary {
  name: string;
  type: string;
  category?: string;
  layerA: string;
  layerB: string;
  areaKm2?: number;
  areaHa?: number;
  properties: Record<string, any>;
}

export interface IntersectAnalysisResult {
  success: boolean;
  mode: SpatialOverlayMode;
  modeLabel: string;
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
  categoryBreakdowns: CategoryBreakdown[];
}

export interface BatchOverlayResult {
  success: boolean;
  baseLayerName: string;
  totalLayersProcessed: number;
  totalIntersectedCount: number;
  totalIntersectedAreaKm2: number;
  results: {
    layerId: string;
    layerName: string;
    result: IntersectAnalysisResult;
  }[];
}

const PALETTE = [
  '#00f0ff', // Cyan Neon
  '#38bdf8', // Sky Blue
  '#10b981', // Emerald Green
  '#f59e0b', // Amber
  '#ec4899', // Magenta
  '#8b5cf6', // Violet
  '#06b6d4', // Teal
  '#f97316'  // Orange
];

export class SpatialIntersectAnalyzer {
  public static readonly MAX_SAFE_FEATURES = 1000;

  public static getModeLabel(mode: SpatialOverlayMode): string {
    switch (mode) {
      case 'intersect':
        return 'Irisan (Intersection)';
      case 'difference':
        return 'Pemotongan (Difference / Erase)';
      case 'union':
        return 'Penggabungan (Union)';
      case 'sym_difference':
        return 'Beda Simetris (XOR)';
      default:
        return 'Irisan Spasial';
    }
  }

  /**
   * Backward-compatible alias for overlay with mode 'intersect'
   */
  public static intersect(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): IntersectAnalysisResult {
    return this.overlay(layerA, layerB, { ...options, mode: 'intersect' });
  }

  /**
   * Alias for overlay with mode 'difference' (Layer A minus Layer B)
   */
  public static difference(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): IntersectAnalysisResult {
    return this.overlay(layerA, layerB, { ...options, mode: 'difference' });
  }

  /**
   * Alias for overlay with mode 'union' (Layer A united with Layer B)
   */
  public static union(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): IntersectAnalysisResult {
    return this.overlay(layerA, layerB, { ...options, mode: 'union' });
  }

  /**
   * Alias for overlay with mode 'sym_difference' (Layer A XOR Layer B)
   */
  public static symmetricDifference(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): IntersectAnalysisResult {
    return this.overlay(layerA, layerB, { ...options, mode: 'sym_difference' });
  }

  /**
   * Computes the geometric and topological overlay between Layer A and Layer B.
   * Supports 4 set theory operations:
   * - 'intersect': A ∩ B
   * - 'difference': A - B
   * - 'union': A ∪ B
   * - 'sym_difference': (A - B) ∪ (B - A)
   */
  public static overlay(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): IntersectAnalysisResult {
    const mode: SpatialOverlayMode = options.mode || 'intersect';
    const modeLabel = this.getModeLabel(mode);
    const layerAName = options.layerAName || 'Lapisan A';
    const layerBName = options.layerBName || 'Lapisan B';

    if (!layerA || !layerA.features || layerA.features.length === 0) {
      return {
        success: false,
        mode,
        modeLabel,
        error: `Lapisan "${layerAName}" tidak memiliki fitur data yang valid.`,
        layerAName,
        layerBName,
        totalFeatures: 0,
        intersectedCount: 0,
        intersectedAreaKm2: 0,
        intersectedAreaHa: 0,
        sourceAAreaKm2: 0,
        overlapPercentage: 0,
        featureSummaries: [],
        categoryBreakdowns: []
      };
    }

    if (!layerB || !layerB.features || layerB.features.length === 0) {
      return {
        success: false,
        mode,
        modeLabel,
        error: `Lapisan "${layerBName}" tidak memiliki fitur data yang valid.`,
        layerAName,
        layerBName,
        totalFeatures: 0,
        intersectedCount: 0,
        intersectedAreaKm2: 0,
        intersectedAreaHa: 0,
        sourceAAreaKm2: 0,
        overlapPercentage: 0,
        featureSummaries: [],
        categoryBreakdowns: []
      };
    }

    try {
      let featsA = layerA.features;
      let featsB = layerB.features;
      let warning: string | undefined;

      if (featsA.length > this.MAX_SAFE_FEATURES) {
        warning = `Lapisan "${layerAName}" memiliki ${featsA.length} fitur. Dibatasi ke ${this.MAX_SAFE_FEATURES} fitur pertama demi stabilitas peramban.`;
        featsA = featsA.slice(0, this.MAX_SAFE_FEATURES);
      }

      if (featsB.length > this.MAX_SAFE_FEATURES) {
        const warnB = `Lapisan "${layerBName}" memiliki ${featsB.length} fitur. Dibatasi ke ${this.MAX_SAFE_FEATURES} fitur pertama.`;
        warning = warning ? `${warning} ${warnB}` : warnB;
        featsB = featsB.slice(0, this.MAX_SAFE_FEATURES);
      }

      // Calculate total area of Layer A for ratio comparison
      let sourceAAreaKm2 = 0;
      for (const f of featsA) {
        if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
          sourceAAreaKm2 += area(f) / 1_000_000;
        }
      }

      const intersectedFeatures: GeoJSON.Feature[] = [];
      const featureSummaries: IntersectFeatureSummary[] = [];
      let totalIntersectedAreaKm2 = 0;

      // Execute based on operation mode
      if (mode === 'intersect') {
        this.executeIntersection(featsA, featsB, layerAName, layerBName, intersectedFeatures, featureSummaries, (a) => {
          totalIntersectedAreaKm2 += a;
        });
      } else if (mode === 'difference') {
        this.executeDifference(featsA, featsB, layerAName, layerBName, intersectedFeatures, featureSummaries, (a) => {
          totalIntersectedAreaKm2 += a;
        });
      } else if (mode === 'union') {
        this.executeUnion(featsA, featsB, layerAName, layerBName, intersectedFeatures, featureSummaries, (a) => {
          totalIntersectedAreaKm2 += a;
        });
      } else if (mode === 'sym_difference') {
        this.executeSymDifference(featsA, featsB, layerAName, layerBName, intersectedFeatures, featureSummaries, (a) => {
          totalIntersectedAreaKm2 += a;
        });
      }

      const intersectedCount = intersectedFeatures.length;
      const intersectedAreaKm2 = Number(totalIntersectedAreaKm2.toFixed(4));
      const intersectedAreaHa = Number((intersectedAreaKm2 * 100).toFixed(2));
      const overlapPercentage = sourceAAreaKm2 > 0
        ? Number(Math.min(100, (intersectedAreaKm2 / sourceAAreaKm2) * 100).toFixed(1))
        : 0;

      const resultFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: intersectedFeatures
      };

      let boundingBox: [number, number, number, number] | undefined;
      if (intersectedFeatures.length > 0) {
        try {
          boundingBox = bbox(resultFC) as [number, number, number, number];
        } catch (e) {
          logger.warn('[SpatialIntersect] BBox computation error:', e);
        }
      }

      // Compute thematic category breakdown
      const categoryBreakdowns = this.computeCategoryBreakdown(intersectedFeatures, intersectedAreaKm2);

      return {
        success: true,
        mode,
        modeLabel,
        warning,
        data: resultFC,
        layerAName,
        layerBName,
        totalFeatures: featsA.length + featsB.length,
        intersectedCount,
        intersectedAreaKm2,
        intersectedAreaHa,
        sourceAAreaKm2: Number(sourceAAreaKm2.toFixed(4)),
        overlapPercentage,
        bbox: boundingBox,
        featureSummaries,
        categoryBreakdowns
      };
    } catch (err: any) {
      logger.error('[SpatialIntersect] Processing error:', err);
      return {
        success: false,
        mode,
        modeLabel,
        error: `Terjadi kesalahan saat memproses ${modeLabel}: ${err?.message || 'Format geometri tidak valid'}`,
        layerAName,
        layerBName,
        totalFeatures: 0,
        intersectedCount: 0,
        intersectedAreaKm2: 0,
        intersectedAreaHa: 0,
        sourceAAreaKm2: 0,
        overlapPercentage: 0,
        featureSummaries: [],
        categoryBreakdowns: []
      };
    }
  }

  /**
   * Batch Overlay: Intersect base layer against multiple target layers in a single pass
   */
  public static batchOverlay(
    baseLayer: GeoJSON.FeatureCollection,
    targetLayers: { id: string; name: string; data: GeoJSON.FeatureCollection }[],
    options: IntersectOptions = {}
  ): BatchOverlayResult {
    const baseName = options.layerAName || 'Lapisan Basis';
    const results: { layerId: string; layerName: string; result: IntersectAnalysisResult }[] = [];
    let totalIntersectedCount = 0;
    let totalIntersectedAreaKm2 = 0;

    for (const target of targetLayers) {
      if (!target.data || !target.data.features || target.data.features.length === 0) continue;
      const res = this.overlay(baseLayer, target.data, {
        ...options,
        layerAName: baseName,
        layerBName: target.name
      });
      if (res.success) {
        totalIntersectedCount += res.intersectedCount;
        totalIntersectedAreaKm2 += res.intersectedAreaKm2;
      }
      results.push({
        layerId: target.id,
        layerName: target.name,
        result: res
      });
    }

    return {
      success: true,
      baseLayerName: baseName,
      totalLayersProcessed: targetLayers.length,
      totalIntersectedCount,
      totalIntersectedAreaKm2: Number(totalIntersectedAreaKm2.toFixed(4)),
      results
    };
  }

  // =========================================================================
  // INTERNAL OPERATION ENGINES
  // =========================================================================

  private static executeIntersection(
    featsA: GeoJSON.Feature[],
    featsB: GeoJSON.Feature[],
    layerAName: string,
    layerBName: string,
    outFeatures: GeoJSON.Feature[],
    outSummaries: IntersectFeatureSummary[],
    onAreaAdd: (areaKm2: number) => void
  ) {
    for (let i = 0; i < featsA.length; i++) {
      const featA = featsA[i];
      if (!featA || !featA.geometry) continue;

      const geomTypeA = featA.geometry.type;
      const nameA = this.getFeatureName(featA, `Fitur A#${i + 1}`);
      const catA = this.getFeatureCategory(featA);

      for (let j = 0; j < featsB.length; j++) {
        const featB = featsB[j];
        if (!featB || !featB.geometry) continue;

        const geomTypeB = featB.geometry.type;
        const nameB = this.getFeatureName(featB, `Fitur B#${j + 1}`);
        const catB = this.getFeatureCategory(featB);

        // 1. Polygon ∩ Polygon (Geometric Clipping)
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
                onAreaAdd(isectAreaKm2);

                const mergedProps: Record<string, any> = {
                  ...(featA.properties || {}),
                  ...(featB.properties || {}),
                  _intersect_source_a: nameA,
                  _intersect_source_b: nameB,
                  _intersect_layer_a: layerAName,
                  _intersect_layer_b: layerBName,
                  _intersect_category: catB || catA || 'Umum',
                  _intersect_type: 'Polygon ∩ Polygon',
                  _intersect_area_km2: Number(isectAreaKm2.toFixed(4)),
                  _intersect_area_ha: Number(isectAreaHa.toFixed(2))
                };

                isect.properties = mergedProps;
                outFeatures.push(isect);

                if (outSummaries.length < 50) {
                  outSummaries.push({
                    name: `${nameA} ∩ ${nameB}`,
                    type: isect.geometry.type,
                    category: mergedProps._intersect_category,
                    layerA: layerAName,
                    layerB: layerBName,
                    areaKm2: Number(isectAreaKm2.toFixed(4)),
                    areaHa: Number(isectAreaHa.toFixed(2)),
                    properties: mergedProps
                  });
                }
              }
            }
          } catch (err) {
            logger.warn('[SpatialIntersect] Polygon intersect error:', err);
          }
        }

        // 2. Polygon A ∩ Point B (Point-in-Polygon)
        else if (
          (geomTypeA === 'Polygon' || geomTypeA === 'MultiPolygon') &&
          (geomTypeB === 'Point' || geomTypeB === 'MultiPoint')
        ) {
          const isInside = this.isPointInsidePoly(featB, featA);
          if (isInside) {
            const mergedProps: Record<string, any> = {
              ...(featB.properties || {}),
              _intersect_parent_poly: nameA,
              _intersect_source_a: nameA,
              _intersect_source_b: nameB,
              _intersect_layer_a: layerAName,
              _intersect_layer_b: layerBName,
              _intersect_category: catB || 'Titik Observasi',
              _intersect_type: 'Point in Polygon'
            };

            const newFeat: GeoJSON.Feature = {
              type: 'Feature',
              geometry: featB.geometry,
              properties: mergedProps
            };

            outFeatures.push(newFeat);

            if (outSummaries.length < 50) {
              outSummaries.push({
                name: nameB,
                type: 'Point',
                category: mergedProps._intersect_category,
                layerA: layerAName,
                layerB: layerBName,
                properties: mergedProps
              });
            }
          }
        }

        // 3. Point A ∩ Polygon B (Point-in-Polygon Symmetric)
        else if (
          (geomTypeA === 'Point' || geomTypeA === 'MultiPoint') &&
          (geomTypeB === 'Polygon' || geomTypeB === 'MultiPolygon')
        ) {
          const isInside = this.isPointInsidePoly(featA, featB);
          if (isInside) {
            const mergedProps: Record<string, any> = {
              ...(featA.properties || {}),
              _intersect_parent_poly: nameB,
              _intersect_source_a: nameA,
              _intersect_source_b: nameB,
              _intersect_layer_a: layerAName,
              _intersect_layer_b: layerBName,
              _intersect_category: catA || 'Titik Observasi',
              _intersect_type: 'Point in Polygon'
            };

            const newFeat: GeoJSON.Feature = {
              type: 'Feature',
              geometry: featA.geometry,
              properties: mergedProps
            };

            outFeatures.push(newFeat);

            if (outSummaries.length < 50) {
              outSummaries.push({
                name: nameA,
                type: 'Point',
                category: mergedProps._intersect_category,
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
          const isIntersecting = this.isLineIntersectingPoly(featB, featA);
          if (isIntersecting) {
            const mergedProps: Record<string, any> = {
              ...(featB.properties || {}),
              _intersect_parent_poly: nameA,
              _intersect_source_a: nameA,
              _intersect_source_b: nameB,
              _intersect_layer_a: layerAName,
              _intersect_layer_b: layerBName,
              _intersect_category: catB || 'Jalur / Garis',
              _intersect_type: 'Line in Polygon'
            };

            const newFeat: GeoJSON.Feature = {
              type: 'Feature',
              geometry: featB.geometry,
              properties: mergedProps
            };

            outFeatures.push(newFeat);

            if (outSummaries.length < 50) {
              outSummaries.push({
                name: nameB,
                type: 'LineString',
                category: mergedProps._intersect_category,
                layerA: layerAName,
                layerB: layerBName,
                properties: mergedProps
              });
            }
          }
        }
      }
    }
  }

  private static executeDifference(
    featsA: GeoJSON.Feature[],
    featsB: GeoJSON.Feature[],
    layerAName: string,
    layerBName: string,
    outFeatures: GeoJSON.Feature[],
    outSummaries: IntersectFeatureSummary[],
    onAreaAdd: (areaKm2: number) => void
  ) {
    for (let i = 0; i < featsA.length; i++) {
      let currentPoly = featsA[i];
      if (!currentPoly || !currentPoly.geometry) continue;
      if (currentPoly.geometry.type !== 'Polygon' && currentPoly.geometry.type !== 'MultiPolygon') continue;

      const nameA = this.getFeatureName(currentPoly, `Area A#${i + 1}`);

      for (let j = 0; j < featsB.length; j++) {
        const featB = featsB[j];
        if (!featB || !featB.geometry) continue;
        if (featB.geometry.type !== 'Polygon' && featB.geometry.type !== 'MultiPolygon') continue;

        try {
          const pA = currentPoly as Feature<Polygon | MultiPolygon>;
          const pB = featB as Feature<Polygon | MultiPolygon>;
          const diff = difference(featureCollection([pA, pB]));
          if (diff && diff.geometry) {
            currentPoly = diff;
          }
        } catch (err) {
          logger.warn('[SpatialIntersect] Difference error:', err);
        }
      }

      if (currentPoly && currentPoly.geometry) {
        const diffAreaM2 = area(currentPoly);
        if (diffAreaM2 > 0.01) {
          const diffAreaKm2 = diffAreaM2 / 1_000_000;
          const diffAreaHa = diffAreaKm2 * 100;
          onAreaAdd(diffAreaKm2);

          const mergedProps: Record<string, any> = {
            ...(currentPoly.properties || {}),
            _intersect_source_a: nameA,
            _intersect_layer_a: layerAName,
            _intersect_layer_b: layerBName,
            _intersect_type: 'Difference (A - B)',
            _intersect_category: 'Sisa Wilayah',
            _intersect_area_km2: Number(diffAreaKm2.toFixed(4)),
            _intersect_area_ha: Number(diffAreaHa.toFixed(2))
          };

          currentPoly.properties = mergedProps;
          outFeatures.push(currentPoly);

          if (outSummaries.length < 50) {
            outSummaries.push({
              name: `${nameA} (Dikurangi ${layerBName})`,
              type: currentPoly.geometry.type,
              category: 'Sisa Wilayah',
              layerA: layerAName,
              layerB: layerBName,
              areaKm2: Number(diffAreaKm2.toFixed(4)),
              areaHa: Number(diffAreaHa.toFixed(2)),
              properties: mergedProps
            });
          }
        }
      }
    }
  }

  private static executeUnion(
    featsA: GeoJSON.Feature[],
    featsB: GeoJSON.Feature[],
    layerAName: string,
    layerBName: string,
    outFeatures: GeoJSON.Feature[],
    outSummaries: IntersectFeatureSummary[],
    onAreaAdd: (areaKm2: number) => void
  ) {
    const polygonFeatures: Feature<Polygon | MultiPolygon>[] = [];
    for (const f of [...featsA, ...featsB]) {
      if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
        polygonFeatures.push(f as Feature<Polygon | MultiPolygon>);
      }
    }

    if (polygonFeatures.length === 0) return;

    try {
      let combined: Feature<Polygon | MultiPolygon> = polygonFeatures[0];
      for (let i = 1; i < polygonFeatures.length; i++) {
        const u = union(featureCollection([combined, polygonFeatures[i]]));
        if (u && u.geometry) {
          combined = u;
        }
      }

      if (combined && combined.geometry) {
        const uAreaM2 = area(combined);
        const uAreaKm2 = uAreaM2 / 1_000_000;
        const uAreaHa = uAreaKm2 * 100;
        onAreaAdd(uAreaKm2);

        const mergedProps: Record<string, any> = {
          _intersect_layer_a: layerAName,
          _intersect_layer_b: layerBName,
          _intersect_type: 'Union (A ∪ B)',
          _intersect_category: 'Penggabungan Wilayah',
          _intersect_area_km2: Number(uAreaKm2.toFixed(4)),
          _intersect_area_ha: Number(uAreaHa.toFixed(2))
        };

        combined.properties = mergedProps;
        outFeatures.push(combined);

        outSummaries.push({
          name: `Gabungan ${layerAName} + ${layerBName}`,
          type: combined.geometry.type,
          category: 'Penggabungan Wilayah',
          layerA: layerAName,
          layerB: layerBName,
          areaKm2: Number(uAreaKm2.toFixed(4)),
          areaHa: Number(uAreaHa.toFixed(2)),
          properties: mergedProps
        });
      }
    } catch (err) {
      logger.warn('[SpatialIntersect] Union error:', err);
    }
  }

  private static executeSymDifference(
    featsA: GeoJSON.Feature[],
    featsB: GeoJSON.Feature[],
    layerAName: string,
    layerBName: string,
    outFeatures: GeoJSON.Feature[],
    outSummaries: IntersectFeatureSummary[],
    onAreaAdd: (areaKm2: number) => void
  ) {
    // (A - B) + (B - A)
    this.executeDifference(featsA, featsB, layerAName, layerBName, outFeatures, outSummaries, onAreaAdd);
    this.executeDifference(featsB, featsA, layerBName, layerAName, outFeatures, outSummaries, onAreaAdd);
  }

  // =========================================================================
  // HELPER UTILITIES
  // =========================================================================

  private static computeCategoryBreakdown(
    features: GeoJSON.Feature[],
    totalAreaKm2: number
  ): CategoryBreakdown[] {
    const catMap = new Map<string, { count: number; areaKm2: number }>();

    for (const f of features) {
      const cat = f.properties?._intersect_category || this.getFeatureCategory(f) || 'Umum';
      const fArea = f.properties?._intersect_area_km2 || 0;
      const prev = catMap.get(cat) || { count: 0, areaKm2: 0 };
      catMap.set(cat, {
        count: prev.count + 1,
        areaKm2: prev.areaKm2 + fArea
      });
    }

    const totalCount = features.length;
    const entries = Array.from(catMap.entries());

    return entries.map(([category, stats], idx) => {
      const percentage = totalAreaKm2 > 0
        ? Number(((stats.areaKm2 / totalAreaKm2) * 100).toFixed(1))
        : totalCount > 0
        ? Number(((stats.count / totalCount) * 100).toFixed(1))
        : 0;

      return {
        category,
        count: stats.count,
        areaKm2: Number(stats.areaKm2.toFixed(4)),
        areaHa: Number((stats.areaKm2 * 100).toFixed(2)),
        percentage,
        color: PALETTE[idx % PALETTE.length]
      };
    }).sort((a, b) => b.count - a.count);
  }

  private static isPointInsidePoly(pointFeat: GeoJSON.Feature, polyFeat: GeoJSON.Feature): boolean {
    try {
      if (!pointFeat.geometry || pointFeat.geometry.type !== 'Point') return false;
      const ptCoords = pointFeat.geometry.coordinates as [number, number];
      return booleanPointInPolygon(ptCoords, polyFeat as any);
    } catch {
      return false;
    }
  }

  private static isLineIntersectingPoly(lineFeat: GeoJSON.Feature, polyFeat: GeoJSON.Feature): boolean {
    try {
      if (!lineFeat.geometry || (lineFeat.geometry.type !== 'LineString' && lineFeat.geometry.type !== 'MultiLineString')) {
        return false;
      }
      const coords = lineFeat.geometry.type === 'LineString'
        ? (lineFeat.geometry.coordinates as [number, number][])
        : (lineFeat.geometry.coordinates as [number, number][][]).flat();

      for (const pt of coords) {
        if (booleanPointInPolygon(pt, polyFeat as any)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private static getFeatureName(feat: GeoJSON.Feature, fallback: string): string {
    const props = feat.properties || {};
    return props.name || props.NAMOBJ || props.nama || props.KAB_KOTA || props.PROVINSI || props.city || props.title || props.id || fallback;
  }

  private static getFeatureCategory(feat: GeoJSON.Feature): string {
    const props = feat.properties || {};
    return props.category || props.kategori || props.REMARK || props.type || props.jenis || props.klasifikasi || '';
  }
}
