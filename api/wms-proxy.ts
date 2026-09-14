// Vercel Serverless Function: Edge WMS Proxy & Cache Layer for BIG Piksel
// Endpoint: /api/wms-proxy

export const config = {
  runtime: 'edge'
};

const UPSTREAM_WMS_HOST = 'ows.staging.piksel.big.go.id';
const UPSTREAM_WMS_URL = `https://${UPSTREAM_WMS_HOST}/wms`;

// 1x1 Transparent PNG buffer fallback for tile renderers on permanent upstream failure
const TRANSPARENT_1X1_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range'
      }
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const searchParams = url.searchParams.toString();

  if (!searchParams) {
    return new Response('Missing WMS query parameters', { status: 400 });
  }

  const targetUrl = `${UPSTREAM_WMS_URL}?${searchParams}`;
  const isImageRequest = (url.searchParams.get('FORMAT') || url.searchParams.get('format') || '').toLowerCase().includes('png');

  // Attempt fetch with single retry on 5xx / timeout
  let response: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'User-Agent': 'Digital-Earth-Indonesia-WebGIS/1.0 (Edge-Proxy)',
          'Accept': '*/*'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // If upstream is healthy (2xx or 3xx or client error 4xx), return it
      if (response.status < 500) {
        break;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  // If response succeeded and is valid
  if (response && response.status >= 200 && response.status < 400) {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    // Cache successfully served raster tiles for 1 hour at edge, 24 hours stale
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    headers.set('X-Proxy-By', 'Digital-Earth-Indonesia-Edge');

    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  // Fallback if upstream is down or 5xx
  if (isImageRequest) {
    return new Response(TRANSPARENT_1X1_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Proxy-Fallback': '1x1-transparent'
      }
    });
  }

  return new Response(`Upstream WMS service temporarily unavailable: ${lastError?.message || '502 Bad Gateway'}`, {
    status: 502,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain'
    }
  });
}
