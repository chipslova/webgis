import { describe, it, expect, beforeEach, vi } from 'vitest';
import geminiHandler from '../api/gemini-navigator';
import { _resetRateLimitStore } from '../api/_rate-limit';
import { AINavigator } from '../src/tools/ai-navigator';

describe('Google Gemini AI Map Navigator & Copilot', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    _resetRateLimitStore();
    vi.restoreAllMocks();
    mockStore = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => { mockStore[k] = v; },
      removeItem: (k: string) => { delete mockStore[k]; },
      clear: () => { mockStore = {}; }
    };
  });

  describe('API Serverless Endpoint (/api/gemini-navigator)', () => {
    const createMockRes = () => {
      let statusCode = 200;
      let headers: Record<string, string> = {};
      let jsonBody: any = null;

      const res: any = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => {
              jsonBody = data;
              return res;
            },
            end: () => res
          };
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
        end: () => res,
        _getStatus: () => statusCode,
        _getBody: () => jsonBody,
        _getHeaders: () => headers
      };
      return res;
    };

    it('should handle CORS preflight OPTIONS request', async () => {
      const req = {
        method: 'OPTIONS',
        headers: {}
      };
      const res = createMockRes();

      await geminiHandler(req, res);
      expect(res._getStatus()).toBe(200);
      expect(res._getHeaders()['access-control-allow-origin']).toBe('*');
    });

    it('should reject non-POST requests with 405', async () => {
      const req = {
        method: 'GET',
        headers: {}
      };
      const res = createMockRes();

      await geminiHandler(req, res);
      expect(res._getStatus()).toBe(405);
      expect(res._getBody().error).toContain('Gunakan POST');
    });

    it('should enforce rate limiting per IP address (Layer 1 Protection)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'OK' }] } }]
        })
      } as any);

      const mockReq = {
        method: 'POST',
        headers: { 'x-forwarded-for': '182.253.10.5' },
        body: { prompt: 'Terbang ke Monas' }
      };

      // Limit is 10 per 2 minutes
      for (let i = 0; i < 10; i++) {
        const res = createMockRes();
        await geminiHandler(mockReq, res);
        expect(res._getStatus()).not.toBe(429);
      }

      // 11th request must be throttled with 429
      const throttledRes = createMockRes();
      await geminiHandler(mockReq, throttledRes);
      expect(throttledRes._getStatus()).toBe(429);
      expect(throttledRes._getBody().error).toContain('Maksimal 10 perintah AI per 2 menit');
    });

    it('should reject empty prompts with 400 Bad Request', async () => {
      const req = {
        method: 'POST',
        headers: { 'x-forwarded-for': '182.253.10.6' },
        body: { prompt: '   ' }
      };
      const res = createMockRes();

      await geminiHandler(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toContain('tidak boleh kosong');
    });

    it('should return helpful configuration guide when GEMINI_API_KEY is not set', async () => {
      const originalEnv = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const req = {
        method: 'POST',
        headers: { 'x-forwarded-for': '182.253.10.7' },
        body: { prompt: 'Terbang ke Bandung' }
      };
      const res = createMockRes();

      await geminiHandler(req, res);
      expect(res._getStatus()).toBe(500);
      expect(res._getBody().missingKey).toBe(true);

      process.env.GEMINI_API_KEY = originalEnv;
    });
  });

  describe('Client AINavigator Tool & Action Execution', () => {
    let mockMap: any;
    let mockMapManager: any;

    beforeEach(() => {
      mockMap = {
        flyTo: vi.fn(),
        getCenter: () => ({ lng: 112.95, lat: -7.94 }),
        getZoom: () => 10,
        getPitch: () => 30,
        getBearing: () => 0
      };

      mockMapManager = {
        getMap: () => mockMap,
        getCurrentBasemapId: () => 'esri-imagery',
        getProjection: () => 'mercator',
        setBasemap: vi.fn().mockResolvedValue(true),
        setProjection: vi.fn()
      };
    });

    it('should correctly execute flyToLocation action on MapLibre', async () => {
      const nav = new AINavigator(mockMapManager);

      await nav.executeAction({
        name: 'flyToLocation',
        args: {
          locationName: 'Gunung Bromo',
          longitude: 112.953,
          latitude: -7.942,
          zoom: 13,
          pitch: 55,
          bearing: 30
        }
      });

      expect(mockMap.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [112.953, -7.942],
          zoom: 13,
          pitch: 55,
          bearing: 30,
          essential: true
        })
      );
    });

    it('should execute switchBasemap and toggleProjection actions', async () => {
      const nav = new AINavigator(mockMapManager);

      await nav.executeAction({
        name: 'switchBasemap',
        args: { basemapId: 'esri-topographic' }
      });
      expect(mockMapManager.setBasemap).toHaveBeenCalledWith('esri-topographic');

      await nav.executeAction({
        name: 'toggleProjection',
        args: { projection: 'globe' }
      });
      expect(mockMapManager.setProjection).toHaveBeenCalledWith('globe');
    });

    it('should support BYOK (custom API key) persistence in localStorage', () => {
      const nav = new AINavigator(mockMapManager);
      expect(nav.getCustomApiKey()).toBe('');

      nav.setCustomApiKey('AIzaSyCustomUserTestKey123');
      expect(nav.getCustomApiKey()).toBe('AIzaSyCustomUserTestKey123');
      expect(localStorage.getItem('webgis_gemini_custom_key')).toBe('AIzaSyCustomUserTestKey123');

      nav.setCustomApiKey('');
      expect(nav.getCustomApiKey()).toBe('');
      expect(localStorage.getItem('webgis_gemini_custom_key')).toBeNull();
    });
  });
});
