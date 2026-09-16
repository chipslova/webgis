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
    description: 'Official ArcGIS World Imagery high-resolution global satellite mosaic',
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
    description: 'Esri global street map with detailed transportation networks and urban landmarks',
    styleUrl: '/basemap/styles/esri-style-streets.json',
    previewColor: '#3b82f6'
  },
  {
    id: 'big-rbi',
    name: 'Rupabumi Indonesia (RBI)',
    format: 'raster',
    category: 'National',
    group: 'recommended',
    description: 'Official national topographic base map from the Geospatial Information Agency of Indonesia (BIG)',
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
    description: 'OpenStreetMap community global street, building footprint, and land cover map',
    styleUrl: '/basemap/styles/esri-style-open-basemap.json',
    previewColor: '#d97706'
  },
  {
    id: 'esri-topographic',
    name: 'Esri World Topographic',
    format: 'raster',
    category: 'Esri',
    group: 'recommended',
    description: 'Esri world topographic map with elevation contours and physical landforms',
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
    description: 'High-contrast dark gray canvas designed for vibrant geospatial overlays',
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
    zoomWarning: 'Max Zoom Level 17 (SRTM Contours)',
    description: 'Topographic map based on OpenStreetMap data and SRTM elevation contour lines',
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
    zoomWarning: 'Max Zoom Level 13 (Shaded Relief)',
    description: 'Terrain surface model with hillshading relief and mountain elevation',
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
    zoomWarning: 'Max Zoom Level 11 (NatGeo Cartography)',
    description: 'Signature National Geographic cartography style with mountain shaded relief',
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
    zoomWarning: 'Max Zoom Level 9 (Ocean Depth Bathymetry)',
    description: 'Esri/NOAA ocean bathymetry map with trench depth and seafloor morphology',
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
    description: 'Minimalist light gray canvas tailored for high-contrast thematic data layers',
    styleUrl: '/basemap/styles/esri-style-light-grey-canvas.json',
    previewColor: '#e2e8f0'
  },
  {
    id: 'openfreemap-liberty',
    name: 'OpenFreeMap Liberty',
    format: 'vector',
    category: 'OpenData',
    group: 'canvas',
    description: 'Modern high-detail OpenFreeMap vector street map (watermark-free, zero API key)',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    previewColor: '#0284c7'
  },
  {
    id: 'openfreemap-positron',
    name: 'OpenFreeMap Positron',
    format: 'vector',
    category: 'OpenData',
    group: 'canvas',
    description: 'Light minimalist OpenFreeMap vector canvas (watermark-free, zero API key)',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    previewColor: '#334155'
  },
  {
    id: 'esri-clarity',
    name: 'Esri Imagery Clarity',
    format: 'raster',
    category: 'Esri',
    group: 'canvas',
    description: 'Cloudless high-resolution satellite imagery archive for pristine terrain views',
    styleUrl: '/basemap/styles/esri-style-imagery-clarity.json',
    previewColor: '#1e3a8a'
  },
  {
    id: 'osm-humanitarian',
    name: 'OpenStreetMap Humanitarian',
    format: 'raster',
    category: 'OpenData',
    group: 'canvas',
    description: 'OpenStreetMap Humanitarian map style with emphasis on water features and road networks',
    styleUrl: '/basemap/styles/osm-style-humanitarian.json',
    previewColor: '#e11d48'
  },
  {
    id: 'esri-colorpencil',
    name: 'Esri Colored Pencil',
    format: 'vector',
    category: 'Esri',
    group: 'canvas',
    description: 'Artistic colored pencil vector map style with hand-drawn aesthetic typography',
    styleUrl: '/basemap/styles/esri-style-colorpencil.json',
    previewColor: '#e0a96d'
  }
];

export const DEFAULT_BASEMAP_ID = 'esri-imagery';
