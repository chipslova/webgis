# 04. Katalog API & Integrasi Data
## Digital Earth Indonesia WebGIS

Dokumen ini menyediakan spesifikasi teknis lengkap dari antarmuka pemrograman aplikasi (*API Endpoints*) serverless dan edge di dalam direktori `/api`, serta dokumentasi integrasi dengan penyedia data geospasial hulu (*upstream data providers*).

---

## 1. Arsitektur Komputasi Serverless & Edge

Aplikasi menggunakan arsitektur nirserver (*serverless*) Vercel yang dibagi menjadi dua jenis lingkungan eksekusi:

1. **Vercel Edge Runtime (`runtime: 'edge'`)**:
   * Digunakan untuk endpoint yang membutuhkan latensi minimal, *streaming*, atau *proxying* ubin data (contoh: `/api/wms-proxy` dan `/api/gemini-navigator`).
   * Dijalankan pada server edge terdistribusi terdekat dengan pengguna dengan waktu inisiasi mendekati 0 ms (*zero cold-start*).
2. **Vercel Node.js Serverless Function**:
   * Digunakan untuk kalkulasi geospasial mendalam yang membutuhkan pustaka komputasi berat `@google/earthengine` (contoh: `/api/gee-zonal-stats` dengan `maxDuration: 60` detik).

---

## 2. Katalog Endpoint API (`/api/*`)

### A. `/api/wms-proxy` (Edge WMS Proxy & Caching)
* **Runtime**: Vercel Edge Runtime
* **Metode HTTP**: `GET`, `HEAD`, `OPTIONS`
* **Tujuan**: Menjembatani permintaan ubin peta dari klien ke server OGC WMS BIG Piksel guna mengatasi masalah CORS dan menyuntikkan header caching performa tinggi.
* **Server Hulu (Upstream)**: `https://ows.staging.piksel.big.go.id/wms`
* **Batas Laju (Rate Limit)**: **360 permintaan / menit per IP** (didesain untuk mengakomodasi aliran ubin raster multi-tile pada layar retina/4K).
* **Parameter Kueri**: Meneruskan seluruh parameter baku OGC WMS 1.3.0 (`SERVICE`, `VERSION`, `REQUEST`, `LAYERS`, `STYLES`, `CRS`, `BBOX`, `WIDTH`, `HEIGHT`, `FORMAT`, `TRANSPARENT`, `TIME`).
* **Header Respons Khusus**:
  * `Cache-Control`: `public, max-age=86400, stale-while-revalidate=604800` (disimpan dalam CDN edge selama 24 jam).
  * `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

### B. `/api/gemini-navigator` (Edge AI Copilot & Tool Calling)
* **Runtime**: Vercel Edge Runtime
* **Metode HTTP**: `POST`, `OPTIONS`
* **Tujuan**: Memproses prompt percakapan bahasa alami pengguna menjadi perintah navigasi spasial terstruktur menggunakan **Google Gemini 1.5** dan *Function Calling*.
* **Batas Laju (Rate Limit)**: 
  * Layer 1: **20 permintaan / menit per IP**.
  * Layer 2: **Plafon Harian Global (1.000 permintaan / hari)** untuk menjamin biaya akun nol (*Zero-Bill Guarantee*).
* **Format Payload Permintaan (Request Body)**:
  ```json
  {
    "message": "Arahkan peta ke Gunung Bromo dan aktifkan citra satelit tahun 2019",
    "mapContext": {
      "center": [106.8271, -6.1754],
      "zoom": 11,
      "activeLayers": ["s2-geomad-rgb"],
      "basemap": "esri-imagery"
    }
  }
  ```
* **Katalog Fungsi yang Didukung (Function Declarations)**:
  1. `flyToLocation(locationName, zoomLevel, pitch, bearing)`: Menggerakkan kamera peta ke nama wilayah atau koordinat.
  2. `switchBasemap(basemapId)`: Mengganti peta dasar aktif.
  3. `togglePikselLayer(product, year)`: Mengaktifkan produk satelit Sentinel-2 atau Landsat pada tahun tertentu.
  4. `activateMeasureTool(mode)`: Mengaktifkan mode ukur `'distance'` atau `'area'`.
  5. `openSidebarTab(tabId)`: Membuka laci navigasi samping ke panel tertentu.

---

### C. `/api/gee-zonal-stats` (Planetary Cloud Reduction)
* **Runtime**: Vercel Node.js Serverless (`maxDuration: 60s`)
* **Metode HTTP**: `POST`, `OPTIONS`
* **Tujuan**: Menjalankan kalkulasi reduksi spasial autentik di atas klaster Google Earth Engine pada poligon bebas yang digambar pengguna.
* **Batas Laju (Rate Limit)**: **30 permintaan / menit per IP**.
* **Format Payload Permintaan (Request Body)**:
  ```json
  {
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[106.8, -6.2], [106.9, -6.2], [106.9, -6.3], [106.8, -6.3], [106.8, -6.2]]]
    },
    "regionName": "Kawasan Studi Citarum",
    "startDate": "2025-08-01",
    "endDate": "2025-08-31"
  }
  ```
* **Format Payload Respons (Response Body)**:
  ```json
  {
    "status": "success",
    "isRealGEE": true,
    "source": "Google Earth Engine Cloud Cluster (Live Planetary Reduction)",
    "regionName": "Kawasan Studi Citarum",
    "totalAreaKm2": 112.45,
    "totalAreaHa": 11245.0,
    "thermalStats": {
      "minTempC": 24.2,
      "meanTempC": 29.8,
      "maxTempC": 35.6,
      "hotspotAreaKm2": 18.2,
      "hotspotPercentage": 16.18
    },
    "landCoverBreakdown": [
      {
        "code": 50,
        "name": "Built-up Area",
        "nameId": "Lahan Terbangun / Kota",
        "color": "#ED022A",
        "areaKm2": 65.2,
        "percentage": 57.98
      },
      {
        "code": 10,
        "name": "Trees (Forest)",
        "nameId": "Tutupan Pohon / Hutan",
        "color": "#358221",
        "areaKm2": 24.1,
        "percentage": 21.43
      }
    ],
    "dominantClass": "Lahan Terbangun / Kota",
    "timestamp": "2026-11-09T02:00:00.000Z"
  }
  ```

---

### D. Endpoint Satelit Tambahan
* **`/api/gee-lst-tiles`**: Menghasilkan URL ubin raster interaktif gradien suhu permukaan tanah (LST MODIS).
* **`/api/gee-precipitation-tiles`**: Menghasilkan ubin raster presipitasi satelit harian CHIRPS.
* **`/api/gee-timeseries`**: Mengembalikan deret waktu historis suhu permukaan LST tahunan untuk grafik musiman.
* **`/api/gee-export-tiff`**: Mempersiapkan tautan unduh citra GeoTIFF beresolusi penuh dari aset Earth Engine.

---

## 3. Integrasi Sumber Data Hulu (Data Provenance)

| Nama Sumber | Protokol / Format | URL / Aset Hulu | Keterangan & Aksesibilitas |
| :--- | :--- | :--- | :--- |
| **BIG Piksel ODC** | OGC WMS 1.3.0 | `https://ows.staging.piksel.big.go.id/wms` | Server staging Open Data Cube Badan Informasi Geospasial. Menyediakan komposit Sentinel-2 10m & Landsat. Di-proxy via `/api/wms-proxy`. |
| **NASA GIBS** | OGC WMS 1.3.0 | `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi` | Ubin global harian bebas biaya untuk lapisan MODIS Land Surface Temp. |
| **AWS Terrarium DEM** | Raster DEM PNG | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Ubin elevasi global 30m dari Mapzen / AWS Open Data untuk mesh 3D permukaan bumi. |
| **OpenFreeMap** | Vector TileJSON | `https://tiles.openfreemap.org/styles/liberty` | Peta dasar vektor terbuka tanpa kunci API (*zero-token*) dan sumber poligon gedung 3D. |
| **Esri ArcGIS Online** | Tile Layer REST | `https://server.arcgisonline.com/ArcGIS/rest/services/*` | 8 peta dasar raster Esri (World Imagery, Streets, Topo, NatGeo, Shaded Relief, Ocean). |
| **Open-Meteo API** | REST JSON | `https://api.open-meteo.com/v1/forecast` | Data cuaca, suhu udara, dan kecepatan angin real-time per koordinat tanpa perlu token API. |
| **Google Cloud GEE** | gRPC / REST API | `ee.ImageCollection` via Service Account | Klaster cloud planet Google Earth Engine untuk komputasi tutupan lahan dan termal. |

