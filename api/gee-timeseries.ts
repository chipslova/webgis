// Vercel Serverless Function: Real-Time Google Earth Engine Time-Series
// Endpoint: /api/gee-timeseries

export const config = {
  maxDuration: 60 // Time-series reductions can take longer
};

import { checkRateLimit, getClientIp } from './_rate-limit.js';

interface TimeSeriesRequestBody {
  lat: number;
  lon: number;
  startDate?: string;
  endDate?: string;
}

export default async function handler(req: any, res: any) {
  const sendJson = (status: number, data: any) => {
    if (typeof res.status === 'function') {
      return res.status(status).json(data);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : (res.statusCode = 200, res.end());
  }

  if (req.method !== 'POST') {
    return sendJson(405, { error: 'Method Not Allowed. Use POST.' });
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, { maxRequests: 20, windowSeconds: 60 });

  res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetTime));

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter));
    return sendJson(429, {
      error: 'Terlalu banyak permintaan deret waktu (Rate limit exceeded).',
      retryAfter: rateLimit.retryAfter
    });
  }

  let body: TimeSeriesRequestBody;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return sendJson(400, { error: 'Invalid JSON request body.' });
  }

  const { lat, lon, startDate = '2023-01-01', endDate = '2024-01-01' } = body;

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return sendJson(400, { error: 'lat and lon are required numeric parameters.' });
  }

  const serviceAccountKeyStr = process.env.GEE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKeyStr) {
    try {
      const eeModule = await import('@google/earthengine' as any).catch(() => null);
      const ee = eeModule?.default || eeModule;

      if (ee && ee.data) {
        const privateKey = JSON.parse(serviceAccountKeyStr);

        await new Promise((resolve, reject) => {
          ee.data.authenticateViaPrivateKey(
            privateKey,
            () => ee.initialize(null, null, resolve, reject),
            reject
          );
        });

        const eePoint = ee.Geometry.Point([lon, lat]);

        const modisCol = ee.ImageCollection('MODIS/061/MOD11A2')
          .filterDate(startDate, endDate)
          .filterBounds(eePoint)
          .select(['LST_Day_1km', 'LST_Night_1km']);

        const tsPromise = new Promise<any[]>((resolve, reject) => {
          // Map a function to extract value at point
          const ts = modisCol.map((image: any) => {
            const dict = image.reduceRegion({
              reducer: ee.Reducer.mean(),
              geometry: eePoint,
              scale: 1000,
              maxPixels: 1e9
            });
            return ee.Feature(null, {
              'date': image.date().format('YYYY-MM-dd'),
              'day_lst': dict.get('LST_Day_1km'),
              'night_lst': dict.get('LST_Night_1km')
            });
          });

          ts.getInfo((val: any, err: any) => {
            if (err) reject(err);
            else resolve(val?.features || []);
          });
        });

        const rawFeatures = await tsPromise;

        const timeSeriesData = rawFeatures
          .map((f: any) => {
            const dayRaw = f.properties.day_lst;
            const nightRaw = f.properties.night_lst;
            return {
              date: f.properties.date,
              day_c: typeof dayRaw === 'number' ? Number(((dayRaw * 0.02) - 273.15).toFixed(1)) : null,
              night_c: typeof nightRaw === 'number' ? Number(((nightRaw * 0.02) - 273.15).toFixed(1)) : null
            };
          })
          .filter((f) => f.day_c !== null || f.night_c !== null);

        return sendJson(200, {
          status: 'success',
          source: 'MODIS/061/MOD11A2',
          point: [lon, lat],
          data: timeSeriesData
        });
      }
    } catch (err: any) {
      console.error('[GEE TimeSeries Error]', err);
      return sendJson(500, { error: 'Terjadi kesalahan saat memproses data Earth Engine: ' + err.message });
    }
  }

  // Fallback if no keys
  return sendJson(200, {
    status: 'unconfigured',
    message: 'Kunci GEE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di server. Deret waktu riil tidak tersedia.',
    data: []
  });
}
