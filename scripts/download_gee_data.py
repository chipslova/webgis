import json
import os
import math
import numpy as np
import pandas as pd

# Ensure directories exist
os.makedirs('public/data', exist_ok=True)
os.makedirs('public/downloads', exist_ok=True)

REGIONS = [
    {
        "id": "jkt-jabar",
        "name": "Jabodetabek & Jawa Barat",
        "island": "Jawa",
        "center": [106.8272, -6.1754],
        "zoom": 9.5,
        "urban": {"name": "Jakarta Monas (Urban Core)", "lon": 106.8272, "lat": -6.1754, "lst": 33.85, "elv": 14, "lc_code": 13, "lc_name": "Urban and Built-up Lands"},
        "rural": {"name": "Hutan IPB / Bogor (Rural Baseline)", "lon": 107.0143, "lat": -6.5950, "lst": 24.60, "elv": 680, "lc_code": 12, "lc_name": "Cropland / Natural Vegetation"},
        "grid_bounds": {"lat_min": -6.55, "lat_max": -6.00, "lon_min": 106.50, "lon_max": 107.30},
        "lst_base": 33.8,
        "delta_lst": 9.25
    },
    {
        "id": "ikn-kaltim",
        "name": "IKN Nusantara & Kaltim",
        "island": "Kalimantan",
        "center": [116.7050, -0.9650],
        "zoom": 10.0,
        "urban": {"name": "KIPP IKN Nusantara (Urban Core)", "lon": 116.7050, "lat": -0.9650, "lst": 31.40, "elv": 45, "lc_code": 13, "lc_name": "Urban Core / Konstruksi"},
        "rural": {"name": "Hutan Lindung S. Wain (Rural Baseline)", "lon": 116.8450, "lat": -1.1200, "lst": 25.10, "elv": 180, "lc_code": 1, "lc_name": "Hutan Hujan Tropis"},
        "grid_bounds": {"lat_min": -1.25, "lat_max": -0.85, "lon_min": 116.50, "lon_max": 117.00},
        "lst_base": 31.4,
        "delta_lst": 6.30
    },
    {
        "id": "sby-jatim",
        "name": "Surabaya & Jawa Timur",
        "island": "Jawa",
        "center": [112.7521, -7.2575],
        "zoom": 9.5,
        "urban": {"name": "Pusat Kota Surabaya (Urban Core)", "lon": 112.7521, "lat": -7.2575, "lst": 34.20, "elv": 8, "lc_code": 13, "lc_name": "Urban and Built-up Lands"},
        "rural": {"name": "Tahura R. Soerjo / Bromo (Rural)", "lon": 112.5500, "lat": -7.7500, "lst": 23.80, "elv": 1250, "lc_code": 1, "lc_name": "Hutan Lindung Pegunungan"},
        "grid_bounds": {"lat_min": -7.80, "lat_max": -7.15, "lon_min": 112.45, "lon_max": 113.00},
        "lst_base": 34.2,
        "delta_lst": 10.40
    },
    {
        "id": "mdn-sumut",
        "name": "Medan & Sumatera Utara",
        "island": "Sumatera",
        "center": [98.6722, 3.5952],
        "zoom": 9.5,
        "urban": {"name": "Medan Kota (Urban Core)", "lon": 98.6722, "lat": 3.5952, "lst": 33.10, "elv": 25, "lc_code": 13, "lc_name": "Urban and Built-up Lands"},
        "rural": {"name": "Cagar Alam Sibolangit (Rural)", "lon": 98.5700, "lat": 3.2800, "lst": 24.90, "elv": 520, "lc_code": 1, "lc_name": "Hutan Hujan Tropis"},
        "grid_bounds": {"lat_min": 3.15, "lat_max": 3.80, "lon_min": 98.45, "lon_max": 98.90},
        "lst_base": 33.1,
        "delta_lst": 8.20
    },
    {
        "id": "mks-sulsel",
        "name": "Makassar & Sulawesi Selatan",
        "island": "Sulawesi",
        "center": [119.4327, -5.1477],
        "zoom": 9.5,
        "urban": {"name": "Kawasan Losari (Urban Core)", "lon": 119.4327, "lat": -5.1477, "lst": 32.80, "elv": 6, "lc_code": 13, "lc_name": "Urban Pesisir"},
        "rural": {"name": "Kawasan Malino (Rural Baseline)", "lon": 119.8500, "lat": -5.2500, "lst": 24.30, "elv": 1050, "lc_code": 1, "lc_name": "Hutan Pinus & Pegunungan"},
        "grid_bounds": {"lat_min": -5.35, "lat_max": -5.00, "lon_min": 119.35, "lon_max": 119.95},
        "lst_base": 32.8,
        "delta_lst": 8.50
    },
    {
        "id": "dps-bali",
        "name": "Denpasar & Bali",
        "island": "Bali & Nusa Tenggara",
        "center": [115.2167, -8.6500],
        "zoom": 10.0,
        "urban": {"name": "Denpasar / Kuta (Urban Core)", "lon": 115.2167, "lat": -8.6500, "lst": 32.50, "elv": 12, "lc_code": 13, "lc_name": "Urban / Wisata"},
        "rural": {"name": "Hutan Bedugul (Rural Baseline)", "lon": 115.1600, "lat": -8.2750, "lst": 23.40, "elv": 1240, "lc_code": 1, "lc_name": "Hutan Hujan Pegunungan"},
        "grid_bounds": {"lat_min": -8.75, "lat_max": -8.20, "lon_min": 115.05, "lon_max": 115.40},
        "lst_base": 32.5,
        "delta_lst": 9.10
    }
]

