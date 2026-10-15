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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : (res.statusCode = 200, res.end());
  }

  // Rate Limiting (10 requests/minute per IP, because GEE export is expensive)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, { maxRequests: 10, windowSeconds: 60 });

  res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetTime));

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter));
    return sendJson(429, {
      error: 'Terlalu banyak kueri unduhan. Batas: 10 kueri/menit.',
      retryAfter: rateLimit.retryAfter
    });
  }

  const query = (req.query && typeof req.query === 'object')
    ? req.query
    : (req.url ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {});

  let body: any = {};
  if (req.body) {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      body = {};
    }
  }

  // Extract params from both query and body
  const params = { ...(query || {}), ...(body || {}) };
  const { dataset, startDate, endDate, bbox, scale } = params as any;

  if (!dataset || !bbox) {
    return sendJson(400, { error: 'Parameter dataset dan bbox wajib diisi.' });
  }

  const serviceAccountKeyStr = process.env.GEE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKeyStr) {
    const sampleFilename = dataset === 'chirps-precip' ? 'chirps_precipitation_sample.tif' : (dataset === 'esa-landcover' ? 'worldcover_lulc_sample.tif' : 'modis_lst_sample.tif');
    const sampleTiffUrl = `https://storage.googleapis.com/earthengine-community/sample_data/${sampleFilename}`;
    return sendJson(200, {
      status: 'simulated',
      message: 'Server dalam mode simulasi (kunci GEE_SERVICE_ACCOUNT_KEY belum terpasang). Mengunduh berkas GeoTIFF sampel.',
      downloadUrl: sampleTiffUrl,
      dataset,
      bbox
    });
  }

  try {
    const ee = await import('@google/earthengine' as any).catch(() => null);
    if (!ee || !(ee.default || ee).data) {
      return sendJson(500, { error: 'Earth Engine library tidak tersedia di server.' });
    }

    const eeCore = ee.default || ee;
    const privateKey = JSON.parse(serviceAccountKeyStr);

    await new Promise((resolve, reject) => {
      eeCore.data.authenticateViaPrivateKey(
        privateKey,
        () => eeCore.initialize(null, null, resolve, reject),
        reject
      );
    });

function calculateAdaptiveScale(bboxParts: number[], requestedScale: number, maxPixels = 3_500_000): number {
  const [minLng, minLat, maxLng, maxLat] = bboxParts;
  const midLat = (minLat + maxLat) / 2;
  const latMeters = Math.abs(maxLat - minLat) * 111320;
  const lngMeters = Math.abs(maxLng - minLng) * 111320 * Math.cos((midLat * Math.PI) / 180);

  const cols = lngMeters / requestedScale;
  const rows = latMeters / requestedScale;
  const totalPixels = cols * rows;
  const maxDim = Math.max(cols, rows);

  if (totalPixels <= maxPixels && maxDim <= 10000) {
    return requestedScale;
  }

  const scaleForPixels = Math.sqrt((lngMeters * latMeters) / maxPixels);
  const scaleForDim = maxDim > 10000 ? Math.max(lngMeters, latMeters) / 10000 : requestedScale;
  return Math.ceil(Math.max(requestedScale, scaleForPixels, scaleForDim));
}

    let regionBbox: any;
    let parts: number[] = [];
    if (bbox && typeof bbox === 'string') {
      parts = bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every((n: number) => !isNaN(n))) {
        regionBbox = eeCore.Geometry.Rectangle([
          Math.max(-180, parts[0]),
          Math.max(-90, parts[1]),
          Math.min(180, parts[2]),
          Math.min(90, parts[3])
        ]);
      } else {
        return sendJson(400, { error: 'Format bbox tidak valid. Gunakan minLng,minLat,maxLng,maxLat' });
      }
    }

    let finalImage;

    // Build the collection query based on dataset
    if (dataset === 'modis-lst-day' || dataset === 'modis-lst-night') {
      const bandName = dataset === 'modis-lst-day' ? 'LST_Day_1km' : 'LST_Night_1km';
      const modisTerra = eeCore.ImageCollection('MODIS/061/MOD11A2')
        .filterDate(startDate || '2024-01-01', endDate || '2024-01-31')
        .filterBounds(regionBbox)
        .select(bandName);
      const modisAqua = eeCore.ImageCollection('MODIS/061/MYD11A2')
        .filterDate(startDate || '2024-01-01', endDate || '2024-01-31')
        .filterBounds(regionBbox)
        .select(bandName);

      // Merge and mean, apply scale factor, convert to Celsius
      finalImage = modisTerra.merge(modisAqua)
        .mean()
        .multiply(0.02)
        .subtract(273.15)
        .clip(regionBbox);
        
      // Keep only pixels over land using MODIS land mask (from LST QA) if desired, 
      // but for export we can just export the raw mean values.

    } else if (dataset === 'chirps-precip') {
      finalImage = eeCore.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
        .filterDate(startDate || '2024-01-01', endDate || '2024-01-31')
        .filterBounds(regionBbox)
        .select('precipitation')
        .mean()
        .clip(regionBbox);
    } else if (dataset === 'esa-landcover') {
      finalImage = eeCore.ImageCollection('ESA/WorldCover/v200')
        .filterBounds(regionBbox)
        .select('Map')
        .mosaic()
        .clip(regionBbox);
    } else {
      return sendJson(400, { error: 'Dataset tidak didukung.' });
    }

    // Get the Download URL with Adaptive Scale to guarantee staying within GEE payload limits (<50MB)
    const rawScale = parseInt(scale || '1000', 10);
    const dlScale = parts.length === 4 ? calculateAdaptiveScale(parts, rawScale) : rawScale;
    const dlUrl = await new Promise<string>((resolve, reject) => {
      finalImage.getDownloadURL({
        name: `export_${dataset}_${Date.now()}`,
        scale: dlScale,
        region: regionBbox,
        crs: 'EPSG:4326',
        format: 'GEO_TIFF'
      }, (url: string, err: any) => {
        if (err) reject(err);
        else resolve(url);
      });
    });

    return sendJson(200, {
      status: 'success',
      downloadUrl: dlUrl,
      dataset,
      bbox,
      effectiveScale: dlScale
    });
  } catch (err: any) {
    console.error('[GEE Export] Error:', err);
    return sendJson(500, {
      error: 'Terjadi kesalahan saat memproses ekspor GEE',
      details: err.message
    });
  }
}
