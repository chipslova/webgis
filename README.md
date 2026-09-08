# Digital Earth Indonesia WebGIS

An interactive WebGIS platform for exploring Indonesian Earth Observation datasets and spatial analytics workflows. Integrates BIG Piksel OGC Web Map Services (WMS), Google Earth Engine (GEE) Jabodetabek case study datasets, 3D terrain and building extrusions, and client-side geodesic calculations.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-webgis--three--iota.vercel.app-00f0ff?style=for-the-badge&logo=vercel)](https://webgis-three-iota.vercel.app/)
[![CI](https://img.shields.io/badge/CI-Passing-10b981?style=for-the-badge&logo=githubactions)](https://github.com/chipslova/webgis/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-v5-396afc?style=for-the-badge&logo=maplibre)](https://maplibre.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-fbf0df?style=for-the-badge&logo=bun)](https://bun.sh/)
[![Vitest](https://img.shields.io/badge/Vitest-35%20Tests%20Passing-10b981?style=for-the-badge&logo=vitest)](https://vitest.dev/)

---

## 🌟 Overview

**Digital Earth Indonesia WebGIS** is built with modern web mapping technologies to provide accessible Earth Observation data visualization and spatial analysis tools for Indonesia. The application connects directly to official geospatial services, renders multi-source analytical layers, and offers interactive inspection tools in a responsive interface.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       Digital Earth WebGIS Application                                   │
│  [🔍 Cari Lokasi...]              [↺ Reset Tampilan] [🌐 Mode 3D] [⬆ Impor GeoJSON] [🔗 Bagikan] [📷 Simpan] │
├───────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ BILAH SAMPING │                                  MAPLIBRE GL CANVAS                                     │
│ ───────────── │                                                                                         │
│ 🗺️ Peta       │  🛰️  Sentinel-2 GeoMAD 10m Mosaics & Spectral Indices (BIG Piksel OGC WMS)              │
│ 🛰️ Satelit    │  🌡️  MODIS Land Surface Temp Thermal Gradient & Urban Heat Island Analysis              │
│ 📈 Analisis   │  ⛰️  3D Terrarium Elevation Mesh & 3D Building Vector Extrusions (WebGL2)               │
│ 📏 Ukur       │  📍  Interactive Geodesic Distance & Area Geometries (Turf.js)                          │
│ 📁 Data       │                                                                                         │
│ 📋 Legenda    │  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│ ℹ️ Tentang    │  │ 🧭 DOCK: [🗺️ 16 Basemaps] [🎛️ Sublayers] [⛰️ 3D Terrain] [📐 Grid ODC]              │  │
│               │  └───────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 🛰️ 1. Piksel Earth Observation (BIG × Geoscience Australia)
* **Sentinel-2 GeoMAD Mosaics (10m)**: Annual cloud-free Median Absolute Deviation composites across Indonesia (2017–2025).
* **Spectral Indices**: Computed server-side via Open Data Cube and rendered via OGC WMS:
  * **NDVI** (Normalized Difference Vegetation Index)
  * **NDWI** (Normalized Difference Water Index)
  * **NIR Surface Reflectance**
  * **Observation Density** (Scene acquisition count & coverage)
* **Landsat 9 Swath Analyses**: USGS/NASA surface reflectance (2021–2026).
* **Piksel Flood Hazard Modeling**: Hydrological floodplain classifications (`flood_hazard_rp02` & `rp10`) for priority study areas.
* **Piksel Data Cube Tile Index**: Interactive overlay of 1,631 Open Data Cube tile boundaries across Indonesian territory.

### 🌡️ 2. Google Earth Engine (GEE) Urban Heat Island Case Study
* **MODIS Daytime Land Surface Temperature (LST)**: Interpolated continuous thermal gradient ($22^\circ\text{C} \to 34^\circ\text{C}+$) for the Jabodetabek metropolitan region (2020–2026 baseline & time-series snapshot).
* **Urban vs. Rural Microclimate Analysis**: Comparative study between Jakarta Urban Core (*Monas: 33.85°C, 14m elev*) and West Java Rural Baseline (*Hutan IPB Bogor: 24.60°C, 680m elev*) displaying a **+9.25°C UHI Delta**.
* **Harmonic Seasonal Time-Series**: Dynamic canvas charts showing annual dry-season temperature peaks and wet-season cooling patterns (2020–2026).
* **Topography & Land Cover**: USGS SRTM 30m Elevation contours and MODIS MCD12Q1 Land Cover classification for Jabodetabek.

### 🗺️ 3. Basemaps & 3D Terrain Customization
* **16 Official Vector & Raster Basemaps**:
  * ⭐ **Recommended:** Esri World Imagery (Default), Esri World Streets, Rupabumi Indonesia (BIG RBI), OpenStreetMap Standard.
  * 🎨 **Topography & Thematic:** Esri Topographic, OpenTopoMap, Esri Shaded Relief, Esri National Geographic, Esri Ocean.
  * 🌓 **Canvas & Navigation:** Esri Light/Dark Gray Canvas, CARTO Dark Matter, CARTO Voyager, Esri Imagery Clarity, OSM Humanitarian, Esri Colored Pencil.
* **3D AWS Terrarium Elevation**: Real-time 3D terrain mesh generation with adjustable vertical exaggeration (0.1x – 3.0x).
* **3D Vector Building Extrusions**: Dynamic OpenFreeMap planet vector building extrusions with smooth perspective camera transitions.
* **Vector Sublayer Toggles**: Granular control over roads, road labels, place names, admin boundaries, landcover, water, and building polygons.

### 📍 4. Point Inspector & Feature Query
* Click anywhere on the map to query:
  * High-precision coordinates in Decimal Degrees and Degrees Minutes Seconds (DMS).
  * Rendered vector feature properties (Piksel Tile Grid, POI stations, custom uploaded GeoJSON features).
  * Visualization context notes clarifying the distinction between visual WMS map representations and raw raster values.

### 📐 5. Spatial Measurement & Data Upload
* **Geodesic Distance**: Real-time multi-point path distance measurement with high-contrast line casing.
* **Geodesic Area**: Spherical polygon area calculations powered by Turf.js.
* **Custom GeoJSON Upload**: Drag-and-drop or file selection for points, lines, and polygons with automatic bounding box zoom and layer styling.

### 🔗 6. State Sharing & Layout Export
* **Stateful Permalink URL**: Automatically synchronizes coordinates, zoom, pitch, bearing, active basemap, Sentinel-2 product/year, and GEE layers directly to the URL hash.
* **Cartographic PNG Export**: Exports high-resolution PNG map layouts including header title, active dataset name, coordinate metadata, EPSG:3857 reference system, and timestamped attribution.

---

## 🏗️ Technical Architecture

* **Bundle Efficiency**: Heavy static GeoJSON datasets are loaded lazily via asynchronous HTTP requests (`/data/*.geojson`), reducing the core JavaScript bundle to ~155 KB for fast initial page load.
* **Deterministic Layer Stacking**: Centralized `enforceLayerOrder()` maintains visual hierarchy across all basemap switches and layer toggles:
  $$\text{Measurement} \to \text{Custom GeoJSON} \to \text{GEE POI} \to \text{Piksel Grid} \to \text{GEE Rasters} \to \text{Piksel WMS} \to \text{Basemap}$$
* **Keyboard & Screen Reader Accessible**: Comprehensive keyboard navigation, `aria-label`, `role`, `aria-expanded`, and `aria-selected` attributes on interactive controls, drawers, modals, and tab lists.
* **Production-Safe Logging**: All debug logging and warnings are gated behind `import.meta.env.DEV` to keep production runtime clean.
* **WebGL Buffer Preservation**: MapLibre GL JS configured with `preserveDrawingBuffer: true` for clean, artifact-free canvas exports.

---

## 📊 Data Sources & Provenance

| Dataset | Provider / Source | Spatial Resolution | Temporal Coverage | Access Protocol |
| :--- | :--- | :--- | :--- | :--- |
| **Sentinel-2 GeoMAD** | BIG Piksel / ESA | 10 meters | 2017 – 2025 | OGC WMS 1.3.0 (PNG) |
| **Spectral Indices (NDVI/NDWI)** | Open Data Cube | 10 meters | Annual Composites | OGC WMS 1.3.0 |
| **Landsat 9 Analysis** | USGS / NASA | 30 meters | 2021 – 2026 | OGC WMS 1.3.0 |
| **Flood Hazard Models** | BIG Hidrologi | 10 meters | Priority Study Areas | OGC WMS 1.3.0 |
| **MODIS Daytime LST** | NASA LP DAAC / GEE | 1,000 meters | 2020 – 2026 (Baseline & Time-Series) | GeoJSON (Lazy Fetch) |
| **SRTM Digital Elevation** | USGS / NASA | 30 meters | Static DEM Grid | GeoJSON (Lazy Fetch) |
| **MCD12Q1 Land Cover** | NASA LP DAAC | 500 meters | Static Classification | GeoJSON (Lazy Fetch) |
| **3D Terrarium DEM** | Mapzen / AWS Open Data | Global DEM | Continuous | Raster DEM TileJSON |
| **3D Buildings** | OpenFreeMap / OSM | Global Vector | Continuous | Vector Tiles |
| **National Topographic (RBI)** | BIG Indonesia | Vector Tiles | Multi-Scale | TileJSON / Vector |

> **Note on Piksel OGC Service**: Satellite imagery products are accessed via the BIG Piksel OGC Web Map Service staging environment (`ows.staging.piksel.big.go.id`), used for development and demonstration during the internship research period.

---

## 💻 Tech Stack

* **Language**: TypeScript 5.x
* **Mapping Engine**: [MapLibre GL JS](https://maplibre.org/)
* **Spatial Calculations**: [@turf/turf](https://turfjs.org/)
* **Raster / Vector Protocols**: OGC WMS 1.3.0, PMTiles, GeoJSON, TileJSON
* **Testing Framework**: [Vitest](https://vitest.dev/) (35 unit & integration tests)
* **Build Tool**: [Vite 6](https://vitejs.dev/)
* **Package Manager / Runtime**: [Bun](https://bun.sh/)

---

## 🛠️ Getting Started

### Prerequisites
* [Bun](https://bun.sh/) (v1.1 or higher) or Node.js 18+

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/chipslova/webgis.git
cd webgis

# Install dependencies
bun install

# Start local development server (runs on http://localhost:3000)
bun run dev

# Run unit and integration tests
bun run test

# Type-check TypeScript
bun x tsc --noEmit

# Build production bundle
bun run build

# Preview production build locally
bun run preview
```

---

## ⚠️ Known Limitations

* **Upstream WMS Availability**: Sentinel-2 and Landsat 9 Earth Observation mosaics are served live via the BIG Piksel OGC WMS staging service (`ows.staging.piksel.big.go.id`). Server response times and uptime are subject to upstream infrastructure availability.
* **Minimum Zoom Thresholds**: High-resolution 10m Sentinel-2 GeoMAD and 30m Landsat 9 layers require zoom level $\ge 8$ (or $\ge 7$ for Landsat) to render on the map.
* **GEE Case Study Boundary**: The thermal Land Surface Temperature (LST), SRTM 30m elevation, and MODIS land cover layers represent curated historical spatial baseline snapshots focused on the Jabodetabek and West Java study areas (2020–2026).
* **3D Hardware Acceleration**: Real-time 3D terrain elevation mesh and building extrusions require WebGL2 support on the client browser.
* **External Basemap Providers**: Basemaps from Esri, Badan Informasi Geospasial (BIG), and OpenStreetMap depend on their respective public tile infrastructure and usage terms.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

