export interface BasemapConfig {
  id: string;
  name: string;
  category: 'Esri' | 'National' | 'OpenData' | 'Google';
  description: string;
  styleUrl: string;
  previewColor: string;
  initialBounds?: {
    center: [number, number];
    zoom: number;
  };
}

export const BASEMAPS: BasemapConfig[] = [
  {
    id: 'google-satellite',
    name: 'Google Satellite',
    category: 'Google',
    description: 'High-resolution global satellite imagery provided by Google Maps',
    styleUrl: '/basemap/styles/google-satellite.json',
    previewColor: '#1e3a8a',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 4.5
    }
  },
  {
    id: 'google-hybrid',
    name: 'Google Satellite Hybrid',
    category: 'Google',
    description: 'High-resolution satellite imagery with overlay of roads, places, and boundaries',
    styleUrl: '/basemap/styles/google-hybrid.json',
    previewColor: '#0f766e',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 4.5
    }
  },
  {
    id: 'google-streets',
    name: 'Google Streets (Navigation)',
    category: 'Google',
    description: 'High-contrast street map with road networks, city labels, and transit lines',
    styleUrl: '/basemap/styles/esri-style-navigation.json',
    previewColor: '#0ea5e9',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 4.5
    }
  },
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    category: 'Esri',
    description: 'Esri high-resolution global satellite & aerial imagery (No API Key Required)',
    styleUrl: '/basemap/styles/esri-style-community.json',
    previewColor: '#1e293b',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 4.5
    }
  },
  {
    id: 'esri-topographic',
    name: 'Esri World Topographic',
    category: 'Esri',
    description: 'Official Esri world topographic map with contours and physical landforms',
    styleUrl: '/basemap/styles/esri-style-topographic.json',
    previewColor: '#688e57'
  },
  {
    id: 'esri-streets',
    name: 'Esri World Streets',
    category: 'Esri',
    description: 'Detailed Esri global street map with road networks and city landmarks',
    styleUrl: '/basemap/styles/esri-style-streets.json',
    previewColor: '#3b82f6'
  },
  {
    id: 'esri-natgeo',
    name: 'Esri National Geographic',
    category: 'Esri',
    description: 'Distinctive National Geographic world cartographic styling and shaded relief',
    styleUrl: '/basemap/styles/esri-style-natgeo.json',
    previewColor: '#84cc16'
  },
  {
    id: 'esri-light-grey',
    name: 'Esri Light Gray Canvas',
    category: 'Esri',
    description: 'Official Esri minimalist neutral backdrop with labels for thematic spatial analysis',
    styleUrl: '/basemap/styles/esri-style-light-grey-canvas.json',
    previewColor: '#e2e8f0'
  },
  {
    id: 'esri-dark-grey',
    name: 'Esri Dark Gray Canvas',
    category: 'Esri',
    description: 'Official Esri sleek dark canvas with high-contrast road and place labels',
    styleUrl: '/basemap/styles/esri-style-cleanmap.json',
    previewColor: '#1e293b'
  },
  {
    id: 'esri-ocean',
    name: 'Esri Ocean Basemap',
    category: 'Esri',
    description: 'Esri marine and ocean bathymetry basemap detailing seafloor features and depths',
    styleUrl: '/basemap/styles/esri-style-ocean.json',
    previewColor: '#0284c7'
  },
  {
    id: 'esri-relief',
    name: 'Esri World Shaded Relief',
    category: 'Esri',
    description: 'Esri terrain surface model with shaded elevation relief and mountain contours',
    styleUrl: '/basemap/styles/esri-style-relief.json',
    previewColor: '#78716c'
  },
  {
    id: 'big-rbi',
    name: 'Rupabumi Indonesia (RBI)',
    category: 'National',
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
    description: 'Global community-driven OpenStreetMap street data and land cover',
    styleUrl: '/basemap/styles/esri-style-open-basemap.json',
    previewColor: '#d97706'
  },
  {
    id: 'osm-humanitarian',
    name: 'OpenStreetMap Humanitarian',
    category: 'OpenData',
    description: 'High-contrast humanitarian OpenStreetMap styling detailing roads, rivers, and topography',
    styleUrl: '/basemap/styles/protomaps-style-light.json',
    previewColor: '#e11d48'
  },
  {
    id: 'open-topo',
    name: 'OpenTopoMap',
    category: 'OpenData',
    description: 'Topographic map derived from OpenStreetMap and SRTM elevation contours',
    styleUrl: '/basemap/styles/esri-style-open-topographic.json',
    previewColor: '#15803d'
  }
];

export const DEFAULT_BASEMAP_ID = 'google-hybrid';
