import { describe, it, expect, vi } from 'vitest';
import handler from '../api/gee-zonal-stats';
import { SpatialAnalysisEngine, ZonalAnalysisResult } from '../src/tools/spatial-analysis';

describe('Google Earth Engine Real Zonal Stats API & Integration', () => {
  const validPolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[
      [106.8, -6.2],
      [106.9, -6.2],
      [106.9, -6.3],
      [106.8, -6.3],
      [106.8, -6.2]
    ]]
  };

  it('should reject GET requests with Method Not Allowed (405)', async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockReq = {
      method: 'GET',
      headers: {}
    };

    const mockRes = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => { jsonBody = data; }
        };
      }
    };

    await handler(mockReq, mockRes);
    expect(statusCode).toBe(405);
    expect(jsonBody?.error).toContain('Method Not Allowed');
  });

  it('should reject invalid geometry payloads with Bad Request (400)', async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const mockReq = {
      method: 'POST',
      body: { geometry: null }
    };

    const mockRes = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => { jsonBody = data; }
        };
      }
    };

    await handler(mockReq, mockRes);
    expect(statusCode).toBe(400);
  });

  it('should return unconfigured status when GEE_SERVICE_ACCOUNT_KEY is not set', async () => {
    delete process.env.GEE_SERVICE_ACCOUNT_KEY;

    let statusCode = 0;
    let jsonBody: any = null;

    const mockReq = {
      method: 'POST',
      body: {
        geometry: validPolygon,
        regionName: 'Test Area'
      }
    };

    const mockRes = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => { jsonBody = data; }
        };
      }
    };

    await handler(mockReq, mockRes);
    expect(statusCode).toBe(200);
    expect(jsonBody.status).toBe('unconfigured');
    expect(jsonBody.isRealGEE).toBe(false);
    expect(jsonBody.message).toContain('Kunci Service Account Google Earth Engine belum dipasang');
  });

  it('should format CSV with Real GEE metadata when isRealGEE is true', () => {
    const mockRealResult: ZonalAnalysisResult = {
      regionName: 'IKN Verified Cluster',
      totalAreaKm2: 450.2,
      totalAreaHa: 45020,
      dominantClass: 'Tutupan Pohon / Hutan',
      timestamp: '21 Sep 2026',
      isEstimated: false,
      estimationMethod: 'Google Earth Engine Cloud (Live reduceRegion)',
      isRealGEE: true,
      totalPixelCount: 1125000,
      computationSource: 'Google Earth Engine Cloud Cluster',
      thermalStats: {
        minTempC: 18.2,
        meanTempC: 24.5,
        maxTempC: 31.0,
        hotspotAreaKm2: 25.0,
        hotspotPercentage: 5.5
      },
      landCoverBreakdown: [
        { code: 2, name: 'Trees', nameId: 'Tutupan Pohon', color: '#358221', areaKm2: 380, percentage: 84.4 }
      ],
      geojson: {
        type: 'Feature',
        geometry: validPolygon,
        properties: {}
      }
    };

    const csv = SpatialAnalysisEngine.exportToCSV(mockRealResult);
    expect(csv).toContain('DATA PIKSEL ASLI GOOGLE EARTH ENGINE');
    expect(csv).toContain('Google Earth Engine Cloud Cluster');
    expect(csv).toContain('1.125.000');
  });
});
