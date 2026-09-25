// Vercel Edge Function: Google Gemini AI Map Navigator & Copilot
// Endpoint: /api/gemini-navigator

export const config = {
  runtime: 'edge'
};

import { checkRateLimit, getClientIp } from './_rate-limit';

// --- Layer 2: Global Daily Kill-Switch (Zero-Bill Guarantee) ---
const GLOBAL_DAILY_CEILING = 1000;
let dailyRequestCount = 0;
let nextResetUtcTimestamp = getNextMidnightUtc();

function getNextMidnightUtc(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function checkAndIncrementDailyQuota(): { allowed: boolean; remaining: number; resetInHours: number } {
  const now = Date.now();
  if (now >= nextResetUtcTimestamp) {
    dailyRequestCount = 0;
    nextResetUtcTimestamp = getNextMidnightUtc();
  }

  const resetInHours = Math.max(1, Math.round((nextResetUtcTimestamp - now) / (1000 * 60 * 60)));

  if (dailyRequestCount >= GLOBAL_DAILY_CEILING) {
    return {
      allowed: false,
      remaining: 0,
      resetInHours
    };
  }

  dailyRequestCount += 1;
  return {
    allowed: true,
    remaining: GLOBAL_DAILY_CEILING - dailyRequestCount,
    resetInHours
  };
}

// Function Declarations for Gemini Function Calling
const GIS_FUNCTION_DECLARATIONS = [
  {
    name: 'flyToLocation',
    description: 'Fly and smoothly animate the map camera to a specific city, mountain, volcano, province, island, landmark, or coordinates in Indonesia or globally.',
    parameters: {
      type: 'OBJECT',
      properties: {
        locationName: {
          type: 'STRING',
          description: 'Descriptive name of the destination (e.g. "Gunung Bromo", "Jakarta Monas", "IKN Nusantara", "Danau Toba", "Gunung Merapi", "Surabaya")'
        },
        longitude: {
          type: 'NUMBER',
          description: 'WGS84 Longitude (e.g. 112.953 for Bromo, 106.827 for Monas Jakarta, 116.7 for IKN Nusantara)'
        },
        latitude: {
          type: 'NUMBER',
          description: 'WGS84 Latitude (e.g. -7.942 for Bromo, -6.175 for Monas Jakarta, -0.97 for IKN Nusantara)'
        },
        zoom: {
          type: 'NUMBER',
          description: 'Appropriate camera zoom level between 3 and 16. Recommended: 12-14 for mountains and city centers.'
        },
        pitch: {
          type: 'NUMBER',
          description: 'Camera tilt angle in degrees: 0 for flat 2D overhead, or 45 to 65 for dramatic 3D mountain/terrain perspective.'
        },
        bearing: {
          type: 'NUMBER',
          description: 'Compass heading rotation in degrees (0 to 360). Default 0 (North).'
        }
      },
      required: ['locationName', 'longitude', 'latitude']
    }
  },
  {
    name: 'switchBasemap',
    description: 'Switch the map basemap style to satellite, streets, topography, national RBI, or dark canvas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        basemapId: {
          type: 'STRING',
          enum: [
            'esri-imagery',
            'esri-streets',
            'big-rbi',
            'osm-standard',
            'esri-topographic',
            'esri-dark-grey',
            'open-topo',
            'esri-relief',
            'esri-natgeo',
            'esri-ocean'
          ],
          description: 'Target basemap ID: "esri-imagery" (Citra Satelit), "esri-streets" (Jalan Kota), "big-rbi" (Peta Topografi Nasional RBI BIG), "osm-standard" (OpenStreetMap), "esri-topographic" (Topografi & Kontur), "esri-dark-grey" (Kanvas Gelap), "open-topo" (OpenTopoMap), "esri-relief" (Relief Bayangan), "esri-ocean" (Batimetri Laut).'
        }
      },
      required: ['basemapId']
    }
  },
  {
    name: 'toggleProjection',
    description: 'Switch the map projection between 3D Globe Earth and flat 2D Mercator.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projection: {
          type: 'STRING',
          enum: ['globe', 'mercator'],
          description: 'Projection mode: "globe" for 3D planetary sphere, "mercator" for standard flat 2D cartography.'
        }
      },
      required: ['projection']
    }
  },
  {
    name: 'filterStations',
    description: 'Filter or search the CFSv2 meteorological / weather observation stations dataset.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Text query to filter stations by name, island, or province (e.g. "Jawa", "Sumatera", "BMKG", "Klimatologi", "Monas")'
        },
        minElevation: {
          type: 'NUMBER',
          description: 'Minimum station elevation in meters (optional)'
        },
        maxElevation: {
          type: 'NUMBER',
          description: 'Maximum station elevation in meters (optional)'
        }
      }
    }
  },
  {
    name: 'activateTool',
    description: 'Open or activate a specific built-in tool or UI panel on the WebGIS.',
    parameters: {
      type: 'OBJECT',
      properties: {
        toolName: {
          type: 'STRING',
          enum: [
            'measure',
            'spatial-analysis',
            'point-inspector',
            'swipe-compare',
            'attribute-table',
            'basemap-gallery',
            'reset-view',
            'start-tour'
          ],
          description: 'The tool to open: "measure" (pengukuran jarak/luas), "spatial-analysis" (analisis zonal GEE/buffer), "point-inspector" (inspeksi koordinat), "swipe-compare" (komparasi layar belah), "attribute-table" (tabel atribut data spasial), "basemap-gallery" (panel basemap), "reset-view" (kembali ke tampilan nusantara), "start-tour" (tur 30 detik).'
        }
      },
      required: ['toolName']
    }
  }
];

