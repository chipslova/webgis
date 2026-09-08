export interface BasemapConfig {
  id: string;
  name: string;
  category: 'Esri' | 'National' | 'OpenData' | 'Carto';
  group?: 'recommended' | 'thematic' | 'canvas';
  description: string;
  styleUrl: string;
  previewColor: string;
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
    category: 'Esri',
    group: 'recommended',
    description: 'Esri high-resolution global satellite & aerial imagery (Official ArcGIS Rest Tile Service)',
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
    category: 'Esri',
    group: 'recommended',
    description: 'Detailed Esri global street map with road networks and city landmarks',
    styleUrl: '/basemap/styles/esri-style-streets.json',
    previewColor: '#3b82f6'
  },
  {
    id: 'big-rbi',
    name: 'Rupabumi Indonesia (RBI)',
    category: 'National',
    group: 'recommended',
    description: 'Official National Topographic Basemap from BIG (Badan Informasi Geospasial)',
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
    category: 'OpenData',
    group: 'recommended',
    description: 'Global community-driven OpenStreetMap street data and land cover',
    styleUrl: '/basemap/styles/esri-style-open-basemap.json',
    previewColor: '#d97706'
  },

  // --- 2. TOPOGRAFI, OCEAN & RELIEF ---
  {
    id: 'esri-topographic',
    name: 'Esri World Topographic',
    category: 'Esri',
    group: 'thematic',
    description: 'Official Esri world topographic map with contours and physical landforms',
    styleUrl: '/basemap/styles/esri-style-topographic.json',
    previewColor: '#688e57'
  },
  {
    id: 'open-topo',
    name: 'OpenTopoMap',
    category: 'OpenData',
    group: 'thematic',
    description: 'Topographic map derived from OpenStreetMap and SRTM elevation contours',
    styleUrl: '/basemap/styles/esri-style-open-topographic.json',
    previewColor: '#15803d'
  },
  {
    id: 'esri-relief',
    name: 'Esri World Shaded Relief',
    category: 'Esri',
    group: 'thematic',
    description: 'Esri terrain surface model with shaded elevation relief and mountain contours',
    styleUrl: '/basemap/styles/esri-style-relief.json',
    previewColor: '#78716c'
  },
  {
    id: 'esri-natgeo',
    name: 'Esri National Geographic',
    category: 'Esri',
    group: 'thematic',
    description: 'Distinctive National Geographic world cartographic styling and shaded relief',
    styleUrl: '/basemap/styles/esri-style-natgeo.json',
    previewColor: '#84cc16'
  },
  {
    id: 'esri-ocean',
    name: 'Esri Ocean Basemap',
    category: 'Esri',
    group: 'thematic',
    description: 'Esri marine and ocean bathymetry basemap detailing seafloor features and depths',
    styleUrl: '/basemap/styles/esri-style-ocean.json',
    previewColor: '#0284c7'
  },

  // --- 3. MINIMALIS & CANVAS ---
  {
    id: 'esri-light-grey',
    name: 'Esri Light Gray Canvas',
    category: 'Esri',
    group: 'canvas',
    description: 'Official Esri minimalist neutral backdrop with labels for thematic spatial analysis',
    styleUrl: '/basemap/styles/esri-style-light-grey-canvas.json',
    previewColor: '#e2e8f0'
  },
  {
    id: 'esri-dark-grey',
    name: 'Esri Dark Gray Canvas',
    category: 'Esri',
    group: 'canvas',
    description: 'Official Esri sleek dark canvas with high-contrast road and place labels',
    styleUrl: '/basemap/styles/esri-style-cleanmap.json',
    previewColor: '#1e293b'
  },
  {
    id: 'carto-dark',
    name: 'CARTO Dark Matter',
    category: 'Carto',
    group: 'canvas',
    description: 'High-contrast dark cartographic basemap optimized for overlay visualization',
    styleUrl: '/basemap/styles/google-hybrid.json',
    previewColor: '#0f172a'
  },
  {
    id: 'carto-voyager',
    name: 'CARTO Voyager',
    category: 'Carto',
    group: 'canvas',
    description: 'Clean modern navigation basemap powered by OpenStreetMap & CARTO',
    styleUrl: '/basemap/styles/esri-style-navigation.json',
    previewColor: '#0ea5e9'
  },
  {
    id: 'esri-clarity',
    name: 'Esri Imagery Clarity',
    category: 'Esri',
    group: 'canvas',
    description: 'High-clarity satellite archive imagery for clear ground feature resolution',
    styleUrl: '/basemap/styles/google-satellite.json',
    previewColor: '#1e3a8a'
  },
  {
    id: 'osm-humanitarian',
    name: 'OpenStreetMap Humanitarian',
    category: 'OpenData',
    group: 'canvas',
    description: 'High-contrast humanitarian OpenStreetMap styling detailing roads, rivers, and topography',
    styleUrl: '/basemap/styles/protomaps-style-light.json',
    previewColor: '#e11d48'
  },
  {
    id: 'esri-colorpencil',
    name: 'Esri Colored Pencil',
    category: 'Esri',
    group: 'canvas',
    description: 'Unique hand-drawn artistic styling with sketched typography and colored pencil shading',
    styleUrl: '/basemap/styles/esri-style-colorpencil.json',
    previewColor: '#e0a96d'
  }
];

export const DEFAULT_BASEMAP_ID = 'esri-imagery';
