# 📚 Paket Dokumen Handoff & Panduan Teknis
## Digital Earth Indonesia WebGIS Platform

Selamat datang di repositori dokumentasi serah terima (*handoff documentation*) proyek **Digital Earth Indonesia WebGIS**. Dokumen ini dirancang sebagai panduan komprehensif bagi pengembang (*software engineer*), spesialis SIG (*GIS specialist*), tim produk (*product manager*), maupun administrator infrastruktur (*DevOps/Cloud engineer*) untuk memahami, memelihara, dan mengembangkan platform ini ke depan.

---

## 🧭 Peta Navigasi Dokumen

Seluruh dokumentasi disusun secara modular ke dalam 5 dokumen utama yang saling melengkapi:

| No | Dokumen | Target Pembaca | Fokus Utama |
| :---: | :--- | :--- | :--- |
| **01** | [**01_RINGKASAN_EKSEKUTIF_DAN_ARSITEKTUR.md**](./01_RINGKASAN_EKSEKUTIF_DAN_ARSITEKTUR.md) | Semua Tim / Tech Lead | Visi proyek, diagram arsitektur tingkat tinggi, tumpukan teknologi (*tech stack*), struktur direktori, alur state, dan hirarki tumpukan layer (*layer order*). |
| **02** | [**02_PANDUAN_SETUP_DAN_DEVELOPMENT.md**](./02_PANDUAN_SETUP_DAN_DEVELOPMENT.md) | Developer / DevOps | Prasyarat sistem (Bun, Node, Vite), manajemen *environment variables* (`.env.local`), alur build, eksekusi unit test (Vitest), dan prosedur rilis ke Vercel. |
| **03** | [**03_DOKUMENTASI_FITUR_DAN_MODUL_SPASIAL.md**](./03_DOKUMENTASI_FITUR_DAN_MODUL_SPASIAL.md) | Frontend & GIS Specialist | Rincian implementasi 8 modul geospasial: Basemap & Sublayer, BIG Piksel Time-Lapse, GEE Live & Termal MODIS, Alat Ukur Geodesik & Profil 3D, Analisis Spasial & Buffer, Hub Data (Shapefile/GeoJSON/KML/CSV), Swipe Compare, serta Asisten AI. |
| **04** | [**04_KATALOG_API_DAN_INTEGRASI_DATA.md**](./04_KATALOG_API_DAN_INTEGRASI_DATA.md) | Backend & Integrator | Spesifikasi endpoint Vercel Serverless & Edge (`/api/*`), proxy WMS, integrasi Google Earth Engine, format payload, skema autentikasi, serta proteksi *rate-limiting*. |
| **05** | [**05_AUDIT_KEKURANGAN_DAN_ROADMAP_PENGEMBANGAN.md**](./05_AUDIT_KEKURANGAN_DAN_ROADMAP_PENGEMBANGAN.md) | Tech Lead & Product Owner | **Audit mendalam kekurangan aplikasi saat ini**, batasan teknis (*technical debt*), analisis risiko, perbandingan arsitektural, dan peta jalan perbaikan (*development roadmap*). |

---

## ⚡ Ringkasan Cepat Proyek (At a Glance)

* **Nama Proyek**: Digital Earth Indonesia WebGIS (`webgis-maplibre-bun`)
* **Repositori GitHub**: [chipslova/webgis](https://github.com/chipslova/webgis)
* **Tautan Produksi**: [webgis-three-iota.vercel.app](https://webgis-three-iota.vercel.app/)
* **Mesin Rendering**: MapLibre GL JS v6.10.0 (WebGL2)
* **Kalkulasi Spasial**: Turf.js (Geodesic algorithms)
* **Runtime & Package Manager**: Bun (v1.2+) / Vite 6 / TypeScript 5.9
* **Infrastruktur Hosting**: Vercel (Edge Network + Serverless Node.js Functions)
* **Status Pengujian**: 294 unit & integration tests passing (Vitest, 100% green)

---

## 🎯 Panduan Memulai Cepat untuk Pengembang Baru

Jika Anda baru saja menerima repositori ini dan ingin langsung menjalankannya di lingkungan lokal:

```bash
# 1. Kloning repositori
git clone https://github.com/chipslova/webgis.git
cd webgis

# 2. Pasang dependensi menggunakan Bun (atau npm)
bun install

# 3. Jalankan server pengembangan lokal (http://localhost:3000)
bun run dev

# 4. Jalankan seluruh rangkaian tes otomatis
bun run test

# 5. Jalankan pemeriksaan tipe TypeScript
bun run typecheck
```

Silakan lanjutkan membaca berkas [**01_RINGKASAN_EKSEKUTIF_DAN_ARSITEKTUR.md**](./01_RINGKASAN_EKSEKUTIF_DAN_ARSITEKTUR.md) untuk memahami gambaran besar sistem.
