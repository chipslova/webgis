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
  { id: 'geomad', name: 'Sentinel-2 GeoMAD', icon: '🎨', subtitle: 'Komposit Optik & Inframerah 10m Bebas Awan' },
  { id: 'indices', name: 'Spectral Indices', icon: '🔬', subtitle: 'Indeks Biofisik Klorofil, Air & Lahan' },
  { id: 'quality', name: 'Data Quality', icon: '📊', subtitle: 'Statistik Observasi Open Data Cube' },
  { id: 'landsat', name: 'Landsat 9', icon: '🛰️', subtitle: 'Reflektansi Permukaan USGS/NASA 30m' },
  { id: 'hazard', name: 'Flood Hazard', icon: '🌊', subtitle: 'Model Probabilitas Genangan Banjir Nasional' }
];

export const PIKSEL_WMS_BASE_URL = 'https://ows.staging.piksel.big.go.id/wms';
export const S2_YEARS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'];
export const LS9_YEARS = ['2025', '2024', '2023', '2022'];

export const PIKSEL_PRODUCTS: PikselProduct[] = [
  // 1. GeoMAD Group
  {
    id: 's2-geomad-rgb',
    name: 'Sentinel-2 GeoMAD (Warna Alami / RGB)',
    category: 'geomad',
    layer: 's2_geomad_annual_spectral',
    style: 'rgb',
    timeEnabled: true,
    availableYears: S2_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Komposit optik tahunan bebas awan 10m resolusi tinggi untuk seluruh daratan Indonesia.',
    whatItShows: 'Warna foto satelit alami (RGB): Hutan hijau alami, perkotaan abu-abu, dan perairan biru tanpa tutupan awan.',
    badge: 'Optik 10m (BIG)',
    color: '#10b981',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (GeoMAD Annual)',
    legend: {
      type: 'natural',
      leftLabel: 'Air / Laut',
      middleLabel: 'Lahan / Kota',
      rightLabel: 'Kanopi Hutan',
      gradientClass: 's2-geomad-gradient',
      swatches: [
        { label: 'Air (Biru)', color: '#1e40af', icon: '🌊' },
        { label: 'Lahan Terbuka (Krem)', color: '#d4b285', icon: '🏜️' },
        { label: 'Kanopi Hutan (Hijau)', color: '#15803d', icon: '🌲' },
        { label: 'Kota / Bangunan (Abu)', color: '#94a3b8', icon: '🏢' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel / Copernicus Sentinel-2'
  },
  {
    id: 's2-geomad-nir',
    name: 'Sentinel-2 GeoMAD False Color (NIR)',
    category: 'geomad',
    layer: 's2_geomad_annual_spectral',
    style: 'false_color_nir',
    timeEnabled: true,
    availableYears: S2_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Komposit band Inframerah Dekat (NIR-Red-Green) untuk menonjolkan kesehatan klorofil & biomassa.',
    whatItShows: 'Vegetasi tampak Merah Pekat / Magenta cerah karena pantulan kuat sel klorofil, air tampak hitam-kebiruan, perkotaan sian/abu.',
    badge: 'Inframerah 10m',
    color: '#ef4444',
    resolution: '10 meter',
    sensor: 'Sentinel-2 MSI (NIR False Color)',
    isComputeHeavy: true,
    legend: {
      type: 'continuous',
      leftLabel: 'Air / Lahan Basah',
      middleLabel: 'Bangunan / Kota',
      rightLabel: 'Kanopi Lebat (Klorofil)',
      gradientClass: 's2-nir-gradient',
      swatches: [
        { label: 'Air / Basah (Hitam/Biru)', color: '#020617', icon: '🌊' },
        { label: 'Kota / Bangunan (Sian/Abu)', color: '#64748b', icon: '🏢' },
        { label: 'Klorofil Lebat (Merah/Magenta)', color: '#f43f5e', icon: '🌺' }
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
    availableYears: S2_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Normalized Difference Vegetation Index resmi dari Open Data Cube BIG untuk memetakan biomassa & kanopi.',
    whatItShows: 'Tingkat kerapatan klorofil hijau: Warna Hijau Tua menunjukkan hutan hujan lebat/primer, kuning semak/tanah, cokelat non-vegetasi.',
    badge: 'Indeks Biofisik',
    color: '#059669',
    resolution: '10 meter',
    sensor: 'Sentinel-2 GeoMAD Indices',
    isComputeHeavy: true,
    legend: {
      type: 'continuous',
      leftLabel: 'Air / Non-Veg (-1.0 s.d 0.0)',
      middleLabel: 'Jarang (0.2 s.d 0.4)',
      rightLabel: 'Hutan Lebat (0.7 s.d +1.0)',
      gradientClass: 'ndvi-gradient',
      rangeText: 'Skala Rentang Indeks: -1.0 s.d +1.0',
      swatches: [
        { label: 'Air / Non-Veg (-1.0)', color: '#0284c7', icon: '💧' },
        { label: 'Vegetasi Jarang (+0.3)', color: '#fde047', icon: '🌾' },
        { label: 'Hutan Lebat (+0.8)', color: '#15803d', icon: '🌲' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },
  {
    id: 's2-ndwi',
    name: 'Indeks Kebasahan & Badan Air (NDWI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'ndwi',
    timeEnabled: true,
    availableYears: S2_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Normalized Difference Water Index untuk memisahkan perairan terbuka, danau, sungai, dan lahan basah dari daratan.',
    whatItShows: 'Pantulan spektral air: Biru tua menunjukkan badan air dalam/jernih, biru muda lahan basah/rawa, warna hangat tanah kering.',
    badge: 'Indeks Hidrologi',
    color: '#0284c7',
    resolution: '10 meter',
    sensor: 'Sentinel-2 GeoMAD Indices',
    legend: {
      type: 'continuous',
      leftLabel: 'Daratan Kering (-1.0 s.d -0.2)',
      middleLabel: 'Lembap (0.0)',
      rightLabel: 'Badan Air Terbuka (+0.3 s.d +1.0)',
      gradientClass: 'ndwi-gradient',
      rangeText: 'Skala Rentang Indeks: -1.0 s.d +1.0',
      swatches: [
        { label: 'Daratan Kering (-0.5)', color: '#b45309', icon: '🏜️' },
        { label: 'Lahan Lembap (0.0)', color: '#67e8f9', icon: '🌾' },
        { label: 'Badan Air Terbuka (+0.7)', color: '#1e3a8a', icon: '🌊' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },
  {
    id: 's2-bsi',
    name: 'Bare Soil Index (BSI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'bsi',
    timeEnabled: true,
    availableYears: S2_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Kombinasi spektral Blue-Red-NIR-SWIR untuk mendeteksi tanah terbuka, pembukaan lahan, tambang, dan proyek konstruksi berskala besar.',
    whatItShows: 'Tingkat keterbukaan tanah: nilai tinggi menunjukkan lahan gundul atau tambang aktif, nilai rendah menunjukkan kanopi atau badan air.',
    badge: 'Tidak Tersedia',
    color: '#64748b',
    resolution: '10 meter',
    sensor: 'Sentinel-2 GeoMAD Indices',
    isDisabled: true,
    statusNotice: 'Tidak tersedia — upstream OGC server mengembalikan HTTP 500. Produk belum dipublikasikan pada layanan staging.',
    legend: {
      type: 'continuous',
      leftLabel: 'Tertutup Vegetasi / Air',
      middleLabel: 'Sedang / Campuran',
      rightLabel: 'Tanah Terbuka / Tambang',
      gradientClass: 'bsi-gradient',
      swatches: [
        { label: 'Vegetasi Rapat (Hijau)', color: '#064e3b', icon: '🌲' },
        { label: 'Lahan Campuran (Kuning)', color: '#fde047', icon: '🌾' },
        { label: 'Tanah Terbuka / Tambang (Merah)', color: '#dc2626', icon: '⛏️' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },

  // 3. Hazard Group
  {
    id: 'flood-hazard-rp02',
    name: 'Bahaya Banjir Nasional (Periode Ulang 2 Tahun)',
    category: 'hazard',
    layer: 'flood_hazard_rp02',
    style: 'hazard_class',
    timeEnabled: false,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Peta zonasi bahaya banjir probabilitas 50% tahunan dari pemodelan hidrologi spasial BIG.',
    whatItShows: 'Zonasi bahaya genangan banjir siklus 2 tahunan berdasarkan pemodelan hidrologi spasial Ina-Geoportal.',
    badge: 'Banjir RP 2-Thn',
    color: '#3b82f6',
    resolution: '10-30 meter',
    sensor: 'BIG Spatial Hydrological Model',
    legend: {
      type: 'categorical',
      items: [
        { label: 'Kelas Rendah', color: '#fef08a', icon: '🟡' },
        { label: 'Kelas Sedang', color: '#f97316', icon: '🟠' },
        { label: 'Kelas Tinggi', color: '#dc2626', icon: '🔴' }
      ],
      swatches: [
        { label: 'Kelas Rendah', color: '#fef08a', icon: '🟡' },
        { label: 'Kelas Sedang', color: '#f97316', icon: '🟠' },
        { label: 'Kelas Tinggi', color: '#dc2626', icon: '🔴' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Ina-Geoportal / Piksel'
  },
  {
    id: 'flood-hazard-rp10',
    name: 'Bahaya Banjir Nasional (Periode Ulang 10 Tahun)',
    category: 'hazard',
    layer: 'flood_hazard_rp10',
    style: 'hazard_class',
    timeEnabled: false,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Peta zonasi bahaya banjir probabilitas 10% tahunan untuk analisis kebencanaan dan perencanaan spasial.',
    whatItShows: 'Zonasi bahaya genangan banjir siklus 10 tahunan pada dataran aluvial dan kawasan pesisir.',
    badge: 'Banjir RP 10-Thn',
    color: '#8b5cf6',
    resolution: '10-30 meter',
    sensor: 'BIG Spatial Hydrological Model',
    legend: {
      type: 'categorical',
      items: [
        { label: 'Kelas Rendah', color: '#fef08a', icon: '🟡' },
        { label: 'Kelas Sedang', color: '#f97316', icon: '🟠' },
        { label: 'Kelas Tinggi', color: '#dc2626', icon: '🔴' }
      ],
      swatches: [
        { label: 'Kelas Rendah', color: '#fef08a', icon: '🟡' },
        { label: 'Kelas Sedang', color: '#f97316', icon: '🟠' },
        { label: 'Kelas Tinggi', color: '#dc2626', icon: '🔴' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Ina-Geoportal / Piksel'
  },

  // 4. Quality & Statistics Group
  {
    id: 's2-count',
    name: 'Sentinel-2 GeoMAD — Observation Density (Scene Count)',
    category: 'quality',
    layer: 's2_geomad_annual_statistics',
    style: 'count',
    timeEnabled: true,
    availableYears: S2_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Jumlah akuisisi citra Sentinel-2 bebas awan yang menyusun setiap pixel komposit GeoMAD tahunan.',
    whatItShows: 'Statistik observasi: Menampilkan total scene bebas awan yang digunakan dalam estimasi GeoMAD tahunan.',
    badge: 'Data Quality',
    color: '#6366f1',
    resolution: '10 meter',
    sensor: 'Open Data Cube Quality Mask',
    legend: {
      type: 'continuous',
      leftLabel: 'Rendah (< 5 Scene)',
      middleLabel: 'Sedang (~15 Scene)',
      rightLabel: 'Tinggi (> 30 Scene)',
      gradientClass: 'count-gradient',
      rangeText: 'Jumlah Scene Bebas Awan per Pixel',
      swatches: [
        { label: 'Observasi Rendah (<5)', color: '#4c1d95', icon: '🟣' },
        { label: 'Observasi Sedang (~15)', color: '#06b6d4', icon: '🔵' },
        { label: 'Observasi Tinggi (>30)', color: '#facc15', icon: '🟡' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },

  // 5. Landsat Group
  {
    id: 'ls9-sr',
    name: 'Landsat 9 OLI-2 Surface Reflectance',
    category: 'landsat',
    layer: 'ls9_c2l2_sr',
    style: 'simple_rgb',
    timeEnabled: true,
    availableYears: LS9_YEARS,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Citra reflektansi permukaan optik multispektral 30m dari satelit USGS/NASA Landsat 9 di Data Cube BIG.',
    whatItShows: 'Reflektansi permukaan tajam: Sangat baik untuk perbandingan tren historis jangka panjang dengan Landsat 5/7/8.',
    badge: 'Multispektral 30m',
    color: '#ec4899',
    resolution: '30 meter',
    sensor: 'Landsat 9 OLI-2 (Collection 2 Level-2)',
    isComputeHeavy: true,
    statusNotice: 'ℹ️ Catatan: Landsat 9 merupakan koleksi scene individual USGS/NASA (area non-lintasan satelit tampak transparan).',
    legend: {
      type: 'natural',
      leftLabel: 'Air (Biru Tua)',
      middleLabel: 'Lahan / Kota (Krem)',
      rightLabel: 'Kanopi (Hijau)',
      gradientClass: 'ls9-sr-gradient',
      swatches: [
        { label: 'Air (Biru Tua)', color: '#1e3a8a', icon: '🌊' },
        { label: 'Lahan / Kota (Krem/Abu)', color: '#a8a29e', icon: '🏜️' },
        { label: 'Kanopi Hutan (Hijau)', color: '#15803d', icon: '🌲' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) / USGS / NASA'
  }
];

export const PIKSEL_PRESETS: PikselPreset[] = [
  {
    id: 'bromo',
    name: 'Bromo Tengger Semeru',
    locationName: 'Jawa Timur',
    center: [112.9485, -7.9514],
    zoom: 12,
    pitch: 35,
    description: 'Kaldera lautan pasir Bromo dan morfologi lereng vulkanik dengan GeoMAD True Color.',
    recommendedProduct: 's2-geomad-rgb'
  },
  {
    id: 'toba',
    name: 'Danau Toba & Samosir',
    locationName: 'Sumatera Utara',
    center: [98.8052, 2.5819],
    zoom: 10.5,
    pitch: 20,
    description: 'Analisis perairan danau vulkanik dan garis sempadan Danau Toba dengan NDWI.',
    recommendedProduct: 's2-ndwi'
  },
  {
    id: 'ikn',
    name: 'IKN Nusantara',
    locationName: 'Kalimantan Timur',
    center: [116.7050, -0.9700],
    zoom: 11.5,
    pitch: 25,
    description: 'Pemantauan tutupan kanopi hutan tropis dan pembangunan infrastruktur dengan NDVI.',
    recommendedProduct: 's2-ndvi'
  },
  {
    id: 'citarum-floodplain',
    name: 'Dataran Banjir Karawang & Citarum',
    locationName: 'Jawa Barat',
    center: [107.2500, -6.2200],
    zoom: 10.5,
    description: 'Pemodelan zonasi bahaya banjir hidrologi spasial BIG di dataran banjir DAS Citarum hilir.',
    recommendedProduct: 'flood-hazard-rp02'
  },
  {
    id: 'gag-island',
    name: 'Pulau Gag (Raja Ampat)',
    locationName: 'Papua Barat Daya',
    center: [129.8900, -0.4500],
    zoom: 12.5,
    description: 'Analisis morfologi dan tutupan pulau tropis dengan GeoMAD True Color.',
    recommendedProduct: 's2-geomad-rgb'
  },
  {
    id: 'merapi',
    name: 'Gunung Merapi',
    locationName: 'D.I. Yogyakarta',
    center: [110.4463, -7.5407],
    zoom: 12,
    pitch: 30,
    description: 'Morfologi kubah lava aktif, alur lahar, dan kanopi lereng Merapi dengan False Color NIR.',
    recommendedProduct: 's2-geomad-nir'
  }
];
