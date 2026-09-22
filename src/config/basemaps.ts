export interface BasemapConfig {
  id: string;
  name: string;
  format: 'vector' | 'raster';
  category: 'Esri' | 'National' | 'OpenData' | 'Carto';
  group?: 'recommended' | 'thematic' | 'canvas';
  description: string;
  styleUrl: string;
  previewColor: string;
  maxZoom?: number;
  zoomWarning?: string;
  initialBounds?: {
    center: [number, number];
    zoom: number;
  };
}

export const BASEMAPS: BasemapConfig[] = [
  // --- 1. RECOMMENDED / 6 PRIMARY BASEMAPS ---
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    format: 'raster',
    category: 'Esri',
    group: 'recommended',
    description: 'Mosaik citra satelit global resolusi tinggi ArcGIS World Imagery resmi',
    styleUrl: '/basemap/styles/esri-style-community.json',
    previewColor: '#1e293b',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 4.5
    }
  },
  {
    id: 'esri-streets',
    name: 'Esri World Streets',
    format: 'raster',
    category: 'Esri',
    group: 'recommended',
    description: 'Peta jalan global Esri dengan jaringan transportasi rinci dan landmark perkotaan',
    styleUrl: '/basemap/styles/esri-style-streets.json',
    previewColor: '#3b82f6'
  },
  {
    id: 'big-rbi',
    name: 'Rupabumi Indonesia (RBI)',
    format: 'raster',
    category: 'National',
    group: 'recommended',
    description: 'Peta dasar topografi nasional resmi dari Badan Informasi Geospasial (BIG)',
    styleUrl: '/basemap/styles/big-style-rbi.json',
    previewColor: '#4fa8d8',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 5
    }
  },
  {
    id: 'osm-standard',
    name: 'OpenStreetMap Standard',
    format: 'raster',
    category: 'OpenData',
    group: 'recommended',
    description: 'Peta jalan global, tapak bangunan, dan tutupan lahan dari komunitas OpenStreetMap',
    styleUrl: '/basemap/styles/esri-style-open-basemap.json',
    previewColor: '#d97706'
  },
  {
    id: 'esri-topographic',
    name: 'Esri World Topographic',
    format: 'raster',
    category: 'Esri',
    group: 'recommended',
    description: 'Peta topografi dunia Esri dengan kontur elevasi dan bentang alam fisik',
    styleUrl: '/basemap/styles/esri-style-topographic.json',
    previewColor: '#688e57'
  },
  {
    id: 'esri-dark-grey',
    name: 'Esri Dark Gray Canvas',
    format: 'raster',
    category: 'Esri',
    group: 'recommended',
    maxZoom: 16,
    description: 'Kanvas abu-abu gelap kontras tinggi untuk visualisasi overlay geospasial tajam',
    styleUrl: '/basemap/styles/esri-style-cleanmap.json',
    previewColor: '#1e293b'
  },

  // --- 2. TOPOGRAPHY, OCEAN & RELIEF ---
  {
    id: 'open-topo',
    name: 'OpenTopoMap',
    format: 'raster',
    category: 'OpenData',
    group: 'thematic',
    maxZoom: 17,
    zoomWarning: 'Tingkat Zoom Maksimum 17 (Kontur SRTM)',
    description: 'Peta topografi berbasis data OpenStreetMap dan garis kontur elevasi SRTM',
    styleUrl: '/basemap/styles/esri-style-open-topographic.json',
    previewColor: '#15803d'
  },
  {
    id: 'esri-relief',
    name: 'Esri World Shaded Relief',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    maxZoom: 13,
    zoomWarning: 'Tingkat Zoom Maksimum 13 (Relief Bayangan)',
    description: 'Model permukaan medan dengan relief bayangan bukit dan elevasi pegunungan',
    styleUrl: '/basemap/styles/esri-style-relief.json',
    previewColor: '#78716c'
  },
  {
    id: 'esri-natgeo',
    name: 'Esri National Geographic',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    maxZoom: 11,
    zoomWarning: 'Tingkat Zoom Maksimum 11 (Kartografi NatGeo)',
    description: 'Gaya kartografi khas National Geographic dengan relief bayangan pegunungan',
    styleUrl: '/basemap/styles/esri-style-natgeo.json',
    previewColor: '#84cc16'
  },
  {
    id: 'esri-ocean',
    name: 'Esri Ocean Basemap',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    maxZoom: 9,
    zoomWarning: 'Tingkat Zoom Maksimum 9 (Batimetri Kedalaman Laut)',
    description: 'Peta batimetri kelautan Esri/NOAA dengan kedalaman palung dan morfologi dasar laut',
    styleUrl: '/basemap/styles/esri-style-ocean.json',
    previewColor: '#0284c7'
  },
  {
    id: 'esri-light-grey',
    name: 'Esri Light Gray Canvas',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    maxZoom: 16,
    description: 'Kanvas abu-abu terang minimalis untuk visualisasi lapisan data tematik berbobot',
    styleUrl: '/basemap/styles/esri-style-light-grey-canvas.json',
    previewColor: '#e2e8f0'
  },
  {
    id: 'openfreemap-liberty',
    name: 'OpenFreeMap Liberty',
    format: 'vector',
    category: 'OpenData',
    group: 'canvas',
    description: 'Peta vektor jalan OpenFreeMap modern berdetail tinggi (bebas watermark & tanpa API key)',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    previewColor: '#0284c7'
  },
  {
    id: 'openfreemap-positron',
    name: 'OpenFreeMap Positron',
    format: 'vector',
    category: 'OpenData',
    group: 'canvas',
    description: 'Kanvas vektor OpenFreeMap minimalis terang (bebas watermark & tanpa API key)',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    previewColor: '#334155'
  },
  {
    id: 'esri-clarity',
    name: 'Esri Imagery Clarity',
    format: 'raster',
    category: 'Esri',
    group: 'canvas',
    description: 'Arsip citra satelit resolusi tinggi bebas awan untuk tampilan medan jernih',
    styleUrl: '/basemap/styles/esri-style-imagery-clarity.json',
    previewColor: '#1e3a8a'
  },
  {
    id: 'osm-humanitarian',
    name: 'OpenStreetMap Humanitarian',
    format: 'raster',
    category: 'OpenData',
    group: 'canvas',
    description: 'Gaya peta OpenStreetMap Humanitarian dengan penekanan pada fitur air dan jaringan jalan',
    styleUrl: '/basemap/styles/osm-style-humanitarian.json',
    previewColor: '#e11d48'
  },
  {
    id: 'esri-colorpencil',
    name: 'Esri Colored Pencil',
    format: 'vector',
    category: 'Esri',
    group: 'canvas',
    description: 'Gaya peta vektor artistik pensil warna dengan estetika tipografi gambar tangan',
    styleUrl: '/basemap/styles/esri-style-colorpencil.json',
    previewColor: '#e0a96d'
  }
];

export const DEFAULT_BASEMAP_ID = 'esri-imagery';
