// Vercel Serverless Function & Local Dev Handler: Google Gemini AI Map Navigator & Copilot
// Endpoint: /api/gemini-navigator

import { checkRateLimit, getClientIp } from './_rate-limit';

export const config = {
  maxDuration: 20 // Gemini Flash responds in 1-3 seconds
};

// --- Layer 2: Global Daily Kill-Switch (Zero-Bill Guarantee) ---
// Google AI Studio Free Tier allows up to 1,500 requests/day.
// We set a hard ceiling at 1,000 requests/day (leaving a 500 safety buffer).
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

export interface GeminiNavigatorRequest {
  prompt: string;
  context?: {
    center?: [number, number];
    zoom?: number;
    pitch?: number;
    bearing?: number;
    basemapId?: string;
    projection?: string;
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
          description: 'Appropriate camera zoom level between 3 (national overview) and 16 (close landmark). Recommended: 12-14 for mountains and city centers.'
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Gemini-Key');

  if (req.method === 'OPTIONS') {
    return res.status ? res.status(200).end() : ((res.statusCode = 200), res.end());
  }

  if (req.method !== 'POST') {
    return sendJson(405, { error: 'Method Not Allowed. Gunakan POST.' });
  }

  // --- Layer 1: Per-IP Rate Limiting (10 requests per 2 minutes per visitor) ---
  const clientIp = getClientIp(req);
  const ipLimit = checkRateLimit(clientIp, { maxRequests: 10, windowSeconds: 120 });

  res.setHeader('X-RateLimit-Limit', String(ipLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(ipLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(ipLimit.resetTime));

  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfter));
    return sendJson(429, {
      error: 'Mohon jeda sebentar (Rate Limit Tercapai). Maksimal 10 perintah AI per 2 menit untuk mencegah spam.',
      retryAfter: ipLimit.retryAfter
    });
  }

