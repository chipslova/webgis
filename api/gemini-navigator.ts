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
export const GIS_FUNCTION_DECLARATIONS = [
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
            'esri-ocean',
            'esri-light-grey',
            'openfreemap-liberty',
            'openfreemap-positron',
            'esri-clarity',
            'osm-humanitarian',
            'esri-colorpencil'
          ],
          description: 'Target basemap ID (16 choices): "esri-imagery" (Citra Satelit), "esri-streets" (Jalan Kota), "big-rbi" (Peta Topografi Nasional RBI BIG), "osm-standard" (OpenStreetMap), "esri-topographic" (Topografi & Kontur), "esri-dark-grey" (Kanvas Gelap), "open-topo" (OpenTopoMap), "esri-relief" (Relief Bayangan), "esri-natgeo" (National Geographic), "esri-ocean" (Batimetri Laut), "esri-light-grey" (Kanvas Terang), "openfreemap-liberty" (Vektor OpenFreeMap Liberty), "openfreemap-positron" (Vektor Positron), "esri-clarity" (Citra Bebas Awan Clarity), "osm-humanitarian" (OSM Kemanusiaan), "esri-colorpencil" (Vektor Artistik Pensil Warna).'
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
  },
  {
    name: 'toggleLayer',
    description: 'Toggle or activate a specific thematic data layer on the map canvas (e.g. curah hujan CHIRPS/GPM, tutupan lahan Sentinel-2 ESA WorldCover, suhu permukaan tanah MODIS LST, indeks vegetasi NDVI, indeks air NDWI, indeks perkotaan NDBI, bahaya banjir, stasiun cuaca).',
    parameters: {
      type: 'OBJECT',
      properties: {
        layerId: {
          type: 'STRING',
          enum: [
            'precipitation',
            'landcover',
            'lst-day',
            'lst-night',
            'stations',
            's2-geomad-rgb',
            's2-indices-ndvi',
            's2-indices-ndwi',
            's2-indices-nbr',
            'hazard-flood',
            'tile-grid'
          ],
          description: 'The layer ID to toggle: "precipitation" (Curah Hujan Harian CHIRPS & GPM), "landcover" (Tutupan Lahan Sentinel-2 10m ESA WorldCover), "lst-day" (Suhu Permukaan Daratan Siang MODIS), "lst-night" (Suhu Permukaan Daratan Malam MODIS), "stations" (18 Stasiun Observasi LST & Iklim), "s2-geomad-rgb" (Citra Satelit Sentinel-2 True Color), "s2-indices-ndvi" (Indeks Kerapatan Vegetasi), "s2-indices-ndwi" (Indeks Air Permukaan), "s2-indices-nbr" (Indeks Karhutla Kebakaran Hutan NBR), "hazard-flood" (Peta Bahaya Banjir Kawasan Prioritas), "tile-grid" (Batas Grid Open Data Cube).'
        },
        visible: {
          type: 'BOOLEAN',
          description: 'True to activate/show the layer (default), or false to hide/disable.'
        }
      },
      required: ['layerId']
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

    // 3. Layer 3: Input Clamping (Max 600 chars)
    const prompt = rawPrompt.slice(0, 600);

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
          error: `Batas kapasitas harian AI WebGIS (${GLOBAL_DAILY_CEILING} kueri/hari) telah tercapai untuk menjaga kestabilan sistem. Silakan coba kembali dalam ${dailyQuota.resetInHours} jam.`,
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

    const systemPrompt = `Anda adalah "AI Geospatial Copilot & Smart Assistant" resmi untuk platform WebGIS "Digital Earth Indonesia".

PERAN & TUGAS UTAMA (SANGAT PENTING):
Pengguna menggunakan antarmuka ini untuk BERTANYA hal-hal seputar geografi, sains, fakta tempat, tutorial WebGIS, dll.
JANGAN PERNAH HANYA MEMINDAHKAN KAMERA TANPA MEMBERIKAN JAWABAN TERTULIS!
1. Jika pengguna bertanya tentang tempat atau objek geografi (misal: "Apa itu Gunung Bromo?", "Ceritakan tentang Danau Toba", "Di mana IKN dan bagaimana pembangunannya?", "Kenapa terjadi gempa di Cianjur?"):
   - Berikan jawaban edukatif yang jelas, padat, informatif, dan mendalam (2-3 paragraf ringkas berbobot) di properti "reply"!
   - SEKALIGUS sertakan aksi "flyToLocation" di properti "actions" agar peta terbang ke lokasi tersebut!
2. Jika pengguna bertanya atau ingin melihat data tematik spesifik (misal: "Tampilkan curah hujan", "Bagaimana tutupan lahan di IKN?", "Suhu permukaan siang di Jakarta", "Lihat indeks vegetasi NDVI", "Peta bahaya banjir"):
   - Berikan jawaban informatif mengenai data/fenomena tersebut di "reply"!
   - SELALU sertakan aksi "toggleLayer" dengan "layerId" yang sesuai di properti "actions" agar lapisan data langsung aktif dan terlihat di peta!
   - Jika pengguna menyebutkan lokasi tertentu, sertakan JUGA aksi "flyToLocation" ke lokasi tersebut!
3. Jika pengguna bertanya konsep teori, sains, GIS, remote sensing, atau sapaan santai (misal: "Apa itu NDVI?", "Bagaimana cara kerja satelit?", "Siapa kamu?", "Halo"):
   - Jawablah secara lengkap, ramah, dan terstruktur di "reply", dengan "actions": [].
4. Jika pengguna meminta navigasi murni (misal: "Ganti ke citra satelit", "Aktifkan 3D Globe", "Buka alat ukur"):
   - Berikan teks konfirmasi ramah di "reply" (misal: "Peta dasar telah diubah ke Citra Satelit Esri.") dan sertakan aksi yang sesuai di "actions".

FORMAT OUTPUT:
Anda WAJIB SELALU merespons dalam format JSON valid berikut (tanpa teks di luar JSON):
{
  "reply": "Jawaban lengkap dan terstruktur dalam Bahasa Indonesia (gunakan pemformatan markdown seperti **tebal**, daftar poin, dll)",
  "actions": [
    {
      "name": "namaAksi",
      "args": { ... }
    }
  ]
}

DAFTAR AKSI (ACTIONS) YANG TERSEDIA:
1. "flyToLocation"
   args: { "locationName": string, "longitude": number, "latitude": number, "zoom": number (3-16), "pitch": number (0-60), "bearing": number (0-360) }
   Gunakan pitch 50-60 untuk gunung/bukit agar terlihat 3D.
   Koordinat penting:
   - Gunung Bromo: [112.953, -7.942], zoom 13.5, pitch 60
   - Gunung Merapi: [110.442, -7.540], zoom 13.5, pitch 60
   - IKN Nusantara: [116.700, -0.970], zoom 12.5, pitch 45
   - Monas Jakarta: [106.827, -6.175], zoom 14.5, pitch 50
   - Danau Toba: [98.880, 2.684], zoom 10.5, pitch 45
   - Labuan Bajo / Komodo: [119.880, -8.490], zoom 12.0, pitch 50
   - Raja Ampat: [130.500, -0.500], zoom 10.0, pitch 40
2. "toggleLayer"
   args: { "layerId": string, "visible"?: boolean }
   Pilihan layerId:
   - "precipitation" (Curah Hujan Harian Satelit CHIRPS & NASA GPM)
   - "landcover" (Tutupan Lahan Sentinel-2 10m ESA WorldCover 9 kelas)
   - "lst-day" (Suhu Permukaan Daratan Siang MODIS LST Day 1km)
   - "lst-night" (Suhu Permukaan Daratan Malam MODIS LST Night 1km)
   - "stations" (18 Titik Stasiun & Observasi LST)
   - "s2-geomad-rgb" (Citra Satelit Sentinel-2 True Color 10m)
   - "s2-indices-ndvi" (Indeks Kerapatan Vegetasi NDVI 10m)
   - "s2-indices-ndwi" (Indeks Badan Air Permukaan NDWI 10m)
   - "s2-indices-nbr" (Indeks Kebakaran Hutan & Bekas Terbakar NBR 10m)
   - "hazard-flood" (Pemodelan Bahaya Banjir Kawasan Prioritas)
   - "tile-grid" (Batas Grid Open Data Cube 1.631 Tile)
3. "switchBasemap"
   args: { "basemapId": string }
   Pilihan (16 basemap): 'esri-imagery', 'esri-streets', 'big-rbi', 'osm-standard', 'esri-topographic', 'esri-dark-grey', 'open-topo', 'esri-relief', 'esri-natgeo', 'esri-ocean', 'esri-light-grey', 'openfreemap-liberty', 'openfreemap-positron', 'esri-clarity', 'osm-humanitarian', 'esri-colorpencil'
4. "toggleProjection"
   args: { "projection": "globe" | "mercator" }
5. "filterStations"
   args: { "query": string }
6. "activateTool"
   args: { "toolName": "measure" | "spatial-analysis" | "point-inspector" | "swipe-compare" | "attribute-table" | "basemap-gallery" | "reset-view" | "start-tour" }

KATALOG FITUR WEBGIS:
- 16 Peta Dasar aktif (Satelit Esri, Jalan, BIG RBI, Topografi, Vektor OpenFreeMap, Relief, Batimetri laut, dll).
- 3D Terrain elevation (AWS Terrarium) dan ekstrusi volume gedung 3D planet (OpenFreeMap).
- Citra Satelit Sentinel-2 BIG Piksel (2018-2025): RGB, NDVI (vegetasi), NDWI (air), NDBI (bangunan).
- Google Earth Engine: LST thermal harian MODIS & Tutupan Lahan ESA WorldCover 10m.
- 440+ Stasiun Cuaca BMKG CFSv2 di seluruh Indonesia.
- Alat Ukur (Measure): Jarak lintasan, luas poligon, dan profil elevasi ketinggian permukaan tanah (mdpl).
- Tirai Pembanding (Swipe): Split-screen membandingkan 2 basemap atau layer citra secara langsung.
- Point Inspector: Klik sembarang titik di peta untuk melihat koordinat, elevasi mdpl, suhu permukaan LST, dan tutupan lahan.
- Impor/Ekspor: KML, GeoJSON, Shapefile, CSV, dan Ekspor Cetak Peta PNG/PDF.

${contextDescription}`;

    // 7. Build Conversation Contents (with multi-turn history)
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(body?.history)) {
      let lastRole = '';
      for (const item of body.history.slice(-4)) {
        const role = (item.role === 'model' || item.role === 'assistant' || item.role === 'ai') ? 'model' : 'user';
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        if (text && role !== lastRole) {
          contents.push({
            role,
            parts: [{ text: text.slice(0, 400) }]
          });
          lastRole = role;
        }
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents.pop();
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const payload = {
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 650
      }
    };

    // 8. Request to Google Gemini with automatic model fallback & global time budget
    const models = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];
    const startTime = Date.now();
    const TOTAL_BUDGET_MS = 17000; // Keep safely below Vercel's 25s execution ceiling
    let lastError: Error | null = null;

    for (const model of models) {
      const elapsed = Date.now() - startTime;
      const remainingBudget = TOTAL_BUDGET_MS - elapsed;
      if (remainingBudget < 2500) {
        // Not enough time left for another attempt without risking Vercel 504 timeout kill
        break;
      }

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutMs = Math.min(6500, remainingBudget);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 404 || response.status === 503 || response.status === 504) {
            lastError = new Error(`Model ${model} (${response.status}): ${errText}`);
            continue;
          }
          if (response.status === 429) {
            return send(429, {
              error: 'Kapasitas server AI sedang penuh (429). Mohon tunggu beberapa saat dan coba kembali.',
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
        let actions: Array<{ name: string; args: Record<string, any> }> = [];

        for (const part of parts) {
          // 1. Direct functionCall part if model uses function calling
          if (part.functionCall) {
            actions.push({
              name: part.functionCall.name,
              args: part.functionCall.args || {}
            });
          }

          // 2. Text part (which is structured JSON in JSON mode)
          if (part.text) {
            const raw = part.text.trim();
            try {
              const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              const parsed = JSON.parse(cleaned);
              if (parsed && typeof parsed === 'object') {
                if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
                  replyText = parsed.reply.trim();
                }
                if (Array.isArray(parsed.actions)) {
                  actions = actions.concat(parsed.actions);
                } else if (parsed.action && typeof parsed.action === 'object' && parsed.action.name) {
                  actions.push(parsed.action);
                }
              } else {
                replyText = (replyText ? replyText + '\n\n' : '') + raw;
              }
            } catch {
              replyText = (replyText ? replyText + '\n\n' : '') + raw;
            }
          }
        }

        if (!replyText.trim() && actions.length > 0) {
          const first = actions[0];
          if (first.name === 'flyToLocation') {
            replyText = `Mengarahkan kamera peta ke **${first.args.locationName || 'lokasi tujuan'}**...`;
          } else if (first.name === 'toggleLayer') {
            replyText = `Mengaktifkan lapisan data **${first.args.layerId}** pada peta...`;
          } else if (first.name === 'switchBasemap') {
            replyText = `Mengubah peta dasar ke gaya **${first.args.basemapId}**...`;
          } else if (first.name === 'toggleProjection') {
            replyText = `Mengalihkan proyeksi peta ke **${first.args.projection === 'globe' ? 'Bola Bumi 3D' : 'Mercator 2D'}**...`;
          } else if (first.name === 'activateTool') {
            replyText = `Membuka alat spasial **${first.args.toolName}**...`;
          } else if (first.name === 'filterStations') {
            replyText = `Memfilter stasiun cuaca dengan kata kunci **"${first.args.query || ''}"**...`;
          } else {
            replyText = 'Menjalankan perintah navigasi peta...';
          }
        } else if (!replyText.trim()) {
          replyText = 'Saya siap membantu Anda. Silakan tanyakan hal apa pun seputar peta, geospasial, atau fitur WebGIS ini.';
        }

        return send(200, {
          success: true,
          reply: replyText.trim(),
          actions,
          modelUsed: model
        }, limitHeaders);
      } catch (e: any) {
        lastError = e;
        if (e?.name === 'AbortError') {
          lastError = new Error('Waktu tunggu respons habis (timeout)');
        }
      }
    }

    return send(504, {
      error: `Server AI sedang mengalami antrean padat (${lastError?.message || 'Koneksi timeout'}). Silakan coba tanyakan kembali.`
    }, limitHeaders);
  } catch (err: any) {
    return send(500, {
      error: `Terjadi kendala pada server AI: ${err?.message || 'Internal Server Error'}`
    });
  }
}
