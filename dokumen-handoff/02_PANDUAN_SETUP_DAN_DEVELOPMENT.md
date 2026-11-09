# 02. Panduan Setup & Alur Kerja Pengembangan
## Digital Earth Indonesia WebGIS

Panduan ini ditujukan bagi pengembang yang akan melakukan instalasi, menjalankan server pengembangan lokal, mengeksekusi pengujian otomatis, serta melakukan rilis (*deployment*) ke infrastruktur produksi.

---

## 1. Prasyarat Sistem & Perangkat Lunak

Sebelum memulai, pastikan perangkat Anda telah terpasang:
* **Runtime & Package Manager**: 
  * Direkomendasikan: [Bun](https://bun.sh/) (v1.2.0 atau lebih baru)
  * Alternatif: [Node.js](https://nodejs.org/) (v18.0.0 atau v20 LTS) dan `npm`
* **Sistem Kontrol Versi**: [Git](https://git-scm.com/) (v2.30+)
* **Peramban Web (Browser)**: Google Chrome, Microsoft Edge, Firefox, atau Safari versi modern yang mendukung akselerasi perangkat keras **WebGL2**.
* **Editor Kode**: Visual Studio Code (direkomendasikan dengan ekstensi *TypeScript and JavaScript Language Features* dan *Vitest*).

---

## 2. Manajemen Variabel Lingkungan (Environment Variables)

Aplikasi memiliki dua variabel lingkungan utama yang diperlukan untuk fitur berbasis cloud:

| Variabel Lingkungan | Level | Wajib? | Deskripsi & Fungsi |
| :--- | :---: | :---: | :--- |
| `GEMINI_API_KEY` | Edge API | Ya (Untuk Copilot) | Kunci API Google Gemini dari [Google AI Studio](https://aistudio.google.com/). Digunakan oleh `/api/gemini-navigator` untuk menjalankan asisten peta cerdas dan *function calling*. |
| `GEE_SERVICE_ACCOUNT_KEY` | Serverless API | Opsional | Kunci privat akun layanan (*Google Cloud Service Account*) dalam format teks JSON tunggal. Digunakan oleh `/api/gee-zonal-stats` untuk kalkulasi piksel riil di klaster Earth Engine. Jika kosong, sistem otomatis beralih ke mode simulasi aman. |

### Konfigurasi Lokal (`.env.local`)
Buat berkas bernama `.env.local` di direktori akar proyek:

```env
# 1. Kunci API Gemini (Dapatkan dari Google AI Studio)
GEMINI_API_KEY=AIzaSy...

# 2. Akun Layanan Google Earth Engine (Format string JSON utuh)
GEE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"nama-proyek","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"sa@nama-proyek.iam.gserviceaccount.com"}'
```

> [!IMPORTANT]
> Jangan pernah melakukan *commit* berkas `.env.local` ke repositori publik Git. Berkas ini sudah terdaftar dalam `.gitignore`.

---

## 3. Instalasi Dependensi & Menjalankan Server Lokal

```bash
# 1. Kloning repositori proyek
git clone https://github.com/chipslova/webgis.git
cd webgis

# 2. Pasang dependensi menggunakan Bun (Sangat Cepat):
bun install

# ATAU menggunakan npm (sudah dilengkapi .npmrc legacy-peer-deps=true):
npm install

# 3. Jalankan server pengembangan lokal (HMR)
bun run dev      # atau: npm run dev
```

Server lokal akan aktif di port default:
```
  VITE v6.4.3  ready in 240 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```
Buka peramban dan navigasikan ke `http://localhost:3000` untuk mengakses aplikasi.

---

## 4. Perintah Pengembangan (NPM Scripts)

Seluruh skrip otomasi proyek dikelola melalui `package.json`:

| Perintah | Deskripsi | Kapan Digunakan |
| :--- | :--- | :--- |
| `bun run dev` | Menjalankan Vite dev server di port 3000 dengan Hot Module Replacement (HMR). | Saat mengembangkan fitur baru secara lokal. |
| `bun run build` | Melakukan kompilasi produksi ke dalam folder `/dist` dengan pembagian *chunk* optimal. | Sebelum membuat rilis atau saat memverifikasi hasil *bundling*. |
| `bun run preview` | Menjalankan server lokal ringan untuk menguji hasil build di `/dist`. | Verifikasi akhir sebelum deployment. |
| `bun run test` | Menjalankan seluruh pengujian otomatis (Vitest) satu kali putaran (*run mode*). | Setiap kali sebelum melakukan git commit atau push. |
| `bun run test:watch` | Menjalankan Vitest dalam mode interaktif *watch* (mengecek ulang saat ada file berubah). | Saat sedang menulis *unit test* atau melakukan TDD. |
| `bun run typecheck` | Menjalankan `tsc --noEmit` untuk validasi tipe TypeScript tanpa menghasilkan file `.js`. | Memastikan tidak ada *type error* yang tersembunyi. |

---

## 5. Rangkaian Pengujian Otomatis (Testing Standards)

Proyek ini memiliki standar kualitas tinggi dengan **40 berkas pengujian dan 294 pengujian unit/integrasi** yang mencakup fungsionalitas UI, logika geospasial, algoritma geodesik, hingga ketahanan aksesibilitas.

```bash
# Menjalankan seluruh rangkaian tes:
bun run test

# Menjalankan berkas pengujian spesifik (contoh: modul pengukuran):
bun run vitest run tests/measure-floating-pill.test.ts

# Menjalankan tes dengan filter kata kunci:
bun run vitest run -t "MeasureTool"
```

### Lingkungan Pengujian (Testing Environment)
* Pengujian UI kanvas dan DOM berjalan di atas emulator **Happy-DOM** (`@vitest-environment happy-dom`) yang ringan dan berkecepatan tinggi.
* MapLibre GL kanvas, context 2D/WebGL, dan pemanggilan jaringan dimock secara deterministik agar tes dapat dieksekusi di lingkungan CI/CD tanpa ketergantungan perangkat keras GPU.

---

## 6. Prosedur Kompilasi Produksi (Production Build)

Aplikasi dibangun menggunakan **Vite 6** dengan optimasi pemisahan *chunk* modular di [vite.config.ts](file:///d:/webgis/vite.config.ts):

* `vendor-maplibre`: Berisi pustaka MapLibre GL (~1.05 MB unminified / ~287 KB gzipped).
* `vendor-turf`: Berisi algoritma kalkulasi spasial Turf.js (~295 KB / ~69 KB gzipped).
* `vendor-pmtiles`: Pembaca arsip ubin PMTiles (~19 KB).
* `vendor-shpjs`: Parser arsip ZIP Shapefile.
* `vendor-kml`: Generator & Parser KML.

Untuk menguji build produksi secara lokal:
```bash
bun run build
bun run preview
```

---

## 7. Panduan Deployment ke Vercel

Platform ini dikonfigurasi secara optimal untuk di-deploy ke **Vercel** melalui berkas [vercel.json](file:///d:/webgis/vercel.json).

### Langkah Deployment melalui Dashboard Vercel:
1. Hubungkan akun GitHub ke [Vercel](https://vercel.com/).
2. Impor repositori `chipslova/webgis`.
3. Pada halaman konfigurasi proyek (*Project Settings*):
   * **Framework Preset**: `Vite`
   * **Build Command**: `vite build`
   * **Output Directory**: `dist`
   * **Install Command**: `bun install` (atau `npm install`)
4. Buka menu **Environment Variables** dan tambahkan:
   * `GEMINI_API_KEY`: Kunci API Gemini Anda.
   * `GEE_SERVICE_ACCOUNT_KEY`: String JSON akun layanan Google Earth Engine.
5. Klik tombol **Deploy**.

Setiap *push* ke branch `main` pada repositori GitHub akan otomatis memicu *Preview Deployment* atau *Production Deployment* secara instan.
