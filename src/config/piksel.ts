/**
 * ============================================================================
 * STANDARD TERMINOLOGY & ARCHITECTURAL GLOSSARY:
 * ============================================================================
 * 1. Layer         : Active spatial data layer on the map canvas (Piksel WMS, GeoJSON, GEE Raster/POI).
 * 2. Sublayer      : Vector thematic sublayer derived from basemap (Roads, Buildings, Contours, Labels).
 * 3. Tile Grid     : Open Data Cube national tile boundaries (1,631 tiles across Indonesia).
 * 4. Data Cube     : ODC-based spatial repository system (BIG Piksel).
 * 5. Case Study    : Focused analytical modeling (e.g. MODIS Thermal LST Analysis for Jabodetabek & West Java).
 * ============================================================================
 */

export type LegendType = 'continuous' | 'categorical' | 'natural';

export interface LegendSwatch {
  label: string;
  color: string;
  icon?: string;
}

export interface ContinuousLegend {
  type: 'continuous';
  leftLabel: string;
  middleLabel?: string;
  rightLabel: string;
  gradientClass: string;
  rangeText?: string;
  swatches?: LegendSwatch[];
}

export interface CategoricalItem {
  label: string;
  color: string;
  icon?: string;
}

export interface CategoricalLegend {
  type: 'categorical';
  items: CategoricalItem[];
  swatches?: LegendSwatch[];
}

export interface NaturalLegend {
  type: 'natural';
  leftLabel: string;
  middleLabel?: string;
  rightLabel: string;
  gradientClass: string;
  swatches?: LegendSwatch[];
}

export type PikselLegend = ContinuousLegend | CategoricalLegend | NaturalLegend;

export type ProductCategory = 'geomad' | 'indices' | 'quality' | 'landsat' | 'hazard' | 'other';

export interface PikselProduct {
  id: string;
  name: string;
  category: ProductCategory;
  layer: string;
  style: string;
  timeEnabled?: boolean;
  timeMode?: 'annual' | 'year-range' | 'none';
  availableYears?: string[];
  serviceUrl: string;
  description: string;
  badge: string;
  color: string;
  resolution: string;
  sensor: string;
  whatItShows: string;
  legend: PikselLegend;
  attribution?: string;
  statusNotice?: string;
  isComputeHeavy?: boolean;
  isDisabled?: boolean;
  minZoom?: number;
}

export interface PikselPreset {
  id: string;
  name: string;
  locationName: string;
  center: [number, number];
  zoom: number;
  pitch?: number;
  description: string;
  recommendedProduct: string;
}

export const PIKSEL_CATEGORIES: { id: ProductCategory; name: string; icon: string; subtitle: string }[] = [
  { id: 'geomad', name: 'Sentinel-2 GeoMAD', icon: '', subtitle: 'Komposit Optik & Inframerah Bebas Awan 10m' },
  { id: 'indices', name: 'Spectral Indices', icon: '', subtitle: 'Indeks Kerapatan Vegetasi & Badan Air Permukaan' },
  { id: 'landsat', name: 'Landsat 9', icon: '', subtitle: 'Observasi Reflektansi Permukaan USGS/NASA 30m' },
  { id: 'hazard', name: 'Flood Hazard', icon: '', subtitle: 'Pemodelan Hidrologi Bahaya Banjir Kawasan Prioritas' },
  { id: 'quality', name: 'Data Quality', icon: '', subtitle: 'Statistik Pengamatan Bebas Awan Tiap Piksel' }
];

// In production (Vercel) route all WMS requests through the Edge proxy so we get
// retry logic, 8s timeout, transparent-PNG fallback, and edge-level caching.
// In local dev we hit the upstream directly to avoid proxy confusion.
const IS_LOCAL_DEV =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const PIKSEL_WMS_BASE_URL = IS_LOCAL_DEV
  ? 'https://ows.staging.piksel.big.go.id/wms'
  : '/api/wms-proxy';
export const S2_YEARS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'];
export const LS9_YEARS = ['2026', '2025', '2024', '2023', '2022', '2021'];