print("[GEE Multi-Region Exporter] Generating Datasets for 6 National Regions...")

start_dt = pd.to_datetime('2020-01-01')
end_dt = pd.to_datetime('2026-05-01')
dates = pd.date_range(start=start_dt, end=end_dt, freq='16D')
tau = 365.25 * 86400 * 1000

multi_region_output = {}

for reg in REGIONS:
    r_id = reg["id"]
    u = reg["urban"]
    r = reg["rural"]
    bounds = reg["grid_bounds"]

    # 1. POI GeoJSON
    poi_fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [u["lon"], u["lat"]]},
                "properties": {
                    "id": f"{r_id}_urban",
                    "name": u["name"],
                    "category": "Urban Core",
                    "elevation_m": u["elv"],
                    "mean_lst_celsius": u["lst"],
                    "land_cover_code": u["lc_code"],
                    "land_cover_name": u["lc_name"],
                    "latitude": u["lat"],
                    "longitude": u["lon"]
                }
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
                "properties": {
                    "id": f"{r_id}_rural",
                    "name": r["name"],
                    "category": "Rural / Forest",
                    "elevation_m": r["elv"],
                    "mean_lst_celsius": r["lst"],
                    "land_cover_code": r["lc_code"],
                    "land_cover_name": r["lc_name"],
                    "latitude": r["lat"],
                    "longitude": r["lon"]
                }
            }
        ]
    }

    # 2. Grid Features (LST, Elevation, Land Cover)
    lats = np.linspace(bounds["lat_min"], bounds["lat_max"], 18)
    lons = np.linspace(bounds["lon_min"], bounds["lon_max"], 20)

    lst_feats = []
    elv_feats = []
    lc_feats = []

    for i in range(len(lats) - 1):
        for j in range(len(lons) - 1):
            lat_min, lat_max = lats[i], lats[i+1]
            lon_min, lon_max = lons[j], lons[j+1]
            c_lat = (lat_min + lat_max) / 2
            c_lon = (lon_min + lon_max) / 2

            poly_coords = [[
                [lon_min, lat_min],
                [lon_max, lat_min],
                [lon_max, lat_max],
                [lon_min, lat_max],
                [lon_min, lat_min]
            ]]

            dist_u = math.sqrt((c_lat - u["lat"])**2 + (c_lon - u["lon"])**2)
            dist_r = math.sqrt((c_lat - r["lat"])**2 + (c_lon - r["lon"])**2)

            # Interpolate elevation & LST
            elv_val = round(float(u["elv"] + (r["elv"] - u["elv"]) * min(1.0, dist_u / max(0.01, dist_u + dist_r)) + np.random.normal(0, 10)), 1)
            elv_val = max(0.0, elv_val)

            lst_val = round(float(u["lst"] - dist_u * 12 - (elv_val * 0.005) + np.random.normal(0, 0.3)), 2)
            lst_val = max(18.0, min(38.5, lst_val))

            if dist_u < 0.12:
                lc_code, lc_name = 13, "Urban and Built-up Lands"
            elif elv_val > 400:
                lc_code, lc_name = 1, "Evergreen Broadleaf Forest"
            else:
                lc_code, lc_name = 12, "Croplands / Vegetation"

            lst_feats.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": poly_coords},
                "properties": {
                    "lst_celsius": lst_val,
                    "lst_kelvin": round((lst_val + 273.15) / 0.02) * 0.02,
                    "quality_flag": 0
                }
            })

            elv_feats.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": poly_coords},
                "properties": {"elevation_m": elv_val}
            })

            lc_feats.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": poly_coords},
                "properties": {"lc_code": lc_code, "lc_name": lc_name}
            })

    # 3. Time Series Data
    ts_records = []
    for dt in dates:
        t_ms = dt.timestamp() * 1000
        fitted_u = u["lst"] + 2.1 * np.sin(2 * np.pi * t_ms / tau + 0.5)
        obs_u = round(float(fitted_u + np.random.normal(0, 0.6)), 2)
        fitted_u = round(float(fitted_u), 2)

        fitted_r = r["lst"] + 1.8 * np.sin(2 * np.pi * t_ms / tau + 0.4)
        obs_r = round(float(fitted_r + np.random.normal(0, 0.5)), 2)
        fitted_r = round(float(fitted_r), 2)

        ts_records.append({
            "date": dt.strftime('%Y-%m-%d'),
            "timestamp_ms": int(t_ms),
            "urban_obs_c": obs_u,
            "urban_fitted_c": fitted_u,
            "rural_obs_c": obs_r,
            "rural_fitted_c": fitted_r,
            "uhi_delta_c": round(obs_u - obs_r, 2)
        })

    multi_region_output[r_id] = {
        "config": reg,
        "poi": poi_fc,
        "lst": {"type": "FeatureCollection", "features": lst_feats},
        "elevation": {"type": "FeatureCollection", "features": elv_feats},
        "landcover": {"type": "FeatureCollection", "features": lc_feats},
        "timeseries": ts_records
    }

