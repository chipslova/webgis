# 03. Dokumentasi Fitur & Modul Geospasial
## Digital Earth Indonesia WebGIS

Dokumen ini menguraikan arsitektur internal, alur data, komponen antarmuka, serta logika teknis dari 8 modul geospasial utama di dalam aplikasi.

---

## Modul 1: Peta Dasar & Hirarki Lapisan (Basemaps & Sublayers)

* **Berkas Sumber**: [src/config/basemaps.ts](file:///d:/webgis/src/config/basemaps.ts), [src/tools/basemap-customizer.ts](file:///d:/webgis/src/tools/basemap-customizer.ts), [src/ui/basemap-customizer-panel.ts](file:///d:/webgis/src/ui/basemap-customizer-panel.ts)
* **Tanggung Jawab**: Menyediakan katalog 16 peta dasar (vektor dan raster), filter warna non-destruktif, dan kontrol sublapisan vektor granular.

### Fitur Kunci:
1. **Katalog 16 Peta Dasar**:
   * *Citra Satelit*: Esri World Imagery (Bawaan), Esri Imagery Clarity.
   * *Peta Topografi*: Esri Topographic, OpenTopoMap, Esri Shaded Relief, Esri National Geographic, Esri Ocean.
   * *Peta Jalan & Nasional*: Rupabumi Indonesia (BIG RBI Vector), Esri World Streets, OpenStreetMap Standard, OSM Humanitarian.
   * *Vektor Minimalis*: OpenFreeMap Liberty, OpenFreeMap Positron, Esri Light/Dark Gray Canvas, Esri Colored Pencil.
2. **Kontrol Sublapisan Vektor Granular**:
   * Memungkinkan pengguna mematikan/menyalakan elemen vektor individu (*Jalan*, *Label Jalan*, *Batas Administrasi*, *Tutupan Lahan*, *Perairan*, dan *Bangunan*).
   * Pada peta dasar raster (seperti Esri Imagery), sistem menampilkan lencana pemberitahuan (*notice badge*) dan tombol pintas 1-klik untuk beralih ke peta vektor agar sublapisan dapat diatur.
3. **Kamera Pintar (Auto-Zoom & Pitch Tilt)**:
   * Jika pengguna mengaktifkan sublayer bangunan atau medan 3D dari posisi zoom jauh ($Z \le 14$), kamera secara otomatis melakukan animasi *fly-to* halus ke level $Z \ge 15.5$ dengan kemiringan *pitch* $50^\circ$ agar objek arsitektural 3D langsung terlihat dramatis.

---

## Modul 2: Citra Satelit BIG Piksel & Time-Lapse Multitemporal

* **Berkas Sumber**: [src/config/piksel.ts](file:///d:/webgis/src/config/piksel.ts), [src/tools/piksel-loader.ts](file:///d:/webgis/src/tools/piksel-loader.ts), [src/ui/piksel-panel.ts](file:///d:/webgis/src/ui/piksel-panel.ts)
* **Tanggung Jawab**: Menghubungkan layanan OGC WMS Badan Informasi Geospasial (BIG Piksel) dan Open Data Cube untuk menyajikan mosaik tahunan bebas awan Sentinel-2.

### Fitur Kunci:
1. **Sentinel-2 GeoMAD 10m (2017–2025)**:
   * Komposit *Median Absolute Deviation* (GeoMAD) tahunan resolusi 10 meter untuk seluruh daratan Indonesia.
2. **Pemutar Animasi Time-Lapse Multitemporal**:
   * Dilengkapi teknik *double-buffering* pada kanvas peta untuk transisi antar-tahun yang mulus tanpa kedipan putih (*seamless cross-fade*).
   * Kontrol antarmuka lengkap: Play/Pause, Step Prev/Next, Slider Scrubber, pengatur kecepatan (0.5x, 1x, 2x), dan tombol pintas tahunan.
3. **Indeks Spektral Satelit**:
   * **NDVI** (*Normalized Difference Vegetation Index*): Analisis kerapatan hutan dan biomassa.
   * **NDWI** (*Normalized Difference Water Index*): Delineasi kelembapan tanah dan genangan air.
   * **NDBI** (*Normalized Difference Built-up Index*): Pemetaan ekspansi lahan perkotaan/terbangun.
   * **Kerapatan Pengamatan**: Visualisasi jumlah lintasan satelit bebas awan per piksel.
4. **Preset Lokasi Prioritas**:
   * Navigasi instan ke kawasan prioritas: IKN Nusantara, Gunung Bromo & Merapi, Danau Toba, Citarum, serta area Karhutla Gambut Sebangau dan Pesisir Riau.
5. **Penyesuaian Visual Real-Time**:
   * Kontrol slider *Brightness* (kecerahan), *Contrast* (kontras), dan *Saturation* (kejenuhan) yang diaplikasikan langsung pada level rendering GPU.

---

## Modul 3: GEE Live, Data Termal MODIS & Curah Hujan CHIRPS

* **Berkas Sumber**: [src/tools/gee-loader.ts](file:///d:/webgis/src/tools/gee-loader.ts), [src/ui/gee-panel.ts](file:///d:/webgis/src/ui/gee-panel.ts), [api/gee-*.ts](file:///d:/webgis/api)
* **Tanggung Jawab**: Visualisasi data iklim makro, gradien suhu permukaan tanah, dan presipitasi global.

### Fitur Kunci:
1. **MODIS Land Surface Temperature (LST 1 km)**:
   * Menampilkan suhu permukaan daratan kontinu ($10^\circ\text{C}$ hingga $42^\circ\text{C}+$) dengan palet termal kontras tinggi dari NASA GIBS / MODIS Terra & Aqua.
   * Dilengkapi *ocean masking* transparan agar tidak menutupi visualisasi perairan laut.
2. **Curah Hujan Harian CHIRPS (GEE)**:
   * Lapisan presipitasi satelit resolusi $0.05^\circ$ (~5.5 km) dari Climate Hazards Center UCSB untuk memantau intensitas hujan di Indonesia.
3. **Sampling Piksel Client-Side Tanpa Akun**:
   * Mengekstrak nilai spektral piksel langsung dari elemen kanvas ubin Sentinel-2 dan Open-Meteo REST API, memberikan informasi kondisi cuaca dan reflektansi tanpa perlu otentikasi server.

---

## Modul 4: Alat Ukur Geodesik & Profil Elevasi 3D

* **Berkas Sumber**: [src/tools/measure.ts](file:///d:/webgis/src/tools/measure.ts)
* **Tanggung Jawab**: Perhitungan jarak dan luas geodesik serta rekonstruksi penampang lintang topografi medan.

### Fitur Kunci:
1. **Perhitungan Geodesik Presisi Tinggi**:
   * Menggunakan pustaka `@turf/length` dan `@turf/area` yang menghitung jarak dan luas di atas elipsoid bumi WGS84 sesungguhnya (bukan proyeksi bidang datar planar).
2. **Bilah Aksi Melayang (Floating Action Pill)**:
   * Widget aksi mengambang di atas peta yang menyajikan tombol interaktif: *Undo* (<kbd>Z</kbd>), *Selesai* (<kbd>Enter</kbd>), dan *Batal* (<kbd>Esc</kbd>).
   * Tombol-tombol ini memiliki status dinamis (`disabled`/`enabled`) yang sinkron dengan jumlah titik koordinat yang telah diletakkan.
3. **Profil Elevasi 3D Permukaan Tanah (DEM mdpl)**:
   * Saat mengukur jarak garis, sistem melakukan interpolasi titik sepanjang garis dan membaca elevasi dari mesh AWS Terrarium DEM.
   * Menghasilkan grafik SVG interaktif: elevasi minimum, maksimum, total kenaikan (*gain*), total penurunan (*loss*), serta kursor penunjuk koordinat sinkron antara grafik dan peta.
4. **Dekonflik Interaksi & Cooldown**:
   * Dilengkapi mekanisme *cooldown* 400ms (`isRecentlyFinished()`) setelah *double-click finish* untuk mencegah klik sisa memicu kartu inspektur titik (*PointInspector*).

---

## Modul 5: Analisis Spasial & Statistik Zonal AOI

* **Berkas Sumber**: [src/tools/spatial-analysis.ts](file:///d:/webgis/src/tools/spatial-analysis.ts), [src/tools/spatial-buffer.ts](file:///d:/webgis/src/tools/spatial-buffer.ts), [src/tools/spatial-intersect.ts](file:///d:/webgis/src/tools/spatial-intersect.ts), [src/ui/spatial-analysis-ui.ts](file:///d:/webgis/src/ui/spatial-analysis-ui.ts), [src/ui/buffer-analysis-ui.ts](file:///d:/webgis/src/ui/buffer-analysis-ui.ts)
* **Tanggung Jawab**: Analisis jangkauan fasilitas (Buffer), tumpang tindih spasial (Overlay/Intersect), dan ringkasan tutupan lahan.

### Fitur Kunci:
1. **Zona Penyangga Geodesik (Buffer Analysis)**:
   * Membentuk zona radius lingkaran geodesik di sekitar titik, garis, atau poligon ($10\text{ m} \to 50.000\text{ m}$).
   * Menghitung total luas zona buffer ($km^2$), menyediakan pemilih warna (*color picker*), dan opsi penggantian otomatis (*auto-replace*).
2. **Statistik Zonal AOI (Area of Interest)**:
   * Pengguna dapat menggambar poligon bebas di peta. Sistem kemudian menghitung persentase komposisi 11 kelas tutupan lahan (ESA WorldCover) dan anomali suhu permukaan tanah.
3. **Ekspor Laporan Analisis Lengkap**:
   * **Cetak Dokumen PDF A4**: Lembar laporan rapi dengan kop resmi, ringkasan KPI, grafik komposisi tutupan lahan, dan atribusi sumber data.
   * **Tabel CSV (BOM UTF-8)**: Ekspor tabular yang siap dibuka langsung di Excel tanpa masalah karakter mojibake.
   * **Berkas Geometri (.GeoJSON)**: Unduhan poligon batas analisis beserta atribut statistik yang melekat.
4. **Mesin Tumpang Tindih Spasial (Spatial Overlay Core)**:
   * Mendukung 4 operasi himpunan ruang: *Irisan (Intersection)*, *Pengurangan (Difference)*, *Penggabungan (Union)*, dan *Beda Simetris (XOR)* menggunakan `@turf/intersect` dan kawan-kawan.

---

## Modul 6: Hub Data Geospasial & Tabel Atribut

* **Berkas Sumber**: [src/tools/geojson-loader.ts](file:///d:/webgis/src/tools/geojson-loader.ts), [src/ui/data-panel.ts](file:///d:/webgis/src/ui/data-panel.ts), [src/ui/attribute-table-panel.ts](file:///d:/webgis/src/ui/attribute-table-panel.ts), [src/utils/shapefile-parser.ts](file:///d:/webgis/src/utils/shapefile-parser.ts), [src/utils/csv-parser.ts](file:///d:/webgis/src/utils/csv-parser.ts), [src/utils/kml-parser.ts](file:///d:/webgis/src/utils/kml-parser.ts)
* **Tanggung Jawab**: Mengimpor, memvalidasi, memvisualisasikan, dan menginspeksi data vektor pengguna.

### Fitur Kunci:
1. **Impor Multi-Format Terpadu**:
   * **ESRI Shapefile Archive (`.zip`)**: Membaca otomatis berkas `.shp`, `.dbf`, `.shx`, dan `.prj` menggunakan pustaka `shpjs`. Mendukung arsip *multi-layer* (memuat beberapa shapefile sekaligus dalam 1 zip) dan membaginya menjadi layer terpisah.
   * **GeoJSON (`.geojson`, `.json`)**: Parsing langsung dengan validasi geometri WGS84.
   * **Google Earth KML (`.kml`)**: Konversi client-side ke GeoJSON dengan sanitasi tag XML.
   * **Tabel Terpisah CSV/TSV (`.csv`, `.tsv`, `.txt`)**: Deteksi cerdas kolom lintang/bujur (seperti `lat`, `latitude`, `lintang`, `y` dan `lon`, `lng`, `longitude`, `bujur`, `x`).
2. **Panel Tabel Atribut Interaktif**:
   * Menampilkan data tabular dari fitur yang dipilih dengan pencarian teks dinamis (*filtering*), penyorotan fitur di peta (*highlight on hover/click*), dan sanitasi karakter HTML anti-XSS.

---

## Modul 7: Tirai Pembanding (Swipe Compare) & Ekspor Kartografis

* **Berkas Sumber**: [src/tools/swipe-compare.ts](file:///d:/webgis/src/tools/swipe-compare.ts), [src/tools/map-exporter.ts](file:///d:/webgis/src/tools/map-exporter.ts), [src/ui/swipe-compare-ui.ts](file:///d:/webgis/src/ui/swipe-compare-ui.ts)
* **Tanggung Jawab**: Perbandingan visual *split-screen* dua peta secara interaktif dan pembuatan gambar peta siap cetak.

### Fitur Kunci:
1. **Tirai Pembanding Interaktif (Swipe Compare)**:
   * Menggunakan dua instance MapLibre GL yang disinkronkan kamera dan posisinya via *clipping rectangle* CSS.
   * Pengguna dapat menggeser pembatas tirai ke kiri dan kanan untuk membandingkan perubahan lingkungan (misal: Citra Satelit 2017 vs 2025, Citra True Color vs NDVI Bromo, atau Peta Jalan vs Citra Satelit).
2. **Ekspor Peta Kartografis Siap Cetak**:
   * Pilihan rasio aspek: **16:9** (Widescreen), **4:3** (Standar), **A4** (Landscape), **1:1** (Persegi).
   * Pilihan resolusi: **1x** (Web) & **2x** (Ultra HD Print).
   * Format gambar: **PNG** & **JPEG**.
   * Elemen kartografi otomatis: Panah Arah Utara dinamis (*North Arrow*), Skala Batang Metrik Geodesik, Legenda Terintegrasi, Koordinat WGS84, dan Atribusi Sumber Data.

---

## Modul 8: Asisten AI (Copilot), Command Palette & Aksesibilitas

* **Berkas Sumber**: [src/tools/ai-navigator.ts](file:///d:/webgis/src/tools/ai-navigator.ts), [src/ui/command-palette.ts](file:///d:/webgis/src/ui/command-palette.ts), [src/tools/eco-mode.ts](file:///d:/webgis/src/tools/eco-mode.ts), [src/utils/a11y.ts](file:///d:/webgis/src/utils/a11y.ts)
* **Tanggung Jawab**: Meningkatkan kenyamanan navigasi, pencarian perintah cepat, dan inklusivitas pengguna.

### Fitur Kunci:
1. **Asisten AI Peta Pintar (Gemini Copilot)**:
   * Panel chat mengambang yang terhubung ke endpoint `/api/gemini-navigator`.
   * Mendukung *Function Calling* untuk menggerakkan peta secara otonom (contoh: *"Tunjukkan Gunung Merapi dan bandingkan dengan citra 2018"* akan memicu fungsi `flyToLocation` dan mengatur layer secara otomatis).
2. **Spotlight Command Palette (<kbd>Ctrl</kbd>+<kbd>K</kbd> / <kbd>Cmd</kbd>+<kbd>K</kbd>)**:
   * Menu cepat universal untuk mencari layer, berpindah basemap, membuka alat ukur, mereset peta, atau mencari fitur dalam hitungan detik.
3. **Deteksi Mode Hemat Daya (Eco-Mode)**:
   * Mendeteksi otomatis profil perangkat pengguna (jumlah inti CPU, memori RAM, renderer GPU, dan baterai).
   * Pada perangkat berspesifikasi rendah, sistem otomatis menurunkan beban *fill-rate* WebGL dan membatasi kemiringan kamera demi mempertahankan kelancaran interaksi.
4. **Aksesibilitas Lengkap (WCAG 2.1 Compliance)**:
   * Penanganan tombol <kbd>Esc</kbd> universal untuk menutup dialog, membatalkan alat ukur, atau menutup panel laci.
   * Atribut ARIA (`aria-expanded`, `aria-label`, `aria-live`) dan navigasi fokus keyboard penuh untuk pengguna pembaca layar (*screen reader*).
