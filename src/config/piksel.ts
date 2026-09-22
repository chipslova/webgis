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
  { id: 'geomad', name: 'Sentinel-2 GeoMAD', icon: '', subtitle: 'Cloud-Free 10m Optical & Infrared Composites' },
  { id: 'indices', name: 'Spectral Indices', icon: '', subtitle: 'Vegetation Density & Surface Water Indices' },
  { id: 'landsat', name: 'Landsat 9', icon: '', subtitle: 'USGS/NASA 30m Surface Reflectance Observations' },
  { id: 'hazard', name: 'Flood Hazard', icon: '', subtitle: 'Priority Study Area Hydrological Modeling' },
  { id: 'quality', name: 'Data Quality', icon: '', subtitle: 'Cloud-Free Observation Statistics' }
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
    description: 'High-resolution 10m annual cloud-free optical composite across Indonesian territory.',
    whatItShows: 'Natural satellite color photography (RGB): Green rainforest canopies, gray urban built-up areas, and blue water bodies without cloud occlusion.',
    badge: 'Optical 10m (BIG)',
    color: '#10b981',
    resolution: '10 meters',
    sensor: 'Sentinel-2 MSI (GeoMAD Annual)',
    legend: {
      type: 'natural',
      leftLabel: 'Water / Ocean',
      middleLabel: 'Land / Urban',
      rightLabel: 'Forest Canopy',
      gradientClass: 's2-geomad-gradient',
      swatches: [
        { label: 'Water (Blue)', color: '#1e40af' },
        { label: 'Open Land (Beige)', color: '#d4b285' },
        { label: 'Forest Canopy (Green)', color: '#15803d' },
        { label: 'Built-up / Urban (Gray)', color: '#94a3b8' }
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
    description: 'Near-Infrared band composite (NIR-Red-Green) highlighting chlorophyll vitality and vegetation biomass.',
    whatItShows: 'Healthy vegetation appears in bright Red/Magenta due to strong cellular chlorophyll reflectance; water appears dark blue/black; urban areas appear cyan/gray.',
    badge: 'Infrared 10m',
    color: '#ef4444',
    resolution: '10 meters',
    sensor: 'Sentinel-2 MSI (NIR False Color)',
    isComputeHeavy: true,
    legend: {
      type: 'continuous',
      leftLabel: 'Water / Wetland',
      middleLabel: 'Built-up / Urban',
      rightLabel: 'Dense Canopy (Chlorophyll)',
      gradientClass: 's2-nir-gradient',
      swatches: [
        { label: 'Water / Wetland (Dark/Blue)', color: '#020617' },
        { label: 'Built-up / Urban (Cyan/Gray)', color: '#64748b' },
        { label: 'Dense Chlorophyll (Red/Magenta)', color: '#f43f5e' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel / Copernicus Sentinel-2'
  },

  // 2. Spectral Indices Group
  {
    id: 's2-ndvi',
    name: 'Vegetation Density Index (NDVI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'ndvi',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Normalized Difference Vegetation Index from BIG Open Data Cube to map biomass density and forest canopy.',
    whatItShows: 'Chlorophyll vitality gradient: Dark Green indicates dense/primary tropical forest, yellow indicates sparse shrub/cropland, brown indicates non-vegetated terrain.',
    badge: 'Biophysical Index',
    color: '#059669',
    resolution: '10 meters',
    sensor: 'Sentinel-2 GeoMAD Indices',
    isComputeHeavy: true,
    legend: {
      type: 'continuous',
      leftLabel: 'Water / Non-Veg (-1.0 to 0.0)',
      middleLabel: 'Sparse (0.2 to 0.4)',
      rightLabel: 'Dense Forest (0.7 to +1.0)',
      gradientClass: 'ndvi-gradient',
      rangeText: 'Index Scale: -1.0 to +1.0',
      swatches: [
        { label: 'Water / Non-Veg (-1.0)', color: '#0284c7' },
        { label: 'Sparse Vegetation (+0.3)', color: '#fde047' },
        { label: 'Dense Forest (+0.8)', color: '#15803d' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },
  {
    id: 's2-ndwi',
    name: 'Water & Moisture Index (NDWI)',
    category: 'indices',
    layer: 's2_geomad_annual_indices',
    style: 'ndwi',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Normalized Difference Water Index to delineate open water bodies, lakes, rivers, and wetlands from land.',
    whatItShows: 'Water spectral reflectance: Deep blue indicates open water bodies, light blue indicates wetlands/marshes, warm tones indicate dry land.',
    badge: 'Hydrology Index',
    color: '#0284c7',
    resolution: '10 meters',
    sensor: 'Sentinel-2 GeoMAD Indices',
    legend: {
      type: 'continuous',
      leftLabel: 'Dry Land (-1.0 to -0.2)',
      middleLabel: 'Moist (0.0)',
      rightLabel: 'Open Water (+0.3 to +1.0)',
      gradientClass: 'ndwi-gradient',
      rangeText: 'Index Scale: -1.0 to +1.0',
      swatches: [
        { label: 'Dry Land (-0.5)', color: '#b45309' },
        { label: 'Moist Wetland (0.0)', color: '#67e8f9' },
        { label: 'Open Water (+0.7)', color: '#1e3a8a' }
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
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Spectral combination of Blue-Red-NIR-SWIR to identify bare ground, land clearing, mining, and construction sites.',
    whatItShows: 'Bare soil exposure: High values indicate cleared land or active mines, low values indicate canopy or water.',
    badge: 'Unavailable',
    color: '#64748b',
    resolution: '10 meters',
    sensor: 'Sentinel-2 GeoMAD Indices',
    isDisabled: true,
    statusNotice: 'Currently unavailable — upstream OGC server returns HTTP 500. Product not yet active on staging service.',
    legend: {
      type: 'continuous',
      leftLabel: 'Vegetation / Water',
      middleLabel: 'Mixed / Moderate',
      rightLabel: 'Bare Soil / Mine',
      gradientClass: 'bsi-gradient',
      swatches: [
        { label: 'Dense Canopy (Green)', color: '#064e3b' },
        { label: 'Mixed Land (Yellow)', color: '#fde047' },
        { label: 'Bare Soil / Mining (Red)', color: '#dc2626' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },

  // 3. Hazard Group
  {
    id: 'flood-hazard-rp02',
    name: 'Flood Hazard Model (2-Year RP)',
    category: 'hazard',
    layer: 'flood_hazard_rp02',
    style: 'hazard_class',
    timeEnabled: false,
    timeMode: 'none',
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Annual 50% probability flood hazard zoning from BIG spatial hydrological modeling for priority study areas.',
    whatItShows: '2-year return period flood inundation hazard zones across alluvial floodplains within validated study areas.',
    badge: 'Flood RP 2-Yr',
    color: '#3b82f6',
    resolution: '10-30 meters',
    sensor: 'BIG Spatial Hydrological Model',
    legend: {
      type: 'categorical',
      items: [
        { label: 'Low Hazard', color: '#fef08a' },
        { label: 'Moderate Hazard', color: '#f97316' },
        { label: 'High Hazard', color: '#dc2626' }
      ],
      swatches: [
        { label: 'Low Hazard', color: '#fef08a' },
        { label: 'Moderate Hazard', color: '#f97316' },
        { label: 'High Hazard', color: '#dc2626' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Ina-Geoportal / Piksel'
  },
  {
    id: 'flood-hazard-rp10',
    name: 'Flood Hazard Model (10-Year RP)',
    category: 'hazard',
    layer: 'flood_hazard_rp10',
    style: 'hazard_class',
    timeEnabled: false,
    timeMode: 'none',
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Annual 10% probability flood hazard zoning for disaster risk management in priority study areas.',
    whatItShows: '10-year return period flood inundation hazard zones across floodplains and coastal plains within validated study areas.',
    badge: 'Flood RP 10-Yr',
    color: '#8b5cf6',
    resolution: '10-30 meters',
    sensor: 'BIG Spatial Hydrological Model',
    legend: {
      type: 'categorical',
      items: [
        { label: 'Low Hazard', color: '#fef08a' },
        { label: 'Moderate Hazard', color: '#f97316' },
        { label: 'High Hazard', color: '#dc2626' }
      ],
      swatches: [
        { label: 'Low Hazard', color: '#fef08a' },
        { label: 'Moderate Hazard', color: '#f97316' },
        { label: 'High Hazard', color: '#dc2626' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Ina-Geoportal / Piksel'
  },

  // 4. Quality & Statistics Group
  {
    id: 's2-count',
    name: 'Cloud-Free Observation Count (Scene Count)',
    category: 'quality',
    layer: 's2_geomad_annual_statistics',
    style: 'count',
    timeEnabled: true,
    timeMode: 'annual',
    availableYears: S2_YEARS,
    minZoom: 8,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Number of clear-sky Sentinel-2 acquisitions contributing to each pixel in the annual GeoMAD composite.',
    whatItShows: 'Observation statistics: Total number of cloud-free scenes contributing to annual GeoMAD pixel estimates.',
    badge: 'Data Quality',
    color: '#6366f1',
    resolution: '10 meters',
    sensor: 'Open Data Cube Quality Mask',
    legend: {
      type: 'continuous',
      leftLabel: 'Low (< 5 Scenes)',
      middleLabel: 'Moderate (~15 Scenes)',
      rightLabel: 'High (> 30 Scenes)',
      gradientClass: 'count-gradient',
      rangeText: 'Cloud-Free Scenes Count per Pixel',
      swatches: [
        { label: 'Low Observations (<5)', color: '#4c1d95' },
        { label: 'Moderate Observations (~15)', color: '#06b6d4' },
        { label: 'High Observations (>30)', color: '#facc15' }
      ]
    },
    attribution: '© Badan Informasi Geospasial (BIG) — Piksel'
  },

  // 5. Landsat Group
  {
    id: 'ls9-sr',
    name: 'Landsat 9 Surface Reflectance (30m)',
    category: 'landsat',
    layer: 'ls9_c2l2_sr',
    style: 'simple_rgb',
    timeEnabled: true,
    timeMode: 'year-range',
    availableYears: LS9_YEARS,
    minZoom: 7,
    serviceUrl: PIKSEL_WMS_BASE_URL,
    description: 'Multispectral 30m optical surface reflectance from USGS/NASA Landsat 9 in BIG Data Cube.',
    whatItShows: 'Calibrated surface reflectance: Excellent for multi-decadal historical comparison with Landsat 5/7/8 archives.',
    badge: 'Multispectral 30m',
    color: '#ec4899',
    resolution: '30 meters',
    sensor: 'Landsat 9 OLI-2 (Collection 2 Level-2)',
    isComputeHeavy: true,
    statusNotice: 'Note: Landsat 9 consists of individual USGS/NASA scenes (areas outside swath pass appear transparent).',
    legend: {
      type: 'natural',
      leftLabel: 'Water (Dark Blue)',
      middleLabel: 'Land / Urban (Beige)',
      rightLabel: 'Canopy (Green)',
      gradientClass: 'ls9-sr-gradient',
      swatches: [
        { label: 'Water (Dark Blue)', color: '#1e40af' },
        { label: 'Land / Urban (Beige/Gray)', color: '#a8a29e' },
        { label: 'Forest Canopy (Green)', color: '#15803d' }
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
