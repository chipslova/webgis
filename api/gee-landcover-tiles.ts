export const config = {
  maxDuration: 60
};

import { checkRateLimit, getClientIp } from './_rate-limit.js';



export default async function handler(req: any, res: any) {
  const sendJson = (status: number, data: any) => {
    if (typeof res.status === 'function') {
      return res.status(status).json(data);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : (res.statusCode = 200, res.end());
  }

  if (req.method !== 'GET') {
    return sendJson(405, { error: 'Method Not Allowed' });
  }

  // Rate Limiting (60 requests/minute per IP)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, { maxRequests: 60, windowSeconds: 60 });

  res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetTime));

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter));
    return sendJson(429, {
      error: 'Terlalu banyak permintaan ubin tutupan lahan GEE. Batas: 60 kueri/menit.',
      retryAfter: rateLimit.retryAfter
    });
  }

  const query = (req.query && typeof req.query === 'object')
    ? req.query
    : (req.url ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {});

  const {
    year = '2021'
  } = (query || {}) as any;

  // ESA WorldCover v200 provides 2021 data (v100 provides 2020)
  // 10: Trees (006400), 20: Shrubland (ffbb22), 30: Grassland (ffff4c), 
  // 40: Cropland (f096ff), 50: Built-up (fa0000), 60: Barren (b4b4b4),
  // 70: Snow/Ice (f0f0f0), 80: Open Water (0064c8), 90: Herbaceous Wetland (0096a0), 100: Mangroves (00cf75), 110: Moss/Lichen (fae6a0)
  const palette = [
    '006400', 'ffbb22', 'ffff4c', 'f096ff', 'fa0000', 'b4b4b4', 'f0f0f0', '0064c8', '0096a0', '00cf75', 'fae6a0'
  ];

  const serviceAccountKeyStr = process.env.GEE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKeyStr) {
    try {
      const ee = await import('@google/earthengine' as any).catch(() => null);
      if (ee && (ee.default || ee).data) {
        const eeCore = ee.default || ee;
        const privateKey = JSON.parse(serviceAccountKeyStr);

        await new Promise((resolve, reject) => {
          eeCore.data.authenticateViaPrivateKey(
            privateKey,
            () => eeCore.initialize(null, null, resolve, reject),
            reject
          );
        });

        const collection = eeCore.ImageCollection('ESA/WorldCover/v200');
        const lcImage = collection.mosaic().select('Map');

        // Official ESA WorldCover v200 class values
        const from = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
        const to   = [ 1,  2,  3,  4,  5,  6,  7,  8,  9, 10,  11];

        // Remap discrete classes and mask out 0 (nodata/open sea) for true PNG transparency
        const remapped = lcImage.remap(from, to, 0);
        const masked = remapped.updateMask(remapped.gt(0));

        const visParams = {
          min: 1,
          max: 11,
          palette,
          format: 'png'
        };

        const mapId = await new Promise<{ urlFormat: string }>((resolve, reject) => {
          masked.getMap(visParams, (map: any, err: any) => {
            if (err) reject(err);
            else resolve(map);
          });
        });

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        return sendJson(200, {
          status: 'live',
          isFallback: false,
          tileUrlTemplate: mapId.urlFormat,
          provider: 'ESA',
          dataset: 'ESA/WorldCover/v200',
          parameter: 'landcover',
          unit: 'class',
          period: year,
          palette,
          resolution: '10m',
          provenance: 'Google Earth Engine Serverless Compute with Infrared Satellites & Rain Gauges'
        });
      }
    } catch (err: any) {
      console.warn('[GEE Serverless] Failed to compute live ESA WorldCover tile:', err.message);
    }
  }

  // Fallback response
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return sendJson(200, {
    status: 'fallback',
    isFallback: true,
    message: 'Kunci GEE belum dikonfigurasi. Menggunakan citra raster tutupan lahan cadangan.',
    dataset: 'ESA WorldCover (Fallback)',
    period: year,
    palette,
    resolution: '10m',
    provenance: 'ESA'
  });
}
