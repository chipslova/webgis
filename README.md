# Digital Earth Indonesia WebGIS

An interactive WebGIS for exploring Indonesian Earth Observation datasets and demonstrating spatial analytics workflows, integrating BIG Piksel OGC services, Open Data Cube, and Google Earth Engine.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-webgis--three--iota.vercel.app-00f0ff?style=for-the-badge&logo=vercel)](https://webgis-three-iota.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-v5%2Fv6-396afc?style=for-the-badge&logo=maplibre)](https://maplibre.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-fbf0df?style=for-the-badge&logo=bun)](https://bun.sh/)

---

## 🌟 Overview

**Digital Earth Indonesia WebGIS** combines standardized OGC Web Mapping Services (WMS), Open Data Cube (ODC) satellite pipelines, Google Earth Engine (GEE) thermal analysis, and client-side geodesic calculations into a unified geospatial intelligence dashboard.



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
* **Sentinel-2 GeoMAD Mosaics (10m)**: Cloud-free annual Median Absolute Deviation composites across Indonesia (2017–2025).
* **On-the-Fly Spectral Indices**: Server-side band algebra computed live via Open Data Cube:
  * **NDVI** (Normalized Difference Vegetation Index)
  * **NDWI** (Normalized Difference Water Index)
  * **NIR Surface Reflectance**
  * **Observation Density** (Scene acquisition count & data availability)
* **Landsat 9 Swath Analyses**: USGS/NASA surface reflectance (2022–2025).
* **National Flood Hazard Modeling**: High-resolution hydrological floodplain risk classifications (`flood_hazard_rp02`).
* **National 10m Grid Index**: Interactive overlay of 1,631 Open Data Cube tile boundaries.

### 🌡️ 2. Google Earth Engine (GEE) National Multi-Region Analysis
* **National Multi-Region Framework**: Interactive microclimate and thermal analysis across **6 Strategic Economic & Urban Corridors in Indonesia**:
  1. **Jabodetabek & Jawa Barat**: *Jakarta Monas (33.85°C) vs Hutan IPB Bogor (24.60°C)* $\to$ **+9.25°C UHI Delta**
  2. **IKN Nusantara & Kalimantan Timur**: *KIPP IKN (31.40°C) vs Hutan Lindung S. Wain (25.10°C)* $\to$ **+6.30°C UHI Delta**
  3. **Surabaya & Jawa Timur**: *Pusat Kota Surabaya (34.20°C) vs Tahura R. Soerjo / Bromo (23.80°C)* $\to$ **+10.40°C UHI Delta**
  4. **Medan & Sumatera Utara**: *Medan Kota (33.10°C) vs Cagar Alam Sibolangit (24.90°C)* $\to$ **+8.20°C UHI Delta**
  5. **Makassar & Sulawesi Selatan**: *Kawasan Losari (32.80°C) vs Pegunungan Malino (24.30°C)* $\to$ **+8.50°C UHI Delta**
  6. **Denpasar & Bali**: *Kawasan Kuta/Denpasar (32.50°C) vs Hutan Bedugul (23.40°C)* $\to$ **+9.10°C UHI Delta**
* **MODIS Land Surface Temperature (LST)**: 1km daytime thermal gradient (MOD11A2) with live region swapping and automatic camera navigation.
* **Seasonal Time-Series (2020–2026)**: Dynamic canvas-rendered annual temperature dynamics and sinusoidal harmonic fits per region.
* **USGS SRTM Elevation & MODIS Land Cover**: 30m digital elevation model and MCD12Q1 land cover classification for all 6 regions.

### 🗺️ 3. Layer Orchestration & Active Layer Management
* **Deterministic Visual Stacking**: Enforces strict vertical hierarchy:
  $$\text{Measurement} \to \text{Custom GeoJSON} \to \text{GEE POI} \to \text{Piksel Grid} \to \text{GEE Rasters} \to \text{Piksel WMS} \to \text{Basemap}$$
* **Independent Layer Control**: Every active dataset features discrete **Hide/Show (👁)**, **Opacity Sliders (0–100%)**, and **Remove (✕)** actions.
* **15 Vector & Raster Basemaps**: Google Satellite/Hybrid/Streets, Esri World Imagery/Topographic/NatGeo/Canvas, BIG Rupabumi Indonesia (RBI), OpenStreetMap, and OpenTopoMap.

### 📍 4. Point Inspector & Surface Query
* **Geospatial & Active Layer Query**: Click anywhere on the map to query:
  * High-precision coordinates (Decimal Degrees & DMS).
  * Topographic Ground Elevation (USGS SRTM 30m).
  * Land Surface Temperature estimates (MODIS Daytime LST).
  * Active spectral index / flood hazard classification interpretation.
  * Vector feature properties and copy-to-clipboard actions.

### 📐 5. Spatial Measurement & Vector Tools
* **Geodesic Path Distance**: Real-time multi-point path calculation with satellite-contrast casing.
* **Polygon Area Measurement**: Spherical geodesic area calculation powered by Turf.js.
* **Custom GeoJSON Engine**: Drag-and-drop vector upload with automatic bounding box zoom, symbology, and feature inspection.

### 🔗 6. State Synchronization & High-Resolution GIS Report Export
* **Stateful Permalink URL Sharing**: Automatically synchronizes coordinates, zoom, active basemap, Sentinel-2 product/year, and GEE layers directly into the URL hash. One-click **"Bagikan"** button copies shareable analytical links.
* **Professional GIS Export**: Export high-resolution PNG map layouts complete with top branding banner (Title & active EO dataset), bottom coordinate strip, EPSG:3857 reference system, and timestamped data attribution.

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
| **Sentinel-2 GeoMAD** | BIG Piksel / ESA | 10 meters | 2017 – 2025 | OGC WMS 1.3.0 (PNG) |
| **Spectral Indices (NDVI/NDWI)** | Open Data Cube | 10 meters | Annual Comps | OGC WMS 1.3.0 |
| **Landsat 9 Analysis** | USGS / NASA | 30 meters | 2022 – 2025 | OGC WMS 1.3.0 Swaths |
| **Flood Hazard Models** | BIG Hidrologi | 10 meters | RP02 Model | Physical Raster WMS |
| **MODIS Daytime LST** | NASA LP DAAC / GEE | 1,000 meters | 2020 – 2024 | GeoJSON Analytical |
| **SRTM Digital Elevation** | USGS / NASA | 30 meters | Static DEM | GeoJSON Analytical |
| **MCD12Q1 Land Cover** | NASA LP DAAC | 500 meters | Static Class | GeoJSON Analytical |
| **National Topographic (RBI)** | BIG Indonesia | Vector Tiles | Multi-Scale | WMTS / Vector Tile |

---

## 💻 Tech Stack

* **Frontend Framework**: Vanilla TypeScript + Modular Component Architecture
* **Mapping Engine**: [MapLibre GL JS](https://maplibre.org/) v5/v6
* **Spatial Analytics**: [@turf/turf](https://turfjs.org/)
* **Protocols**: OGC WMS 1.3.0, PMTiles, GeoJSON, EPSG:3857 / EPSG:4326
* **Bundler & Build Tool**: [Vite 6](https://vitejs.dev/)
* **Runtime**: [Bun](https://bun.sh/)
* **Deployment**: [Vercel](https://vercel.com/)

> **Note — Piksel OGC Service**: Satellite imagery products are accessed via the BIG Piksel OGC Web Map Service (WMS) staging environment (`ows.staging.piksel.big.go.id`), used for development and demonstration. This is the currently available endpoint provided during the internship period.

---

## 📐 Mathematical Formulations & Band Algebra

All spectral indices are computed server-side on Open Data Cube (ODC) and rendered dynamically via OGC WMS:

$$
\text{NDVI} = \frac{\text{B08 (NIR)} - \text{B04 (Red)}}{\text{B08 (NIR)} + \text{B04 (Red)}}
$$

$$
\text{NDWI} = \frac{\text{B03 (Green)} - \text{B08 (NIR)}}{\text{B03 (Green)} + \text{B08 (NIR)}}
$$

$$
\text{BSI} = \frac{(\text{B12 (SWIR}_2\text{)} + \text{B04 (Red)}) - (\text{B08 (NIR)} + \text{B02 (Blue)})}{(\text{B12 (SWIR}_2\text{)} + \text{B04 (Red)}) + (\text{B08 (NIR)} + \text{B02 (Blue)})}
$$

$$
\Delta\text{UHI} = \bar{T}_{\text{Urban (Monas 14m)}} - \bar{T}_{\text{Rural (IPB Forest 680m)}} = 33.85^\circ\text{C} - 24.60^\circ\text{C} = \mathbf{+9.25^\circ\text{C}}
$$

---

## ⚠️ Known Limitations & Engineering Trade-offs

A transparent understanding of architectural boundaries distinguishes a production-minded WebGIS from a toy project:

1. **Zoom Level Gating (Z6+) for OGC WMS Products**:
   * *Rationale*: Sentinel-2 GeoMAD has a 10m spatial resolution spanning $>1.9 \text{ million km}^2$ of Indonesian territory. Querying raw 10m rasters at global zoom levels ($Z < 6$) would trigger millions of un-cached server-side pixel calculations on the Open Data Cube cluster.
   * *Mitigation*: The client enforces Zoom Level 6 gating (Island/Provincial scale) and provides automated one-click zoom guidance buttons (`[Perbesar ke Level 6]`) and interactive HUD alerts.

2. **Upstream OGC Server Availability (BIG Piksel)**:
   * *Behavior*: Occasional HTTP 500 or request timeouts may occur on experimental derivative products (such as Bare Soil Index for specific historical years) due to upstream backend maintenance at Badan Informasi Geospasial.
   * *Mitigation*: The application features an instant client-side retry mechanism (`retryCurrentProduct()`) and transparent user feedback instead of silent failure states.

3. **Google Earth Engine (GEE) Spatial Snapshot**:
   * *Scope*: GEE thermal time-series and Land Surface Temperature analyses are currently computed for the **Jakarta Metropolitan Area & West Java study region** (2020–2026) to provide instant client-side responsiveness without requiring paid cloud backend quotas.

4. **WebGL Layer Ordering & Canvas Buffer**:
   * *Mechanism*: To prevent raster layers from burying interactive vectors and measurements, `enforceLayerOrder()` runs deterministically after any source manipulation, while `preserveDrawingBuffer: true` enables direct high-resolution PNG exports.

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
