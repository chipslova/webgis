/// <reference lib="webworker" />
import { SpatialBufferAnalyzer, type BufferOptions } from '../tools/spatial-buffer';
import { SpatialIntersectAnalyzer, type IntersectOptions } from '../tools/spatial-intersect';

export type SpatialWorkerRequest =
  | { id: string; type: 'BUFFER'; payload: { sourceGeoJSON: GeoJSON.FeatureCollection; options: BufferOptions } }
  | { id: string; type: 'INTERSECT'; payload: { layerA: GeoJSON.FeatureCollection; layerB: GeoJSON.FeatureCollection; options: IntersectOptions } };

export type SpatialWorkerResponse =
  | { id: string; success: boolean; result?: any; error?: string };

self.onmessage = (e: MessageEvent<SpatialWorkerRequest>) => {
  const req = e.data;
  if (!req || !req.id || !req.type) return;

  try {
    if (req.type === 'BUFFER') {
      const res = SpatialBufferAnalyzer.createBuffer(req.payload.sourceGeoJSON, req.payload.options);
      const response: SpatialWorkerResponse = {
        id: req.id,
        success: res.success,
        result: res,
        error: res.error
      };
      self.postMessage(response);
    } else if (req.type === 'INTERSECT') {
      const res = SpatialIntersectAnalyzer.overlay(req.payload.layerA, req.payload.layerB, req.payload.options);
      const response: SpatialWorkerResponse = {
        id: req.id,
        success: res.success,
        result: res,
        error: res.error
      };
      self.postMessage(response);
    } else {
      self.postMessage({
        id: (req as any).id,
        success: false,
        error: `Tipe operasi tidak dikenal: ${(req as any).type}`
      });
    }
  } catch (err: any) {
    self.postMessage({
      id: req.id,
      success: false,
      error: err?.message || 'Kesalahan kalkulasi spasial di Web Worker'
    });
  }
};
