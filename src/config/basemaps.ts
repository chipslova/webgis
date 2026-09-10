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
  // --- 1. RECOMMENDED / PILIHAN UTAMA ---
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    format: 'raster',
    category: 'Esri',
    group: 'recommended',
    description: 'Citra satelit global resolusi tinggi resmi ArcGIS World Imagery',
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
    description: 'Peta jalan global Esri dengan detail jaringan transportasi dan landmark kota',
    styleUrl: '/basemap/styles/esri-style-streets.json',
    previewColor: '#3b82f6'
  },
  {
    id: 'big-rbi',
    name: 'Rupabumi Indonesia (RBI)',
    format: 'raster',
    category: 'National',
    group: 'recommended',
    description: 'Peta dasar topografi nasional resmi Badan Informasi Geospasial (BIG)',
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
    description: 'Peta jalan dan tutupan lahan global komunitas OpenStreetMap',
    styleUrl: '/basemap/styles/esri-style-open-basemap.json',
    previewColor: '#d97706'
  },

  // --- 2. TOPOGRAFI, OCEAN & RELIEF ---
  {
    id: 'esri-topographic',
    name: 'Esri World Topographic',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    description: 'Peta topografi dunia Esri dengan kontur elevasi dan bentang alam fisik',
    styleUrl: '/basemap/styles/esri-style-topographic.json',
    previewColor: '#688e57'
  },
  {
    id: 'open-topo',
    name: 'OpenTopoMap',
    format: 'raster',
    category: 'OpenData',
    group: 'thematic',
    maxZoom: 17,
    zoomWarning: 'Maksimal Zoom Level 17 (Kontur SRTM)',
    description: 'Peta topografi berbasis OpenStreetMap dan garis kontur elevasi SRTM',
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
    zoomWarning: 'Maksimal Zoom Level 13 (Model Relief)',
    description: 'Model permukaan medan bumi dengan bayangan relief elevasi dan pegunungan',
    styleUrl: '/basemap/styles/esri-style-relief.json',
    previewColor: '#78716c'
  },
  {
    id: 'esri-natgeo',
    name: 'Esri National Geographic',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    maxZoom: 16,
    description: 'Gaya kartografi khas National Geographic dengan shading relief pegunungan',
    styleUrl: '/basemap/styles/esri-style-natgeo.json',
    previewColor: '#84cc16'
  },
  {
    id: 'esri-ocean',
    name: 'Esri Ocean Basemap',
    format: 'raster',
    category: 'Esri',
    group: 'thematic',
    maxZoom: 13,
    zoomWarning: 'Maksimal Zoom Level 13 (Batimetri Lautan & Kedalaman)',
    description: 'Peta batimetri lautan Esri/NOAA dengan data kedalaman palung dan dasar laut',
    styleUrl: '/basemap/styles/esri-style-ocean.json',
    previewColor: '#0284c7'
  },

  // --- 3. MINIMALIS & CANVAS ---
  {
    id: 'esri-light-grey',
    name: 'Esri Light Gray Canvas',
    format: 'raster',
    category: 'Esri',
    group: 'canvas',
    maxZoom: 16,
    description: 'Kanvas abu-abu terang minimalis untuk visualisasi layer tematik',
    styleUrl: '/basemap/styles/esri-style-light-grey-canvas.json',
    previewColor: '#e2e8f0'
  },
  {
    id: 'esri-dark-grey',
    name: 'Esri Dark Gray Canvas',
    format: 'raster',
    category: 'Esri',
    group: 'canvas',
    maxZoom: 16,
    description: 'Kanvas gelap minimalis kontras tinggi untuk data analitis spasial',
    styleUrl: '/basemap/styles/esri-style-cleanmap.json',
    previewColor: '#1e293b'
  },
  {
    id: 'openfreemap-liberty',
    name: 'OpenFreeMap Liberty',
    format: 'vector',
    category: 'OpenData',
    group: 'canvas',
    description: 'Peta jalan vektor global modern kaya detail OpenFreeMap (Bebas Watermark & API Key)',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    previewColor: '#0284c7'
  },
  {
    id: 'openfreemap-positron',
    name: 'OpenFreeMap Positron',
    format: 'vector',
    category: 'OpenData',
    group: 'canvas',
    description: 'Kanvas vektor minimalis terang berbasis OpenFreeMap (Bebas Watermark & API Key)',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    previewColor: '#334155'
  },
  {
    id: 'esri-clarity',
    name: 'Esri Imagery Clarity',
    format: 'raster',
    category: 'Esri',
    group: 'canvas',
    description: 'Arsip citra satelit tanpa awan beresolusi tinggi untuk kejelasan objek daratan',
    styleUrl: '/basemap/styles/esri-style-imagery-clarity.json',
    previewColor: '#1e3a8a'
  },
  {
    id: 'osm-humanitarian',
    name: 'OpenStreetMap Humanitarian',
    format: 'raster',
    category: 'OpenData',
    group: 'canvas',
    description: 'Gaya visual kemanusiaan OpenStreetMap dengan penekanan pada sungai dan jalan',
    styleUrl: '/basemap/styles/osm-style-humanitarian.json',
    previewColor: '#e11d48'
  },
  {
    id: 'esri-colorpencil',
    name: 'Esri Colored Pencil',
    format: 'vector',
    category: 'Esri',
    group: 'canvas',
    description: 'Gaya artistik vektor pensil warna unik dengan tipografi sketsa tangan',
    styleUrl: '/basemap/styles/esri-style-colorpencil.json',
    previewColor: '#e0a96d'
  }
];

export const DEFAULT_BASEMAP_ID = 'esri-imagery';
