export const config = {
  maxDuration: 60
};

import { checkRateLimit, getClientIp } from './_rate-limit.js';

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
    max: customMax
  } = (query || {}) as GEEPrecipRequest;

  const startDate = start || date;
  const endDate = end || startDate;

  // Meteorological Weather Radar Color Palette (100% transparent dry areas, vibrant rain cells)
  const palette = [
    '00e400', // Green (Hujan ringan 2.5–10 mm)
    'ffff00', // Yellow (Hujan sedang 10–25 mm)
    'ff7e00', // Orange (Hujan lebat 25–45 mm)
    'ff0000', // Red (Hujan sangat lebat 45–70 mm)
    '99004c'  // Purple/Magenta (Ekstrem >70 mm)
  ];

  const minPrecip = customMin ? Number(customMin) : 2.5;
  const maxPrecip = customMax ? Number(customMax) : 60;

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

        let filterEndDate = endDate;
        if (startDate === endDate) {
          const dObj = new Date(startDate);
          dObj.setUTCDate(dObj.getUTCDate() + 1);
          filterEndDate = dObj.toISOString().split('T')[0];
        }

        const collection = eeCore.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
          .filterDate(startDate, filterEndDate)
          .select('precipitation');

        const rawMean = collection.mean();
        // Mask out non-rain / trace background pixels (< 2.5 mm) so dry/no-rain areas are 100% transparent and the base map remains completely visible
        const precipThreshold = Math.max(2.5, minPrecip);
        const precipImage = rawMean.updateMask(rawMean.gte(precipThreshold));

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
    tileUrlTemplate: `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=IMERG_Precipitation_Rate&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${startDate}&BBOX={bbox-epsg-3857}`,
    message: 'Kunci GEE belum dikonfigurasi. Menggunakan citra radar presipitasi resmi beresolusi tinggi.',
    dataset: 'NASA IMERG Precipitation (Fallback)',
    period: `${startDate} s.d. ${endDate}`,
    min: minPrecip,
    max: maxPrecip,
    palette,
    resolution: '0.1° (IMERG)',
    provenance: 'NASA GPM Calibrated Precipitation'
  });
}
