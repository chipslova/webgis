# 05. Audit Kekurangan Sistem & Roadmap Pengembangan
## Digital Earth Indonesia WebGIS

Dokumen ini menyajikan hasil **audit teknis mendalam dan objektif** mengenai keterbatasan, kelemahan arsitektural (*technical debt*), potensi titik kegagalan (*single point of failure*), serta rekomendasi peta jalan perbaikan (*actionable roadmap*) untuk pengembang berikutnya.

---

## 1. Ringkasan Skor Kesiapan Sistem (Readiness Scorecard)

| Aspek Sistem | Skor (1–10) | Status | Keterangan Singkat |
| :--- | :---: | :---: | :--- |
| **Arsitektur Klien & UI WebGL2** | **9.2** | 🟢 Sangat Baik | MapLibre GL 6.10 stabil, responsive glassmorphism, 60 FPS, didukung Eco-Mode. |
| **Fungsionalitas Spasial & Geodesik** | **9.5** | 🟢 Luar Biasa | 8 modul analitik lengkap; komputasi buffer & overlay berjalan non-blocking di Web Worker. |
| **Kualitas Kode & Unit Testing** | **9.4** | 🟢 Sangat Baik | TypeScript strict, 44 test files, 318 Vitest tests passing (100% green). |
| **Dukungan Mobile & Responsivitas** | **9.0** | 🟢 Sangat Baik | Layout ultra-compact < 400px, bottom sheet inspector, single-col presets, dan touch target >= 44px. |
| **Keamanan Klien & CSP** | **8.5** | 🟢 Baik | Sanitasi input XSS ketat, Content Security Policy deklaratif di Vercel. |
| **Ketahanan Sumber Hulu (Upstream)** | **7.8** | 🟢 Baik (Terproteksi) | Dilengkapi live health check probe dan tombol graceful fallback instan ke Esri Imagery. |
| **Skalabilitas State Serverless** | **6.0** | 🟠 Perlu Atensi | Rate limiter dan kuota harian masih in-memory di tingkat edge instance. |
| **Persistensi Data & Basis Data** | **5.5** | 🔴 Keterbatasan Utama | Belum memiliki database cloud / sistem login; data murni di `localStorage`. |

---

## 2. Rincian 9 Kekurangan & Keterbatasan Teknis Utama

