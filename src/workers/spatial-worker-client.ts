import type { BufferOptions, BufferAnalysisResult } from '../tools/spatial-buffer';
import type { IntersectOptions, IntersectAnalysisResult } from '../tools/spatial-intersect';
import type { SpatialWorkerRequest, SpatialWorkerResponse } from './spatial.worker';
import { logger } from '../utils/logger';

interface PendingRequest {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SpatialWorkerClient {
  private static instance: SpatialWorkerClient | null = null;
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private isWorkerSupported: boolean = false;
  private initAttempted: boolean = false;

  private constructor() {
    this.initWorker();
  }

  public static getInstance(): SpatialWorkerClient {
    if (!SpatialWorkerClient.instance) {
      SpatialWorkerClient.instance = new SpatialWorkerClient();
    }
    return SpatialWorkerClient.instance;
  }

  private initWorker() {
    if (this.initAttempted) return;
    this.initAttempted = true;

    // Guard: Only initialize in browser environments where Worker and window are available
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        // Vite standard ES-module worker loader
        this.worker = new Worker(
          new URL('./spatial.worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (e: MessageEvent<SpatialWorkerResponse>) => {
          this.handleWorkerMessage(e);
        };

        this.worker.onerror = (err) => {
          logger.warn('[SpatialWorker] Web Worker error detected, falling back to main thread:', err);
          this.pendingRequests.forEach((req) => {
            clearTimeout(req.timer);
            req.reject(new Error('Web Worker execution error'));
          });
          this.pendingRequests.clear();
          this.isWorkerSupported = false;
          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }
        };

        this.isWorkerSupported = true;
      } catch (err) {
        logger.debug('[SpatialWorker] Web Worker initialization skipped (using main thread):', err);
        this.isWorkerSupported = false;
        this.worker = null;
      }
    } else {
      this.isWorkerSupported = false;
    }
  }

  private handleWorkerMessage(e: MessageEvent<SpatialWorkerResponse>) {
    if (!e || !e.data) return;
    const { id, result, success, error } = e.data;
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      if (success) {
        pending.resolve(result);
      } else {
        pending.resolve(result || { success: false, error: error || 'Operasi Web Worker gagal' });
      }
    }
  }

  public setWorkerForTesting(mockWorker: any) {
    this.worker = mockWorker;
    this.isWorkerSupported = mockWorker !== null;
    if (mockWorker) {
      mockWorker.onmessage = (e: any) => this.handleWorkerMessage(e);
    }
  }

  public isWorkerAvailable(): boolean {
    return this.isWorkerSupported && this.worker !== null;
  }

  public async runBuffer(
    sourceGeoJSON: GeoJSON.FeatureCollection,
    options: BufferOptions
  ): Promise<BufferAnalysisResult> {
    if (this.isWorkerSupported && this.worker) {
      return new Promise<BufferAnalysisResult>((resolve, reject) => {
        const id = `buf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const timer = setTimeout(async () => {
          this.pendingRequests.delete(id);
          logger.warn('[SpatialWorker] Buffer worker timeout (30s) — executing on main thread fallback');
          try {
            const { SpatialBufferAnalyzer } = await import('../tools/spatial-buffer');
            resolve(SpatialBufferAnalyzer.createBuffer(sourceGeoJSON, options));
          } catch (e) {
            reject(e);
          }
        }, 30000);

        this.pendingRequests.set(id, { resolve, reject, timer });

        const msg: SpatialWorkerRequest = {
          id,
          type: 'BUFFER',
          payload: { sourceGeoJSON, options }
        };
        this.worker!.postMessage(msg);
      });
    }

    // Direct main-thread fallback
    const { SpatialBufferAnalyzer } = await import('../tools/spatial-buffer');
    return SpatialBufferAnalyzer.createBuffer(sourceGeoJSON, options);
  }

  public async runIntersect(
    layerA: GeoJSON.FeatureCollection,
    layerB: GeoJSON.FeatureCollection,
    options: IntersectOptions = {}
  ): Promise<IntersectAnalysisResult> {
    if (this.isWorkerSupported && this.worker) {
      return new Promise<IntersectAnalysisResult>((resolve, reject) => {
        const id = `isect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const timer = setTimeout(async () => {
          this.pendingRequests.delete(id);
          logger.warn('[SpatialWorker] Intersect worker timeout (30s) — executing on main thread fallback');
          try {
            const { SpatialIntersectAnalyzer } = await import('../tools/spatial-intersect');
            resolve(SpatialIntersectAnalyzer.overlay(layerA, layerB, options));
          } catch (e) {
            reject(e);
          }
        }, 30000);

        this.pendingRequests.set(id, { resolve, reject, timer });

        const msg: SpatialWorkerRequest = {
          id,
          type: 'INTERSECT',
          payload: { layerA, layerB, options }
        };
        this.worker!.postMessage(msg);
      });
    }

    // Direct main-thread fallback
    const { SpatialIntersectAnalyzer } = await import('../tools/spatial-intersect');
    return SpatialIntersectAnalyzer.overlay(layerA, layerB, options);
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isWorkerSupported = false;
    }
  }
}