  // Parse Body
  let body: GeminiNavigatorRequest;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body && typeof req.on === 'function') {
      // Buffer from raw stream if needed
      body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk: any) => (raw += chunk));
        req.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
    }
  } catch {
    return sendJson(400, { error: 'Format JSON body tidak valid.' });
  }

  const rawPrompt = (body?.prompt || '').trim();
  if (!rawPrompt) {
    return sendJson(400, { error: 'Prompt pertanyaan/perintah tidak boleh kosong.' });
  }

  // --- Layer 3: Input Length & Character Clamping (Prevent prompt flooding) ---
  const prompt = rawPrompt.slice(0, 400);

  // Check API Key: Priority to process.env.GEMINI_API_KEY, with fallback to user header (BYOK)
  const headerKey = req.headers?.['x-gemini-key'] || (req.headers?.get ? req.headers.get('x-gemini-key') : null);
  const apiKey = (process.env.GEMINI_API_KEY || headerKey || '').trim();

  if (!apiKey) {
    return sendJson(500, {
      error: 'Kunci API Google Gemini (GEMINI_API_KEY) belum dikonfigurasi di server. Silakan tambahkan GEMINI_API_KEY di berkas .env.local atau Vercel Environment Variables.',
      missingKey: true
    });
  }

  // If using server key, enforce global daily quota ceiling (free tier guarantee)
  const isCustomUserKey = Boolean(headerKey && headerKey !== process.env.GEMINI_API_KEY);
  if (!isCustomUserKey) {
    const dailyQuota = checkAndIncrementDailyQuota();
    if (!dailyQuota.allowed) {
      return sendJson(429, {
        error: `Batas kapasitas harian AI gratis WebGIS (${GLOBAL_DAILY_CEILING} kueri/hari) telah tercapai demi menjamin biaya $0. Kuota akan direset kembali dalam ${dailyQuota.resetInHours} jam.`,
        dailyQuotaExceeded: true,
        resetInHours: dailyQuota.resetInHours
      });
    }
  }

  // Construct Gemini System Instruction
  const mapContext = body?.context;
  const contextDescription = mapContext
    ? `Konteks Peta Saat Ini: Pusat=[${mapContext.center?.[0]?.toFixed(3) || 117.89}, ${mapContext.center?.[1]?.toFixed(3) || -2.55}], Zoom=${mapContext.zoom?.toFixed(1) || 4.5}, Basemap=${mapContext.basemapId || 'esri-imagery'}, Proyeksi=${mapContext.projection || 'mercator'}.`
    : 'Konteks Peta: Tampilan default kepulauan Indonesia.';

  const systemPrompt = `Anda adalah "AI Navigator & Geospatial Copilot" resmi untuk platform WebGIS "Digital Earth Indonesia".
Tugas utama Anda:
1. Membantu pengguna menjelajahi peta, gunung api, kota, kepulauan, dan stasiun iklim di Indonesia dan dunia.
2. Ketika pengguna meminta terbang, navigasi, melihat lokasi, mencari tempat, mengganti basemap, beralih ke bola bumi 3D, memfilter stasiun cuaca, atau membuka alat, SELALU panggil fungsi (tool call) yang relevan (misalnya flyToLocation, switchBasemap, toggleProjection, filterStations, activateTool).
3. Berikan koordinat geospasial WGS84 yang akurat untuk kota/gunung/pulau di Indonesia (misal: Bromo [112.953, -7.942], Merapi [110.442, -7.540], IKN Nusantara [116.700, -0.970], Danau Toba [98.880, 2.684], Monas Jakarta [106.827, -6.175], dsb).
4. Gunakan sudut kemiringan pitch 50-60 derajat untuk pemandangan 3D gunung atau landmark perbukitan.
5. Jawab dalam Bahasa Indonesia yang ramah, ringkas (maksimal 2-3 kalimat), dan langsung ke inti navigasi.
${contextDescription}`;

  // Call Gemini API with Tool Declarations
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

  // Try gemini-2.0-flash, fallback to gemini-1.5-flash
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

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
        // If 404 model not found, try next model
        if (response.status === 404) {
          lastError = new Error(`Model ${model} not available: ${errText}`);
          continue;
        }
        // If 429 quota error from Google
        if (response.status === 429) {
          return sendJson(429, {
            error: 'Batas kuota gratis Google Gemini sedang penuh (Google 429). Mohon tunggu beberapa saat dan coba kembali.',
            retryAfter: 30
          });
        }
        return sendJson(response.status, {
          error: `Google Gemini API Error (${response.status}): ${errText}`
        });
      }

      const data = await response.json();
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

      // If no explicit text was returned by model but tool call exists, generate friendly confirmation
      if (!replyText.trim() && actions.length > 0) {
        const firstAction = actions[0];
        if (firstAction.name === 'flyToLocation') {
          replyText = `Mengarahkan kamera peta ke ${firstAction.args.locationName || 'lokasi yang dituju'}...`;
        } else if (firstAction.name === 'switchBasemap') {
          replyText = `Mengubah peta dasar ke gaya "${firstAction.args.basemapId}"...`;
        } else if (firstAction.name === 'toggleProjection') {
          replyText = `Mengalihkan proyeksi peta ke ${firstAction.args.projection === 'globe' ? 'Bola Bumi 3D' : 'Mercator 2D'}...`;
        } else if (firstAction.name === 'activateTool') {
          replyText = `Membuka alat spasial "${firstAction.args.toolName}"...`;
        } else {
          replyText = 'Menjalankan perintah navigasi peta...';
        }
      }

      return sendJson(200, {
        success: true,
        reply: replyText.trim(),
        actions,
        modelUsed: model,
        isFreeTier: true
      });
    } catch (e: any) {
      lastError = e;
    }
  }

  return sendJson(500, {
    error: `Gagal berkomunikasi dengan Google Gemini API: ${lastError?.message || 'Unknown network error'}`
  });
}