export const PIKSEL_PRODUCTS: PikselProduct[] = [
  // 1. GeoMAD Group
  {
    id: 's2-geomad-rgb',
    name: 'Sentinel-2 True Color (RGB)',
    category: 'geomad',
    layer: 's2_geomad_annual_spectral',
    style: 'rgb',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Komposit optik resolusi tinggi 10m tahunan bebas awan di seluruh wilayah Indonesia.',
    whatItShows: 'Foto satelit warna alami (RGB): Kanopi hutan hujan hijau, kawasan terbangun abu-abu, dan badan air biru tanpa tutupan awan.',
    badge: 'Optik 10m (BIG)',
    color: '#10b981',
    resolution: '10 meters',
    sensor: 'Sentinel-2 MSI (GeoMAD Tahunan)',
    legend: {
      type: 'natural',
      leftLabel: 'Air / Laut',
      middleLabel: 'Lahan / Kota',
      rightLabel: 'Kanopi Hutan',
      gradientClass: 's2-geomad-gradient',
      swatches: [
        { label: 'Air (Biru)', color: '#1e40af' },
        { label: 'Lahan Terbuka (Krem)', color: '#d4b285' },
        { label: 'Kanopi Hutan (Hijau)', color: '#15803d' },
        { label: 'Area Terbangun (Abu-abu)', color: '#94a3b8' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel / Copernicus Sentinel-2'
  },
  {
    id: 's2-geomad-nir',
    name: 'Sentinel-2 False Color (NIR)',
    category: 'geomad',
    layer: 's2_geomad_annual_spectral',
    style: 'false_color_nir',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Komposit saluran Inframerah Dekat (NIR-Red-Green) untuk menonjolkan vitalitas klorofil dan biomassa vegetasi.',
    whatItShows: 'Vegetasi sehat tampak merah terang/magenta akibat pantulan kuat klorofil seluler; air tampak biru gelap/hitam; kawasan perkotaan tampak sian/abu-abu.',
    badge: 'Inframerah 10m',
    color: '#ef4444',
    resolution: '10 meters',
    sensor: 'Sentinel-2 MSI (NIR False Color)',
    isComputeHeavy: true,
    legend: {
      type: 'continuous',
      leftLabel: 'Air / Rawa',
      middleLabel: 'Area Terbangun / Kota',
      rightLabel: 'Kanopi Lebat (Klorofil)',
      gradientClass: 's2-nir-gradient',
      swatches: [
        { label: 'Air / Rawa (Gelap/Biru)', color: '#020617' },
        { label: 'Area Terbangun (Sian/Abu-abu)', color: '#64748b' },
        { label: 'Klorofil Lebat (Merah/Magenta)', color: '#f43f5e' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel / Copernicus Sentinel-2'
  },

  // 2. Spectral Indices Group
  {
    id: 's2-ndvi',
    name: 'Indeks Kerapatan Vegetasi (NDVI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'ndvi',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Normalized Difference Vegetation Index dari Open Data Cube BIG untuk memetakan kerapatan biomassa dan kanopi hutan.',
    whatItShows: 'Gradien vitalitas klorofil: Hijau tua menunjukkan hutan tropis primer lebat, kuning menunjukkan semak/pertanian, cokelat menunjukkan lahan non-vegetasi.',
    badge: 'Indeks Biofisik',
    color: '#059669',
    resolution: '10 meters',
    sensor: 'Sentinel-2 GeoMAD Indices',
    isComputeHeavy: true,
    legend: {
      type: 'continuous',
      leftLabel: 'Air / Non-Veg (-1,0 s/d 0,0)',
      middleLabel: 'Jarang (0,2 s/d 0,4)',
      rightLabel: 'Hutan Lebat (0,7 s/d +1,0)',
      gradientClass: 'ndvi-gradient',
      rangeText: 'Skala Indeks: -1,0 s/d +1,0',
      swatches: [
        { label: 'Air / Non-Veg (-1,0)', color: '#0284c7' },
        { label: 'Vegetasi Jarang (+0,3)', color: '#fde047' },
        { label: 'Hutan Lebat (+0,8)', color: '#15803d' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },
  {
    id: 's2-ndwi',
    name: 'Indeks Air & Kelembapan (NDWI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'ndwi',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Normalized Difference Water Index untuk mendelineasi badan air terbuka, danau, sungai, dan lahan basah dari daratan.',
    whatItShows: 'Pantulan spektral air: Biru tua menunjukkan badan air terbuka, biru muda menunjukkan lahan basah/rawa, warna hangat menunjukkan daratan kering.',
    badge: 'Indeks Hidrologi',
    color: '#0284c7',
    resolution: '10 meters',
    sensor: 'Sentinel-2 GeoMAD Indices',
    legend: {
      type: 'continuous',
      leftLabel: 'Daratan Kering (-1,0 s/d -0,2)',
      middleLabel: 'Lembap (0,0)',
      rightLabel: 'Badan Air Terbuka (+0,3 s/d +1,0)',
      gradientClass: 'ndwi-gradient',
      rangeText: 'Skala Indeks: -1,0 s/d +1,0',
      swatches: [
        { label: 'Daratan Kering (-0,5)', color: '#b45309' },
        { label: 'Lahan Basah Lembap (0,0)', color: '#67e8f9' },
        { label: 'Badan Air Terbuka (+0,7)', color: '#1e3a8a' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },
  {
    id: 's2-bsi',
    name: 'Indeks Tanah Terbuka (BSI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'bsi',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Kombinasi spektral Blue-Red-NIR-SWIR untuk mengidentifikasi tanah terbuka, pembukaan lahan, tambang, dan area konstruksi.',
    whatItShows: 'Paparan tanah terbuka: Nilai tinggi menunjukkan lahan terbuka atau tambang aktif, nilai rendah menunjukkan tutupan kanopi atau air.',
    badge: 'Tidak Tersedia',
    color: '#64748b',
    resolution: '10 meters',
    sensor: 'Sentinel-2 GeoMAD Indices',
    isDisabled: true,
    statusNotice: 'Saat ini tidak tersedia — server upstream OGC mengembalikan HTTP 500. Produk belum aktif pada staging.',
    legend: {
      type: 'continuous',
      leftLabel: 'Vegetasi / Air',
      middleLabel: 'Campuran / Sedang',
      rightLabel: 'Tanah Terbuka / Tambang',
      gradientClass: 'bsi-gradient',
      swatches: [
        { label: 'Kanopi Lebat (Hijau)', color: '#064e3b' },
        { label: 'Lahan Campuran (Kuning)', color: '#fde047' },
        { label: 'Tanah Terbuka / Tambang (Merah)', color: '#dc2626' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },

  // 3. Hazard Group
  {
    id: 'flood-hazard-rp02',
    name: 'Model Bahaya Banjir (Periode Ulang 2 Thn)',
    category: 'hazard',
    layer: 'flood_hazard_rp02',
    style: 'hazard_class',
    timeEnabled: false,
    timeMode: 'none',
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Zonasi bahaya banjir probabilitas tahunan 50% dari pemodelan hidrologi spasial BIG untuk kawasan studi prioritas.',
    whatItShows: 'Zona bahaya genangan banjir periode ulang 2 tahun di sepanjang dataran banjir aluvial dalam kawasan studi tervalidasi.',
    badge: 'Banjir PU 2-Thn',
    color: '#3b82f6',
    resolution: '10-30 meters',
    sensor: 'Model Hidrologi Spasial BIG',
    legend: {
      type: 'categorical',
      items: [
        { label: 'Bahaya Rendah', color: '#fef08a' },
        { label: 'Bahaya Sedang', color: '#f97316' },
        { label: 'Bahaya Tinggi', color: '#dc2626' }
      ],
      swatches: [
        { label: 'Bahaya Rendah', color: '#fef08a' },
        { label: 'Bahaya Sedang', color: '#f97316' },
        { label: 'Bahaya Tinggi', color: '#dc2626' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Ina-Geoportal / Piksel'
  },
  {
    id: 'flood-hazard-rp10',
    name: 'Model Bahaya Banjir (Periode Ulang 10 Thn)',
    category: 'hazard',
    layer: 'flood_hazard_rp10',
    style: 'hazard_class',
    timeEnabled: false,
    timeMode: 'none',
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Zonasi bahaya banjir probabilitas tahunan 10% untuk mitigasi risiko bencana pada kawasan studi prioritas.',
    whatItShows: 'Zona bahaya genangan banjir periode ulang 10 tahun di sepanjang dataran banjir dan pesisir dalam kawasan studi tervalidasi.',
    badge: 'Banjir PU 10-Thn',
    color: '#8b5cf6',
    resolution: '10-30 meters',
    sensor: 'Model Hidrologi Spasial BIG',
    legend: {
      type: 'categorical',
      items: [
        { label: 'Bahaya Rendah', color: '#fef08a' },
        { label: 'Bahaya Sedang', color: '#f97316' },
        { label: 'Bahaya Tinggi', color: '#dc2626' }
      ],
      swatches: [
        { label: 'Bahaya Rendah', color: '#fef08a' },
        { label: 'Bahaya Sedang', color: '#f97316' },
        { label: 'Bahaya Tinggi', color: '#dc2626' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Ina-Geoportal / Piksel'
  },

  // 4. Quality & Statistics Group
  {
    id: 's2-count',
    name: 'Jumlah Pengamatan Bebas Awan (Scene Count)',
    category: 'quality',
    layer: 's2_geomad_annual_statistics',
    style: 'count',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Jumlah akuisisi Sentinel-2 bebas awan yang menyusun setiap piksel dalam komposit tahunan GeoMAD.',
    whatItShows: 'Statistik pengamatan: Total adegan (scene) bebas awan yang digunakan untuk estimasi piksel GeoMAD tahunan.',
    badge: 'Kualitas Data',
    color: '#6366f1',
    resolution: '10 meters',
    sensor: 'Open Data Cube Quality Mask',
    legend: {
      type: 'continuous',
      leftLabel: 'Rendah (< 5 Scene)',
      middleLabel: 'Sedang (~15 Scene)',
      rightLabel: 'Tinggi (> 30 Scene)',
      gradientClass: 'count-gradient',
      rangeText: 'Jumlah Scene Bebas Awan per Piksel',
      swatches: [
        { label: 'Pengamatan Rendah (<5)', color: '#4c1d95' },
        { label: 'Pengamatan Sedang (~15)', color: '#06b6d4' },
        { label: 'Pengamatan Tinggi (>30)', color: '#facc15' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },

  // 5. Landsat Group
  {
    id: 'ls9-sr',
    name: 'Reflektansi Permukaan Landsat 9 (30m)',
    category: 'landsat',
    layer: 'ls9_c2l2_sr',
    style: 'simple_rgb',
    timeEnabled: true,
    timeMode: 'year-range',
    availableYears: LS9_YEARS,
    minZoom: 7,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Reflektansi permukaan optik multiespektral 30m dari USGS/NASA Landsat 9 dalam Data Cube BIG.',
    whatItShows: 'Reflektansi permukaan terkalibrasi: Sangat baik untuk perbandingan historis multidekade dengan arsip Landsat 5/7/8.',
    badge: 'Multispektral 30m',
    color: '#ec4899',
    resolution: '30 meters',
    sensor: 'Landsat 9 OLI-2 (Collection 2 Level-2)',
    isComputeHeavy: true,
    statusNotice: 'Catatan: Landsat 9 terdiri dari rekaman scene USGS/NASA individual (area di luar lintasan swath tampak transparan).',
    legend: {
      type: 'natural',
      leftLabel: 'Air (Biru Gelap)',
      middleLabel: 'Lahan / Kota (Krem)',
      rightLabel: 'Kanopi (Hijau)',
      gradientClass: 'ls9-sr-gradient',
      swatches: [
        { label: 'Air (Biru Gelap)', color: '#1e40af' },
        { label: 'Lahan / Kota (Krem/Abu-abu)', color: '#a8a29e' },
        { label: 'Kanopi Hutan (Hijau)', color: '#15803d' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) / USGS / NASA'
  }
];

export const PIKSEL_PRESETS: PikselPreset[] = [
  {
    id: 'bromo',
    name: 'Bromo Tengger Semeru',
    locationName: 'Medan Vulkanik & Tutupan Lahan',
    center: [112.9485, -7.9514],
    zoom: 12,
    pitch: 35,
    description: 'Kaldera Bromo, lautan pasir, dan morfologi vulkanik dengan GeoMAD True Color.',
    recommendedProduct: 's2-geomad-rgb'
  },
  {
    id: 'toba',
    name: 'Danau Toba & Samosir',
    locationName: 'Badan Air & Dataran Tinggi',
    center: [98.8052, 2.5819],
    zoom: 10.5,
    pitch: 20,
    description: 'Analisis badan air dan garis pantai kaldera Danau Toba menggunakan NDWI.',
    recommendedProduct: 's2-ndwi'
  },
  {
    id: 'ikn',
    name: 'IKN Nusantara',
    locationName: 'Pembangunan Kawasan & Kanopi',
    center: [116.7050, -0.9700],
    zoom: 11.5,
    pitch: 25,
    description: 'Pemantauan tutupan hutan tropis dan pembangunan infrastruktur baru dengan NDVI.',
    recommendedProduct: 's2-ndvi'
  },
  {
    id: 'citarum-floodplain',
    name: 'Karawang & Dataran Banjir Citarum',
    locationName: 'Dataran Banjir & Hidrologi',
    center: [107.2500, -6.2200],
    zoom: 10.5,
    description: 'Zonasi bahaya banjir hidrologis di sepanjang hilir DAS Citarum.',
    recommendedProduct: 'flood-hazard-rp02'
  },
  {
    id: 'gag-island',
    name: 'Pulau Gag (Raja Ampat)',
    locationName: 'Pulau Tropis & Pesisir',
    center: [129.8900, -0.4500],
    zoom: 12.5,
    description: 'Morfologi kepulauan tropis dan tutupan vegetasi pesisir dengan GeoMAD True Color.',
    recommendedProduct: 's2-geomad-rgb'
  },
  {
    id: 'merapi',
    name: 'Gunung Merapi',
    locationName: 'Kubah Lava & Koridor Lahar',
    center: [110.4463, -7.5407],
    zoom: 12,
    pitch: 30,
    description: 'Morfologi kubah lava aktif, jalur lahar, dan lereng vegetasi dengan False Color NIR.',
    recommendedProduct: 's2-geomad-nir'
  }
];