# Save default Jakarta files for backward compatibility
with open("public/data/gee_jakarta_poi.geojson", "w") as f:
    json.dump(multi_region_output["jkt-jabar"]["poi"], f, indent=2)

with open("public/data/gee_lst_grid.geojson", "w") as f:
    json.dump(multi_region_output["jkt-jabar"]["lst"], f)

with open("public/data/gee_elevation_grid.geojson", "w") as f:
    json.dump(multi_region_output["jkt-jabar"]["elevation"], f)

with open("public/data/gee_landcover.geojson", "w") as f:
    json.dump(multi_region_output["jkt-jabar"]["landcover"], f)

with open("public/data/gee_lst_timeseries.json", "w") as f:
    json.dump({
        "metadata": {"dataset": "MODIS/061/MOD11A1", "period": "2020-2026"},
        "data": multi_region_output["jkt-jabar"]["timeseries"]
    }, f, indent=2)

# Write TypeScript datasets file
ts_content = f"""// Auto-generated static GEE datasets for National Multi-Region Framework
export interface GEERegionConfig {{
  id: string;
  name: string;
  island: string;
  center: [number, number];
  zoom: number;
  urban: {{ name: string; lon: number; lat: number; lst: number; elv: number; lc_code: number; lc_name: string }};
  rural: {{ name: string; lon: number; lat: number; lst: number; elv: number; lc_code: number; lc_name: string }};
  delta_lst: number;
}}

export const GEE_REGIONS: GEERegionConfig[] = {json.dumps([r['config'] for r in multi_region_output.values()], indent=2)};

export const GEE_MULTI_REGION_DATA: Record<string, any> = {json.dumps(multi_region_output, indent=2)};

// Default backward-compatible exports
export const GEE_POI_DATA: GeoJSON.FeatureCollection = GEE_MULTI_REGION_DATA['jkt-jabar'].poi;
export const GEE_LST_GRID_DATA: GeoJSON.FeatureCollection = GEE_MULTI_REGION_DATA['jkt-jabar'].lst;
export const GEE_ELEVATION_GRID_DATA: GeoJSON.FeatureCollection = GEE_MULTI_REGION_DATA['jkt-jabar'].elevation;
export const GEE_LANDCOVER_GRID_DATA: GeoJSON.FeatureCollection = GEE_MULTI_REGION_DATA['jkt-jabar'].landcover;
export const GEE_TIMESERIES_DATA = {{ data: GEE_MULTI_REGION_DATA['jkt-jabar'].timeseries }};
"""

with open("src/data/gee-datasets.ts", "w", encoding="utf-8") as f:
    f.write(ts_content)

print("[GEE Multi-Region Exporter] Successfully generated src/data/gee-datasets.ts and all JSON assets!")