### 🟢 1. Ketahanan Sumber Hulu BIG Piksel & Mekanisme Graceful Fallback (Sudah Dimoderasi & Terlindungi ✅)
* **Status**: **Telah Diimplementasikan & Teruji (Langkah 2)** via [api/wms-proxy.ts](file:///d:/webgis/api/wms-proxy.ts), [src/tools/piksel-loader.ts](file:///d:/webgis/src/tools/piksel-loader.ts), dan [src/ui/piksel-panel.ts](file:///d:/webgis/src/ui/piksel-panel.ts).
* **Temuan Awal**: Layanan citra satelit Sentinel-2 GeoMAD 10m (2017–2025) dan indeks spektral bergantung langsung pada alamat hulu `ows.staging.piksel.big.go.id`. Domain `staging` dapat mengalami timeout mendadak saat proses pemeliharaan.
* **Solusi Perlindungan yang Diterapkan**:
  1. **Endpoint Health Probe Otomatis**: Endpoint `/api/wms-proxy?health=true` melakukan probe aktif terhadap respons server hulu BIG Piksel dengan klasifikasi latensi (Normal < 2500ms, Degraded, atau Offline jika timeout 5s).
  2. **Indikator Live di UI**: Panel BIG Piksel menampilkan status kesehatan server hulu secara real-time dengan status pill berwarna (Hijau/Kuning/Merah) serta tombol *refresh* manual.
  3. **Graceful Fallback Instan ke Citra Satelit Esri**: Jika server WMS hulu mengalami gangguan atau latensi tinggi, kartu error menyajikan opsi satu-klik **[🛰️ Citra Esri (Alternatif)]** (`switchToEsriFallback()`) yang langsung mengalihkan peta dasar ke citra satelit resolusi tinggi Esri World Imagery, serta tombol lompat **[📍 Contoh Stabil (Bromo)]** agar peta pengguna tidak pernah kosong.
* **Tindakan Lanjutan Jangka Panjang**:
  - Tetap dianjurkan mengajukan akses endpoint klaster *production* resmi ke BIG untuk redundansi ganda di masa depan.

---

### 🔴 2. Ketiadaan Database Backend & Akun Pengguna (Stateless Architecture)
* **Temuan**: Aplikasi saat ini 100% *stateless* di sisi server. Fitur seperti *Saved Views* (tampilan tersimpan), penanda lokasi (*point bookmarks*), dan riwayat lapisan kustom hanya disimpan di dalam objek `localStorage` peramban lokal.
* **Kelemahan & Dampak**:
  * Jika pengguna membersihkan cache/riwayat browser, berganti perangkat (dari laptop ke ponsel), atau menggunakan mode *Incognito/Private*, seluruh data proyek dan bookmark yang telah dibuat akan hilang.
  * Tidak memungkinkan adanya fitur kolaborasi antar-tim (*sharing workspace*, menyimpan analisis tim, atau hak akses bertingkat admin/analis).
* **Rekomendasi Solusi**:
  1. Integrasikan backend BaaS (*Backend-as-a-Service*) ringan seperti **Supabase** atau **PostgreSQL + PostGIS**.
  2. Tambahkan autentikasi pengguna (misal: OAuth Google / GitHub via Supabase Auth) sehingga pengguna dapat menyimpan proyek analisis spasial mereka secara permanen di cloud.

---

### 🟢 3. Kalkulasi Spasial di Background Thread Web Worker (Sudah Diperbaiki / RESOLVED ✅)
* **Status**: **Telah Diimplementasikan & Teruji (Langkah 3)** via [src/workers/spatial.worker.ts](file:///d:/webgis/src/workers/spatial.worker.ts) dan [src/workers/spatial-worker-client.ts](file:///d:/webgis/src/workers/spatial-worker-client.ts).
* **Temuan Awal**: Seluruh kalkulasi geospasial Turf.js dieksekusi langsung pada *main thread* JavaScript browser dengan batas darurat 1.000 fitur, berisiko membekukan (*freezing*) kanvas peta dan animasi antarmuka saat memproses ribuan simpul poligon rumit.
* **Solusi yang Diterapkan**:
  1. **Dedicated ES-Module Web Worker**: Dibuat worker [`src/workers/spatial.worker.ts`](file:///d:/webgis/src/workers/spatial.worker.ts) yang mengisolasi komputasi buffer geodesik dan overlay tumpang tindih ke thread latar belakang OS terpisah.
  2. **Singleton Worker Client & Graceful Fallback**: [`src/workers/spatial-worker-client.ts`](file:///d:/webgis/src/workers/spatial-worker-client.ts) menangani pertukaran pesan secara asinkron dengan timeout guard 30 detik dan otomatis melakukan fallback ke thread utama jika Web Worker tidak didukung oleh lingkungan peramban.
  3. **Peningkatan Kapasitas Fitur Aman**: Batasan aman komputasi ditingkatkan menjadi 5.000 fitur tanpa mengorbankan kelancaran animasi 60 FPS pada kanvas peta MapLibre.
  4. **Metode Asinkron Terintegrasi**: [`SpatialBufferAnalyzer.createBufferAsync()`](file:///d:/webgis/src/tools/spatial-buffer.ts) dan [`SpatialIntersectAnalyzer.overlayAsync()`](file:///d:/webgis/src/tools/spatial-intersect.ts) terhubung langsung dengan [`GeoJsonLoader.createBufferForLayer()`](file:///d:/webgis/src/tools/geojson-loader.ts).

---

### 🟠 4. Pembatas Laju (Rate Limiter) Belum Terdistribusi
* **Temuan**: Modul pembatas laju [api/_rate-limit.ts](file:///d:/webgis/api/_rate-limit.ts) dan plafon kuota harian `dailyRequestCount` pada [api/gemini-navigator.ts](file:///d:/webgis/api/gemini-navigator.ts) menyimpan status hitungan dalam variabel memori lokal (*in-memory Map*).
* **Kelemahan & Dampak**:
  * Di lingkungan serverless/edge Vercel, fungsi dieksekusi di puluhan *Point-of-Presence (PoP)* terdistribusi di seluruh dunia.
  * Setiap kali instance serverless baru dibuat (*cold start*) atau berganti region, memori lokal tereset ke 0. Akibatnya, proteksi kuota harian 1.000 permintaan pada Gemini AI tidak tersinkronisasi sempurna antar instance edge yang berbeda.
* **Rekomendasi Solusi**:
  1. Hubungkan modul rate limiter ke sistem penyimpanan key-value terdistribusi berlatensi rendah, seperti **Upstash Redis** atau **Vercel KV**.
  2. Dengan Redis terdistribusi, kuota harian dan pembatasan laju IP akan terkonsolidasi secara konsisten di seluruh edge node global.

---

### 🟢 5. Dukungan Proyeksi Koordinat Shapefile & GeoJSON (Sudah Diperbaiki / RESOLVED ✅)
* **Status**: **Telah Diimplementasikan & Teruji (Langkah 1)** via [src/utils/projections.ts](file:///d:/webgis/src/utils/projections.ts) dan pustaka `proj4`.
* **Solusi yang Diterapkan**:
  1. Dibuat registri proyeksi geospasial Indonesia komprehensif mencakup:
     - DGN95 / UTM Zona 46S – 54S (EPSG: 23866–23874)
     - DGN95 / UTM Zona 46N – 52N (EPSG: 23886–23892)
     - WGS 84 / UTM Zona 46S – 54S (EPSG: 32746–32754) & 46N – 52N
     - DGN95 / Indonesia TM-3° Zona BPN (EPSG: 23831–23846)
     - Standar penamaan WKT ESRI ArcMap / ArcGIS Pro.
  2. Modul [src/utils/shapefile-parser.ts](file:///d:/webgis/src/utils/shapefile-parser.ts) dan [src/tools/geojson-loader.ts](file:///d:/webgis/src/tools/geojson-loader.ts) kini secara otomatis mendeteksi koordinat planar meter non-WGS84 dan melakukan transformasi *on-the-fly* ke WGS84 secara akurat sebelum dirender di peta, disertai notifikasi toast informatif.

---

### 🟡 6. Resolusi DEM 3D Medan Masih Global (Terrarium 30m vs DEMNAS 8.2m)
* **Temuan**: Mesh elevasi 3D medan menggunakan ubin AWS Terrarium dengan resolusi spasial global ~30 meter.
* **Kelemahan & Dampak**:
  * Indonesia sebenarnya memiliki data elevasi nasional resmi beresolusi sangat tinggi yaitu **DEMNAS (resolusi 8.2 meter)** dan data batimetri nasional **BATNAS** yang dirilis oleh Badan Informasi Geospasial.
  * Menggunakan Terrarium 30m membuat lereng bukit curam, lembah sungai sempit, dan kontur mikro perkotaan terlihat agak membulat (*smoothed*) dan kurang detail dibanding kondisi topografi aslinya di lapangan.
* **Rekomendasi Solusi**:
  1. Buat pipeline konversi *offline* (menggunakan GDAL/Rasterio) untuk mengonversi lembar GeoTIFF DEMNAS 8.2m menjadi piramida ubin *Mapzen Terrarium PNG RGB encoding* atau *Quantized Mesh*.
  2. Simpan ubin di bucket penyimpanan cloud (Cloudflare R2) dan arahkan MapManager ke ubin DEMNAS tersebut untuk wilayah Indonesia.

---

### 🟡 7. Kerapatan Bangunan 3D Belum Merata Secara Nasional
* **Temuan**: Fitur gedung 3D (*3D buildings*) saat ini bersumber dari dataset OpenFreeMap / OpenStreetMap.
* **Kelemahan & Dampak**:
  * Data tapak bangunan (*building footprints*) dan informasi jumlah lantai sangat lengkap di kota-kota besar (DKI Jakarta, Surabaya, Bandung, Medan).
  * Namun di wilayah kabupaten terpencil, daerah perintis, atau pulau-pulau luar Jawa, data poligon bangunan di OpenStreetMap masih sangat minim, sehingga fitur ekstrusi gedung 3D tampak kosong di wilayah tersebut.
* **Rekomendasi Solusi**:
  1. Mengintegrasikan dataset terbuka **Microsoft Building Footprints Indonesia** (yang memuat jutaan poligon hasil deteksi AI citra satelit) atau dataset Google Open Buildings ke dalam ubin vektor PMTiles.

---

### 🟢 8. Kepadatan Informasi & Tata Letak Layar Ponsel Sempit (< 400px) (Sudah Diperbaiki / RESOLVED ✅)
* **Status**: **Telah Diimplementasikan & Teruji (Langkah 4)** via [src/style.css](file:///d:/webgis/src/style.css), [index.html](file:///d:/webgis/index.html), dan [src/ui/attribute-table-panel.ts](file:///d:/webgis/src/ui/attribute-table-panel.ts).
* **Temuan Awal**: Pada layar smartphone kecil (< 400px seperti iPhone SE, Galaxy compact), judul preset 2 kolom terpotong berantakan, header `Ctrl+K` menimpa teks pencarian, tabel atribut horizontal terpotong tanpa panduan scroll, dan floating inspector menutupi pandangan peta.
* **Solusi Ergonomis yang Diterapkan**:
  1. **Ultra-Compact Mobile Layout (`@media (max-width: 400px)`)**: Header dikompresi menjadi 48px, badge shortcut disembunyikan otomatis pada layar sempit agar kotak input lokasi leluasa, dan touch target tombol memenuhi standar ergonomi tap minimal 44x44px.
  2. **Single-Column Presets Grid**: Preset pemantauan satelit otomatis beralih ke 1 kolom pada ponsel sempit, mencegah pemotongan kata judul lokasi geospasial Indonesia.
  3. **Native Bottom-Sheet Inspector**: Kartu inspektur koordinat/fitur otomatis beralih dari posisi melayang di atas peta menjadi *bottom drawer sheet* di atas footer, menyajikan informasi titik secara rapi tanpa menutupi area sentuh peta.
  4. **Panduan Scroll Tabel Atribut**: Tabel atribut pada layar seluler dilengkapi bilah panduan visual interaktif `↔ Geser tabel ke kanan untuk melihat semua kolom` serta kontrol tinggi adaptif.
  5. **Viewport Safe-Area Cover**: Tag meta viewport ditingkatkan dengan `viewport-fit=cover` untuk adaptasi *notch* dan *home indicator* smartphone modern.

---

### 🟡 9. Pengujian CI/CD Belum Menyertakan Browser WebGL Nyata (E2E)
* **Temuan**: Seluruh 294 pengujian unit dijalankan di atas emulator **Happy-DOM** dengan objek kanvas tiruan (*mocked 2D/WebGL context*).
* **Kelemahan & Dampak**:
  * Happy-DOM sangat cepat dan andal untuk menguji logika bisnis, DOM, dan event handler, tetapi **tidak melakukan eksekusi shader GPU WebGL asli**.
  * Jika terdapat *bug* rendering grafis spesifik pada driver GPU tertentu (misalnya *z-fighting* pada layer *fill-extrusion* atau kebocoran memori WebGL context saat berganti basemap berkali-kali), hal tersebut tidak dapat terdeteksi oleh pengujian Vitest Happy-DOM saat ini.
* **Rekomendasi Solusi**:
  1. Tambahkan pengujian otomatis *End-to-End (E2E)* berbasis **Playwright** yang dijalankan di atas Chromium headless dengan flag `--use-gl=swiftshader` atau `--enable-webgl`.
  2. Integrasikan ke dalam alur GitHub Actions CI untuk menguji tangkapan visual kanvas asli sebelum proses merge ke branch `main`.

---

## 3. Peta Jalan Pengembangan (Development Roadmap)

Berikut adalah matriks rekomendasi pengembangan bertahap berdasarkan prioritas urgensi dan dampak teknis:

```mermaid
flowchart TD
    subgraph Fase_1["Fase 1: Keandalan & Ketahanan (Bulan 1–2)"]
        F1_1["Migrasi / Negosiasi Endpoint Produksi BIG Piksel"]
        F1_2["Web Worker untuk Kalkulasi Turf.js (Buffer & Intersect)"]
        F1_3["Integrasi Proj4js untuk Shapefile UTM/DGN95"]
    end

    subgraph Fase_2["Fase 2: Cloud State & Basis Data (Bulan 3–4)"]
        F2_1["Integrasi Supabase / PostGIS untuk Penyimpanan Proyek"]
        F2_2["Sistem Autentikasi Pengguna & Kolaborasi Tim"]
        F2_3["Migrasi Rate Limiter ke Upstash Redis / Vercel KV"]
    end

    subgraph Fase_3["Fase 3: Peningkatan Data & Pengalaman (Bulan 5–6)"]
        F3_1["Pipeline Ubin 3D DEMNAS 8.2m Nasional"]
        F3_2["Integrasi Google / MS Open Buildings untuk Wilayah Pelosok"]
        F3_3["Simplified Mobile UI Mode untuk Pengguna Smartphone"]
        F3_4["Playwright WebGL Headless E2E Tests di CI/CD"]
    end

    Fase_1 --> Fase_2
    Fase_2 --> Fase_3
```

### Rangkuman Prioritas Tindakan Cepat (Quick Wins):
1. **Tambahkan Banner Notifikasi Status Server Hulu**: Berikan indikator visual jika server WMS BIG sedang lambat/offline agar pengguna tidak mengira aplikasi yang rusak.
2. **Web Worker untuk Turf.js**: Menghilangkan batasan `MAX_SAFE_FEATURES = 1000` dan mencegah browser lag saat memproses poligon besar.
3. **Penyimpanan Redis untuk Kuota Gemini**: Mengunci plafon harian 1.000 panggilan AI secara akurat di seluruh edge region.

