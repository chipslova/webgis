# Digital Earth Indonesia WebGIS

An interactive, high-performance WebGIS and Earth Observation (EO) analytical platform for exploring Indonesian satellite imagery, environmental models, and spatial analytics.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-webgis--three--iota.vercel.app-00f0ff?style=for-the-badge&logo=vercel)](https://webgis-three-iota.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-v5%2Fv6-396afc?style=for-the-badge&logo=maplibre)](https://maplibre.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-fbf0df?style=for-the-badge&logo=bun)](https://bun.sh/)

---

## 🌟 Overview

**Digital Earth Indonesia WebGIS** combines standardized OGC Web Mapping Services (WMS), Open Data Cube (ODC) satellite pipelines, Google Earth Engine (GEE) thermal analysis, and client-side geodesic calculations into a unified geospatial intelligence dashboard.

Designed for national environmental monitoring, land-use planning, and disaster risk assessment across the Indonesian archipelago.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Digital Earth WebGIS Client                        │
│             (MapLibre GL JS • 2D Mercator & 3D Globe Projection)            │
└───────┬───────────────────────────────┬──────────────────────────────┬──────┘
        │ OGC WMS 1.3.0                 │ GeoJSON / REST               │ Geodesics
        ▼                               ▼                              ▼
┌───────────────────────────────┐ ┌──────────────────────────┐ ┌──────────────┐
│        BIG Piksel ODC         │ │   Google Earth Engine    │ │   Turf.js    │
│  • Sentinel-2 GeoMAD (10m)    │ │  • MODIS Daytime LST     │ │  • Distance  │
│  • USGS Landsat 9 (30m)       │ │  • Urban Heat Island     │ │  • Area      │
│  • Flood Hazard Models        │ │  • SRTM Ground Elevation │ │  • Centroid  │
└───────────────────────────────┘ └──────────────────────────┘ └──────────────┘
```

---

## 🚀 Key Features

### 🛰️ 1. Piksel Earth Observation (BIG × Geoscience Australia)
* **Sentinel-2 GeoMAD Mosaics (10m)**: Cloud-free annual Median Absolute Deviation composites across Indonesia (2019–2025).
* **On-the-Fly Spectral Indices**: Server-side band algebra computed live via Open Data Cube:
  * **NDVI** (Normalized Difference Vegetation Index)
  * **NDWI** (Normalized Difference Water Index)
  * **NIR Surface Reflectance**
  * **Observation Density** (Scene acquisition count & data availability)
* **Landsat 9 Swath Analyses**: USGS/NASA surface reflectance (2022–2025).
* **National Flood Hazard Modeling**: High-resolution hydrological floodplain risk classifications (`flood_hazard_rp02`).
* **National 10m Grid Index**: Interactive overlay of 1,631 Open Data Cube tile boundaries.

### 🌡️ 2. Google Earth Engine Thermal & Topographic Analysis
* **MODIS Land Surface Temperature (LST)**: 1km daytime thermal gradient (MOD11A2).
* **Urban Heat Island (UHI) Quantification**: Real-time thermal contrast measurement between Jakarta Urban Core (Monas, 33.85°C) and West Java Rural Baseline (IPB Forest, 24.60°C) with a **+9.25°C UHI Delta**.
* **Seasonal Time-Series (2020–2026)**: Canvas-rendered annual temperature dynamics with fitted harmonic curves.
* **USGS SRTM Elevation**: 30m digital elevation model and MODIS MCD12Q1 land cover classifications.

### 🗺️ 3. Layer Orchestration & Active Layer Management
* **Deterministic Visual Stacking**: Enforces strict vertical hierarchy:
  $$\text{Measurement} \to \text{Custom GeoJSON} \to \text{GEE POI} \to \text{Piksel Grid} \to \text{GEE Rasters} \to \text{Piksel WMS} \to \text{Basemap}$$
* **Independent Layer Control**: Every active dataset features discrete **Hide/Show (👁)**, **Opacity Sliders (0–100%)**, and **Remove (✕)** actions.
* **15 Vector & Raster Basemaps**: Google Satellite/Hybrid/Streets, Esri World Imagery/Topographic/NatGeo/Canvas, BIG Rupabumi Indonesia (RBI), OpenStreetMap, and OpenTopoMap.

### 📐 4. Spatial Measurement & Vector Tools
* **Geodesic Path Distance**: Real-time multi-point path calculation with satellite-contrast casing.
* **Polygon Area Measurement**: Spherical geodesic area calculation powered by Turf.js.
* **Custom GeoJSON Engine**: Drag-and-drop vector upload with automatic bounding box zoom, symbology, and feature inspection.

---

## 🏗️ Technical Architecture & Reliability Engineering

### ⚡ Tile Lifecycle & Request Telemetry
Standard WebGIS applications often suffer from desynchronized loading spinners during panning. This platform implements a dedicated `PikselRequestManager`:
* Scopes network aborts during rapid panning to prevent false `PARTIAL` failure locks.
* Emits live telemetry: `Tiles Loaded`, `Tiles Aborted`, `Server Latency (ms)`, and `Zoom Threshold (Z6+)`.
* Surfaces technical diagnostics inside collapsible expandable accordions without cluttering the primary user workflow.

### 🎨 WebGL Buffer Preservation
* Configured MapLibre GL JS with `preserveDrawingBuffer: true`, enabling crisp, full-resolution **Export Map PNG** captures without blank canvas artifacts.

---

## 📊 Data Provenance & Specifications

| Dataset | Provider / Source | Spatial Resolution | Temporal Coverage | Access Protocol |
| :--- | :--- | :--- | :--- | :--- |
| **Sentinel-2 GeoMAD** | BIG Piksel / ESA | 10 meters | 2019 – 2025 | OGC WMS 1.3.0 (PNG) |
| **Spectral Indices (NDVI/NDWI)** | Open Data Cube | 10 meters | Annual Comps | OGC WMS 1.3.0 |
| **Landsat 9 Analysis** | USGS / NASA | 30 meters | 2022 – 2025 | OGC WMS 1.3.0 Swaths |
| **Flood Hazard Models** | BIG Hidrologi | 10 meters | RP02 Model | Physical Raster WMS |
| **MODIS Daytime LST** | NASA LP DAAC / GEE | 1,000 meters | 2020 – 2026 | GeoJSON Analytical |
| **SRTM Digital Elevation** | USGS / NASA | 30 meters | Static DEM | GeoJSON Analytical |
| **MCD12Q1 Land Cover** | NASA LP DAAC | 500 meters | Static Class | GeoJSON Analytical |
| **National Topographic (RBI)** | BIG Indonesia | Vector Tiles | Multi-Scale | WMTS / Vector Tile |

---

## 💻 Tech Stack

* **Frontend Framework**: Vanilla TypeScript + Modular Component Architecture
* **Mapping Engine**: [MapLibre GL JS](https://maplibre.org/) v5/v6
* **Spatial Analytics**: [@turf/turf](https://turfjs.org/)
* **Protocols**: OGC WMS 1.3.0, PMTiles, GeoJSON
* **Bundler & Build Tool**: [Vite 6](https://vitejs.dev/)
* **Runtime**: [Bun](https://bun.sh/)
* **Deployment**: [Vercel](https://vercel.com/)

---

## 🛠️ Local Development

### Prerequisites
* [Bun](https://bun.sh/) (version 1.0 or newer) or Node.js 18+

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/chipslova/webgis.git
cd webgis

# Install dependencies
bun install

# Start local development server
bun run dev

# Build for production
bun run build
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

Developed with ❤️ for Indonesian Geospatial Intelligence and Earth Observation.