---

## 4. Mekanisme Keamanan & Pertahanan Sistem

1. **Pembatas Laju In-Memory (Sliding Window Rate Limiting)**:
   * Seluruh API di `/api/*` dilindungi oleh modul [_rate-limit.ts](file:///d:/webgis/api/_rate-limit.ts) yang melacak jumlah panggilan per alamat IP klien menggunakan algoritma *sliding window*.
   * Jika batas terlampaui, server mengembalikan status HTTP `429 Too Many Requests` disertai header `Retry-After`.
2. **Kebijakan Keamanan Konten (Content Security Policy - CSP)**:
   * Didefinisikan secara deklaratif pada [vercel.json](file:///d:/webgis/vercel.json#L57):
     ```
     default-src 'self'; 
     script-src 'self' 'wasm-unsafe-eval' blob:; 
     style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; 
     font-src 'self' https://fonts.gstatic.com data:; 
     img-src 'self' data: blob: https:; 
     worker-src 'self' blob:; 
     connect-src 'self' https: data: blob:;
     ```
   * Memblokir injeksi skrip berbahaya pihak ketiga dari domain yang tidak dikenal.
3. **Sanitasi Data Masukan Klien (Anti-XSS)**:
   * Seluruh teks yang berasal dari berkas pengguna (nama layer Shapefile, properti GeoJSON, koordinat CSV) disaring melalui fungsi `escapeHtml()` di [src/utils/sanitize.ts](file:///d:/webgis/src/utils/sanitize.ts) sebelum dimasukkan ke dalam DOM atau tooltip.
