"""
Google Earth Engine (GEE) Real Land Surface Temperature (LST) Bridge
Redirects to MODIS Terra + Aqua 1km LST processing engine (MODIS/061/MOD11A1 & MYD11A1).
"""

from sync_modis_lst import fetch_modis_lst

if __name__ == "__main__":
    fetch_modis_lst()
