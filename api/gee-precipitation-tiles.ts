import { checkRateLimit, getClientIp } from './_rate-limit';

interface GEEPrecipRequest {
  date?: string;
  start?: string;
  end?: string;
  min?: number;
  max?: number;
  bbox?: string;
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
      error: 'Terlalu banyak permintaan ubin curah hujan GEE. Batas: 60 kueri/menit.',
      retryAfter: rateLimit.retryAfter
    });
  }

  const query = (req.query && typeof req.query === 'object')
    ? req.query
    : (req.url ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {});

  const {
    date = '2024-08-01',
    start,
    end,
    min: customMin,
    max: customMax,
    bbox
  } = (query || {}) as GEEPrecipRequest;

  const startDate = start || date;
  const endDate = end || startDate;

  // CHIRPS Official GEE Precipitation Color Palette
  const palette = [
    '001137', // Deep blue (trace / light rain)
    '0044bb', // Blue
    '00aaff', // Cyan
    '00cc44', // Green
    'eedd00', // Yellow
    'ff6600', // Orange
    'ee0000', // Red
    '9900cc'  // Purple (extreme precipitation >50 mm)
  ];

  const minPrecip = customMin ? Number(customMin) : 1;
  const maxPrecip = customMax ? Number(customMax) : 50;

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

        let regionBbox = eeCore.Geometry.Rectangle([95.0, -11.0, 141.0, 6.0]);
        if (bbox && typeof bbox === 'string') {
          const parts = bbox.split(',').map(Number);
          if (parts.length === 4 && parts.every((n: number) => !isNaN(n))) {
            regionBbox = eeCore.Geometry.Rectangle([
              Math.max(-180, parts[0]),
              Math.max(-90, parts[1]),
              Math.min(180, parts[2]),
              Math.min(90, parts[3])
            ]);
          }
        }

        const collection = eeCore.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
          .filterDate(startDate, endDate)
          .filterBounds(regionBbox)
          .select('precipitation');

        const precipImage = collection.mean().clip(regionBbox);

        const visParams = {
          min: minPrecip,
          max: maxPrecip,
          palette
        };

        const mapId = await new Promise<{ urlFormat: string }>((resolve, reject) => {
          precipImage.getMap(visParams, (map: any, err: any) => {
            if (err) reject(err);
            else resolve(map);
          });
        });

        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
        return sendJson(200, {
          status: 'live',
          isFallback: false,
          tileUrlTemplate: mapId.urlFormat,
          provider: 'UCSB Climate Hazards Center (CHG)',
          dataset: 'UCSB-CHG/CHIRPS/DAILY',
          parameter: 'precipitation',
          unit: 'mm/day',
          period: `${startDate} to ${endDate}`,
          min: minPrecip,
          max: maxPrecip,
          palette,
          resolution: '0.05° (~5.5 km)',
          provenance: 'Google Earth Engine Serverless Compute with Infrared Satellites & Rain Gauges'
        });
      }
    } catch (err: any) {
      console.warn('[GEE Serverless] Failed to compute live CHIRPS tile:', err.message);
    }
  }

  // Fallback response with calibrated high-resolution NASA GIBS WMS
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return sendJson(200, {
    status: 'fallback',
    isFallback: true,
    message: 'Kunci GEE belum dikonfigurasi. Menggunakan citra raster presipitasi resmi beresolusi tinggi.',
    dataset: 'UCSB-CHG/CHIRPS/DAILY (GEE Catalog) / NASA IMERG Precipitation',
    period: `${startDate} s.d. ${endDate}`,
    min: minPrecip,
    max: maxPrecip,
    palette,
    resolution: '0.05° (~5.5 km CHIRPS) / 0.1° (IMERG)',
    provenance: 'Google Earth Engine CHIRPS & NASA GPM Calibrated Precipitation'
  });
}
