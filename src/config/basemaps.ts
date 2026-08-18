export interface BasemapConfig {
  id: string;
  name: string;
  category: 'Esri' | 'National' | 'Protomaps' | 'Google' | 'Raster';
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
      center: [106.90, -6.35],
      zoom: 9.5
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
      center: [106.90, -6.35],
      zoom: 9.5
    }
  },
  {
    id: 'esri-open-basemap',
    name: 'Esri Open Basemap',
    category: 'Esri',
    description: 'Detailed global vector basemap powered by OpenStreetMap data',
    styleUrl: '/basemap/styles/esri-style-open-basemap.json',
    previewColor: '#e0dfdb',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 5
    }
  },
  {
    id: 'esri-topographic',
    name: 'Esri Topographic',
    category: 'Esri',
    description: 'Comprehensive topographic map including contours and landforms',
    styleUrl: '/basemap/styles/esri-style-topographic.json',
    previewColor: '#688e57'
  },
  {
    id: 'esri-navigation',
    name: 'Esri Navigation',
    category: 'Esri',
    description: 'Optimized vector style for routing, transport, and navigation',
    styleUrl: '/basemap/styles/esri-style-navigation.json',
    previewColor: '#3a76a4'
  },
  {
    id: 'esri-light-grey',
    name: 'Esri Light Grey Canvas',
    category: 'Esri',
    description: 'Minimalist neutral backdrop for highlighting thematic spatial data',
    styleUrl: '/basemap/styles/esri-style-light-grey-canvas.json',
    previewColor: '#dedede'
  },
  {
    id: 'esri-cleanmap',
    name: 'Esri Clean Map',
    category: 'Esri',
    description: 'Clutter-free clean vector basemap for high legibility',
    styleUrl: '/basemap/styles/esri-style-cleanmap.json',
    previewColor: '#eeddbb'
  },
  {
    id: 'esri-colorpencil',
    name: 'Esri Color Pencil',
    category: 'Esri',
    description: 'Artistic hand-drawn colored pencil styling for creative maps',
    styleUrl: '/basemap/styles/esri-style-colorpencil.json',
    previewColor: '#e6c89c'
  },
  {
    id: 'esri-community',
    name: 'Esri Community',
    category: 'Esri',
    description: 'Community contributed rich basemap layer detailing landmarks and terrain',
    styleUrl: '/basemap/styles/esri-style-community.json',
    previewColor: '#7ba269'
  },
  {
    id: 'esri-open-topo',
    name: 'Esri Open Topo',
    category: 'Esri',
    description: 'Open data topographic vector style with physical terrain',
    styleUrl: '/basemap/styles/esri-style-open-topographic.json',
    previewColor: '#8cae7d'
  },
  {
    id: 'big-rbi',
    name: 'Rupabumi Indonesia (RBI)',
    category: 'National',
    description: 'Official National Vector Basemap from BIG (Badan Informasi Geospasial Indonesia)',
    styleUrl: '/basemap/styles/big-style-rbi.json',
    previewColor: '#4fa8d8',
    initialBounds: {
      center: [117.89, -2.55],
      zoom: 5
    }
  },
  {
    id: 'protomaps-light',
    name: 'Protomaps Light',
    category: 'Protomaps',
    description: 'Open source vector basemap powered by PMTiles protocol',
    styleUrl: '/basemap/styles/protomaps-style-light.json',
    previewColor: '#cccccc'
  }
];

export const DEFAULT_BASEMAP_ID = 'google-hybrid';