export default async function handler(req: any, res?: any): Promise<Response | void> {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Key',
    'Content-Type': 'application/json'
  };

  // Helper to send response in both Edge (Response) and Node (res.status.json)
  const send = (status: number, data: any, extraHeaders: Record<string, string> = {}) => {
    if (res && typeof res.setHeader === 'function') {
      res.statusCode = status;
      for (const [k, v] of Object.entries({ ...corsHeaders, ...extraHeaders })) {
        res.setHeader(k, v);
      }
      if (typeof res.status === 'function') {
        const s = res.status(status);
        if (s && typeof s.json === 'function') {
          s.json(data);
          return;
        }
      }
      if (typeof res.json === 'function') {
        res.json(data);
        return;
      }
      res.end(JSON.stringify(data));
      return;
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, ...extraHeaders }
    });
  };

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    if (res && typeof res.setHeader === 'function') {
      res.statusCode = 204;
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.setHeader(k, v);
      }
      res.end();
      return;
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return send(405, { error: 'Method Not Allowed. Gunakan POST.' });
  }

  try {
    // 1. Layer 1: Per-IP Rate Limiting
    const clientIp = getClientIp(req);
    const ipLimit = checkRateLimit(clientIp, { maxRequests: 10, windowSeconds: 120 });
    const limitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': String(ipLimit.limit),
      'X-RateLimit-Remaining': String(ipLimit.remaining),
      'X-RateLimit-Reset': String(ipLimit.resetTime)
    };

    if (!ipLimit.allowed) {
      return send(429, {
        error: 'Mohon jeda sebentar (Rate Limit Tercapai). Maksimal 10 perintah AI per 2 menit untuk mencegah spam.',
        retryAfter: ipLimit.retryAfter
      }, { ...limitHeaders, 'Retry-After': String(ipLimit.retryAfter) });
    }

    // 2. Parse Request Body
    let body: any = {};
    if (typeof req.json === 'function') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    } else if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = {};
      }
    } else if (req.body && typeof req.body === 'object' && !(req.body instanceof ReadableStream)) {
      body = req.body;
    }

    const rawPrompt = (body?.prompt || '').trim();
    if (!rawPrompt) {
      return send(400, { error: 'Prompt pertanyaan/perintah tidak boleh kosong.' }, limitHeaders);
    }

    // 3. Layer 3: Input Clamping (Max 400 chars)
    const prompt = rawPrompt.slice(0, 400);

    // 4. API Key Resolution
    let headerKey = '';
    if (typeof req.headers?.get === 'function') {
      headerKey = req.headers.get('x-gemini-key') || '';
    } else if (req.headers) {
      headerKey = req.headers['x-gemini-key'] || '';
    }

    const apiKey = (process.env.GEMINI_API_KEY || headerKey || '').trim();

    if (!apiKey) {
      return send(500, {
        error: 'Kunci API Google Gemini (GEMINI_API_KEY) belum dikonfigurasi di Vercel Environment Variables. Silakan periksa kembali pengaturan Vercel Anda.',
        missingKey: true
      }, limitHeaders);
    }

    // 5. Global Daily Quota Ceiling (Safety Kill-Switch)
    const isCustomUserKey = Boolean(headerKey && headerKey !== process.env.GEMINI_API_KEY);
    if (!isCustomUserKey) {
      const dailyQuota = checkAndIncrementDailyQuota();
      if (!dailyQuota.allowed) {
        return send(429, {
          error: `Batas kapasitas harian AI gratis WebGIS (${GLOBAL_DAILY_CEILING} kueri/hari) telah tercapai demi menjamin biaya $0. Reset dalam ${dailyQuota.resetInHours} jam.`,
          dailyQuotaExceeded: true,
          resetInHours: dailyQuota.resetInHours
        }, limitHeaders);
      }
    }

    // 6. Construct Context and Prompt
    const mapContext = body?.context;
    const contextDescription = mapContext
      ? `Konteks Peta Saat Ini: Pusat=[${mapContext.center?.[0]?.toFixed?.(3) || 117.89}, ${mapContext.center?.[1]?.toFixed?.(3) || -2.55}], Zoom=${mapContext.zoom?.toFixed?.(1) || 4.5}, Basemap=${mapContext.basemapId || 'esri-imagery'}, Proyeksi=${mapContext.projection || 'mercator'}.`
      : 'Konteks Peta: Tampilan default kepulauan Indonesia.';

    const systemPrompt = `Anda adalah "AI Navigator & Geospatial Copilot" resmi untuk platform WebGIS "Digital Earth Indonesia".
Tugas utama Anda:
1. Membantu pengguna menjelajahi peta, gunung api, kota, kepulauan, dan stasiun iklim di Indonesia dan dunia.
2. Ketika pengguna meminta terbang, navigasi, melihat lokasi, mencari tempat, mengganti basemap, beralih ke bola bumi 3D, memfilter stasiun cuaca, atau membuka alat, SELALU panggil fungsi (tool call) yang relevan (misalnya flyToLocation, switchBasemap, toggleProjection, filterStations, activateTool).
3. Berikan koordinat geospasial WGS84 yang akurat untuk kota/gunung/pulau di Indonesia (misal: Bromo [112.953, -7.942], Merapi [110.442, -7.540], IKN Nusantara [116.700, -0.970], Danau Toba [98.880, 2.684], Monas Jakarta [106.827, -6.175], dsb).
4. Gunakan sudut kemiringan pitch 50-60 derajat untuk pemandangan 3D gunung atau landmark perbukitan.
5. Jawab dalam Bahasa Indonesia yang ramah, ringkas (maksimal 2-3 kalimat), dan langsung ke inti navigasi.
${contextDescription}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      tools: [
        {
          functionDeclarations: GIS_FUNCTION_DECLARATIONS
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 400
      }
    };

    // 7. Request to Google Gemini with automatic model fallback
    const models = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
    let lastError: Error | null = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 404 || response.status === 503) {
            lastError = new Error(`Model ${model} (${response.status}): ${errText}`);
            continue;
          }
          if (response.status === 429) {
            return send(429, {
              error: 'Batas kuota gratis Google Gemini sedang penuh (Google 429). Mohon tunggu beberapa saat dan coba kembali.',
              retryAfter: 30
            }, limitHeaders);
          }
          return send(response.status, {
            error: `Google Gemini API Error (${response.status}): ${errText}`
          }, limitHeaders);
        }

        const data: any = await response.json();
        const candidate = data?.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        let replyText = '';
        const actions: Array<{ name: string; args: Record<string, any> }> = [];

        for (const part of parts) {
          if (part.text) {
            replyText += part.text;
          }
          if (part.functionCall) {
            actions.push({
              name: part.functionCall.name,
              args: part.functionCall.args || {}
            });
          }
        }

        if (!replyText.trim() && actions.length > 0) {
          const first = actions[0];
          if (first.name === 'flyToLocation') {
            replyText = `Mengarahkan kamera peta ke ${first.args.locationName || 'lokasi tujuan'}...`;
          } else if (first.name === 'switchBasemap') {
            replyText = `Mengubah peta dasar ke gaya "${first.args.basemapId}"...`;
          } else if (first.name === 'toggleProjection') {
            replyText = `Mengalihkan proyeksi peta ke ${first.args.projection === 'globe' ? 'Bola Bumi 3D' : 'Mercator 2D'}...`;
          } else if (first.name === 'activateTool') {
            replyText = `Membuka alat spasial "${first.args.toolName}"...`;
          } else {
            replyText = 'Menjalankan perintah navigasi peta...';
          }
        }

        return send(200, {
          success: true,
          reply: replyText.trim(),
          actions,
          modelUsed: model,
          isFreeTier: true
        }, limitHeaders);
      } catch (e: any) {
        lastError = e;
      }
    }

    return send(500, {
      error: `Gagal berkomunikasi dengan Google Gemini API: ${lastError?.message || 'Network error'}`
    }, limitHeaders);
  } catch (err: any) {
    return send(500, {
      error: `Terjadi kendala pada server AI: ${err?.message || 'Internal Server Error'}`
    });
  }
}
