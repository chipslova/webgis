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
  satellite?: 'terra' | 'aqua' | 'combined' | 'precipitation';
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

  const { lat, lon, startDate = '2024-01-01', endDate = '2026-12-31', satellite = 'terra' } = body;

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

        if (satellite === 'precipitation') {
          const chirpsCol = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
            .filterDate(startDate, endDate)
            .filterBounds(eePoint)
            .select(['precipitation']);

          const tsPromise = new Promise<any[]>((resolve, reject) => {
            const ts = chirpsCol.map((image: any) => {
              const dict = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: eePoint,
                scale: 5000,
                maxPixels: 1e9
              });
              return ee.Feature(null, {
                'date': image.date().format('YYYY-MM-dd'),
                'precip': dict.get('precipitation')
              });
            });

            ts.getInfo((val: any, err: any) => {
              if (err) reject(err);
              else resolve(val?.features || []);
            });
          });

          const rawFeatures = await tsPromise;
          const timeSeriesData = rawFeatures.map((f: any) => {
            const raw = f.properties?.precip;
            return {
              date: f.properties?.date,
              precip: typeof raw === 'number' && !isNaN(raw) ? Number(raw.toFixed(1)) : null
            };
          });

          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
          return sendJson(200, {
            status: 'success',
            source: 'UCSB-CHG/CHIRPS/DAILY',
            point: [lon, lat],
            data: timeSeriesData
          });
        }

        const collectionId = satellite === 'aqua' ? 'MODIS/061/MYD11A2' : 'MODIS/061/MOD11A2';

        const modisCol = ee.ImageCollection(collectionId)
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

        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        return sendJson(200, {
          status: 'success',
          source: collectionId,
          point: [lon, lat],
          data: timeSeriesData
        });
      }
    } catch (err: any) {
      console.error('[GEE TimeSeries Error]', err);
      return sendJson(500, { error: 'Terjadi kesalahan saat memproses data Earth Engine: ' + err.message });
    }
  }

  // When GEE_SERVICE_ACCOUNT_KEY is not configured: do NOT produce simulated / fake numbers.
  // Return honest unconfigured status with empty data array and visitor-friendly guidance.
  if (satellite === 'precipitation') {
    return sendJson(200, {
      status: 'unconfigured',
      message: 'Data numerik time-series CHIRPS belum tersedia pada versi demo ini. Visualisasi raster peta tetap aktif via layer satelit.',
      point: [lon, lat],
      data: []
    });
  }

  return sendJson(200, {
    status: 'unconfigured',
    message: 'Data numerik time-series MODIS LST belum tersedia pada versi demo ini. Visualisasi raster peta harian tetap aktif via NASA GIBS WMS (1 km).',
    point: [lon, lat],
    data: []
  });
}
