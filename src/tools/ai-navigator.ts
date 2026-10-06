import type { MapManager } from '../map/map-manager';
import type { SidebarUI } from '../ui/sidebar';
import { showToast } from '../ui/toast';
import { logger } from '../utils/logger';

export interface AIAction {
  name: string;
  args: Record<string, any>;
  description?: string;
}

export interface AINavigatorResponse {
  success: boolean;
  reply: string;
  actions: AIAction[];
  error?: string;
}

export interface AINavigatorCallbacks {
  onStart?: () => void;
  onSuccess?: (response: AINavigatorResponse) => void;
  onError?: (errorMessage: string) => void;
  onActionExecuted?: (action: AIAction) => void;
}

export class AINavigator {
  private mapManager: MapManager;
  private sidebarUI?: SidebarUI | null;
  private measureToolRef?: any;
  private spatialAnalysisUIRef?: any;
  private swipeCompareUIRef?: any;
  private geeLoaderRef?: any;
  private pikselLoaderRef?: any;
  private customApiKey: string = '';

  constructor(mapManager: MapManager, sidebarUI?: SidebarUI | null) {
    this.mapManager = mapManager;
    this.sidebarUI = sidebarUI;
    this.loadCustomApiKey();
  }

  public setSidebarUI(ui: SidebarUI | null) {
    this.sidebarUI = ui;
  }

  public setMeasureTool(tool: any) {
    this.measureToolRef = tool;
  }

  public setSpatialAnalysisUI(ui: any) {
    this.spatialAnalysisUIRef = ui;
  }

  public setSwipeCompareUI(ui: any) {
    this.swipeCompareUIRef = ui;
  }

  public setGEELoader(loader: any) {
    this.geeLoaderRef = loader;
  }

  public setPikselLoader(loader: any) {
    this.pikselLoaderRef = loader;
  }

  private loadCustomApiKey() {
    try {
      this.customApiKey = localStorage.getItem('webgis_gemini_custom_key') || '';
    } catch {
      this.customApiKey = '';
    }
  }

  public setCustomApiKey(key: string) {
    this.customApiKey = key.trim();
    try {
      if (this.customApiKey) {
        localStorage.setItem('webgis_gemini_custom_key', this.customApiKey);
      } else {
        localStorage.removeItem('webgis_gemini_custom_key');
      }
    } catch (e) {
      logger.warn('[AINavigator] Failed to persist custom API key:', e);
    }
  }

  public getCustomApiKey(): string {
    return this.customApiKey;
  }

  /**
   * Dispatches user prompt to the Gemini Navigator serverless endpoint
   */
  public async sendPrompt(
    userPrompt: string,
    history?: Array<{ role: 'user' | 'model'; text: string }>
  ): Promise<AINavigatorResponse> {
    const map = this.mapManager.getMap();

    // Collect current spatial context
    let center: [number, number] = [117.89, -2.55];
    let zoom = 4.5;
    let pitch = 0;
    let bearing = 0;

    if (map) {
      const c = map.getCenter();
      center = [c.lng, c.lat];
      zoom = map.getZoom();
      pitch = map.getPitch();
      bearing = map.getBearing();
    }

    const payload = {
      prompt: userPrompt,
      history: history || [],
      context: {
        center,
        zoom,
        pitch,
        bearing,
        basemapId: this.mapManager.getCurrentBasemapId(),
        projection: this.mapManager.getProjection()
      }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.customApiKey) {
      headers['X-Gemini-Key'] = this.customApiKey;
    }

    const sendRequest = async (isRetry = false): Promise<AINavigatorResponse> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 22000);

      try {
        const response = await fetch('/api/gemini-navigator', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // If 503 or 504 on first attempt, retry once after 1s
        if (!isRetry && (response.status === 503 || response.status === 504)) {
          logger.warn(`[AINavigator] Received ${response.status}, retrying once in 1s...`);
          await new Promise(res => setTimeout(res, 1000));
          return sendRequest(true);
        }

        const rawText = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          const snippet = rawText.replace(/<[^>]*>?/gm, '').slice(0, 160).trim();
          const errorMsg = `Respon server (${response.status}): ${snippet || 'Format respons bukan JSON.'}`;
          return {
            success: false,
            reply: errorMsg,
            actions: [],
            error: errorMsg
          };
        }

        if (!response.ok) {
          const errorMsg = data?.error || `Error ${response.status}: Permintaan AI gagal diproses.`;
          return {
            success: false,
            reply: errorMsg,
            actions: [],
            error: errorMsg
          };
        }

        // Execute returned function calling actions
        const actions: AIAction[] = Array.isArray(data.actions) ? data.actions : [];
        for (const action of actions) {
          await this.executeAction(action);
        }

        return {
          success: true,
          reply: data.reply || 'Perintah berhasil dijalankan.',
          actions
        };
      } catch (err: any) {
        clearTimeout(timeoutId);

        // Auto retry once on network error or abort
        if (!isRetry) {
          logger.warn('[AINavigator] Transient network error, retrying once...', err);
          await new Promise(res => setTimeout(res, 1000));
          return sendRequest(true);
        }

        const isTimeout = err?.name === 'AbortError' || err?.message?.toLowerCase().includes('timeout') || err?.message?.toLowerCase().includes('aborted');
        const errorMsg = isTimeout
          ? 'Waktu tunggu habis (server AI sedang sibuk). Silakan tanyakan kembali.'
          : `Koneksi gagal: ${err?.message || 'Tidak dapat terhubung ke server AI.'}`;

        logger.error('[AINavigator] Prompt error:', err);
        return {
          success: false,
          reply: errorMsg,
          actions: [],
          error: errorMsg
        };
      }
    };

    return sendRequest(false);
  }

  /**
   * Executes map and interface actions instructed by Gemini
   */
  public async executeAction(action: AIAction): Promise<void> {
    const map = this.mapManager.getMap();
    const { name, args } = action;

    switch (name) {
      case 'flyToLocation': {
        if (!map) return;
        const lng = Number(args.longitude);
        const lat = Number(args.latitude);
        const zoom = Number(args.zoom) || 12;
        const pitch = Number(args.pitch) || 0;
        const bearing = Number(args.bearing) || 0;

        if (!isNaN(lng) && !isNaN(lat)) {
          map.flyTo({
            center: [lng, lat],
            zoom: Math.min(Math.max(zoom, 2), 19),
            pitch: Math.min(Math.max(pitch, 0), 75),
            bearing: (bearing % 360 + 360) % 360,
            essential: true,
            duration: 2500
          });
          showToast(`Terbang ke ${args.locationName || 'lokasi'}...`, 'info', 3000);
        }
        break;
      }

      case 'switchBasemap': {
        const basemapId = args.basemapId;
        if (basemapId) {
          await this.mapManager.setBasemap(basemapId);
          showToast(`Peta dasar diubah ke: ${basemapId}`, 'success', 2500);
        }
        break;
      }

      case 'toggleProjection': {
        const projection = args.projection as 'globe' | 'mercator';
        if (projection === 'globe' || projection === 'mercator') {
          this.mapManager.setProjection(projection);
          showToast(`Proyeksi peta diubah ke: ${projection === 'globe' ? 'Bola Bumi 3D' : 'Mercator 2D'}`, 'info', 2500);
        }
        break;
      }

      case 'activateTool': {
        const tool = args.toolName;
        switch (tool) {
          case 'measure':
            if (this.sidebarUI) {
              this.sidebarUI.setActiveTab('measure');
              this.sidebarUI.setOpen(true);
            }
            if (this.measureToolRef?.activate) {
              this.measureToolRef.activate('distance');
            }
            showToast('Alat ukur jarak diaktifkan', 'info', 2500);
            break;

          case 'spatial-analysis':
            if (this.sidebarUI) {
              this.sidebarUI.setActiveTab('analysis');
              this.sidebarUI.setOpen(true);
            }
            if (this.spatialAnalysisUIRef) {
              logger.info('[AINavigator] Spatial analysis UI active');
            }
            showToast('Panel Analisis Spasial dibuka', 'info', 2500);
            break;

          case 'swipe-compare':
            if (this.swipeCompareUIRef?.toggle) {
              this.swipeCompareUIRef.toggle();
            }
            showToast('Mode Komparasi Layar Swipe diaktifkan', 'info', 2500);
            break;

          case 'basemap-gallery':
            if (this.sidebarUI) {
              this.sidebarUI.setActiveTab('map');
              this.sidebarUI.setOpen(true);
            }
            break;

          case 'reset-view': {
            if (map) {
              map.flyTo({
                center: [117.89, -2.55],
                zoom: 4.5,
                pitch: 0,
                bearing: 0,
                duration: 2000
              });
              showToast('Tampilan peta dikembalikan ke Nusantara', 'info', 2500);
            }
            break;
          }

          case 'attribute-table': {
            const btnAttr = document.getElementById('more-item-attr-table');
            if (btnAttr) btnAttr.click();
            break;
          }

          case 'start-tour': {
            const btnTour = document.getElementById('btn-start-tour');
            if (btnTour) btnTour.click();
            break;
          }
        }
        break;
      }

      case 'toggleLayer': {
        const layerId = (args.layerId || '').trim();
        const visible = args.visible !== false;

        if (!layerId) break;

        // 1. Google Earth Engine layers: precipitation, landcover, lst-day, lst-night, stations
        if (['precipitation', 'rainfall', 'curah-hujan', 'gpm', 'landcover', 'lc', 'lst-day', 'lst-night', 'stations', 'poi', 'surface-temp'].includes(layerId)) {
          if (this.geeLoaderRef?.toggleLayer) {
            await this.geeLoaderRef.toggleLayer(layerId, visible);
          }
          if (visible && this.sidebarUI) {
            this.sidebarUI.setActiveTab('gee');
          }

          const labels: Record<string, string> = {
            precipitation: 'Curah Hujan Harian Satelit (NASA GPM IMERG)',
            landcover: 'Tutupan Lahan Sentinel-2 10m (Esri/Impact Observatory)',
            'lst-day': 'Suhu Permukaan Daratan Siang (MODIS LST Day 1km)',
            'lst-night': 'Suhu Permukaan Daratan Malam (MODIS LST Night 1km)',
            stations: '18 Stasiun & Titik Observasi Iklim'
          };
          const label = labels[layerId] || layerId;
          showToast(`Lapisan ${label} ${visible ? 'diaktifkan di peta' : 'disembunyikan'}.`, 'success', 3000);
          break;
        }

        // 2. Open Data Cube Tile Grid
        if (layerId === 'tile-grid' || layerId === 'grid') {
          if (this.pikselLoaderRef?.setGridVisible) {
            this.pikselLoaderRef.setGridVisible(visible);
          }
          showToast(`Batas Grid Ubin Open Data Cube ${visible ? 'ditampilkan' : 'disembunyikan'}.`, 'info', 2500);
          break;
        }

        // 3. BIG Piksel Satellite products: s2-geomad-rgb, s2-ndvi, s2-ndwi, flood-hazard-rp02, etc.
        if (this.pikselLoaderRef?.setActiveProduct) {
          const pikselAliases: Record<string, string> = {
            'hazard-flood': 'flood-hazard-rp02',
            'flood-hazard': 'flood-hazard-rp02',
            'flood': 'flood-hazard-rp02',
            'banjir': 'flood-hazard-rp02',
            'bahaya-banjir': 'flood-hazard-rp02',
            'ndvi': 's2-ndvi',
            's2-indices-ndvi': 's2-ndvi',
            'ndwi': 's2-ndwi',
            's2-indices-ndwi': 's2-ndwi',
            'ndbi': 's2-ndbi',
            's2-indices-ndbi': 's2-ndbi',
            'ndmi': 's2-ndmi',
            's2-indices-ndmi': 's2-ndmi',
            'rgb': 's2-geomad-rgb',
            'nir': 's2-geomad-nir',
            'landsat': 'ls9-sr',
            'landsat-9': 'ls9-sr'
          };
          const resolvedProductId = pikselAliases[layerId] || layerId;

          this.pikselLoaderRef.setActiveProduct(visible ? resolvedProductId : null);
          if (visible) {
            this.pikselLoaderRef.autoFlyToOptimalView?.(resolvedProductId, true);
          }
          if (visible && this.sidebarUI) {
            this.sidebarUI.setActiveTab('piksel');
          }

          const pikselLabels: Record<string, string> = {
            's2-geomad-rgb': 'Citra Satelit Sentinel-2 True Color 10m',
            's2-geomad-nir': 'Citra Satelit False Color NIR 10m',
            's2-ndvi': 'Indeks Kerapatan Vegetasi NDVI (Sentinel-2 10m)',
            's2-ndwi': 'Indeks Badan Air Permukaan NDWI (Sentinel-2 10m)',
            's2-ndbi': 'Indeks Area Terbangun NDBI (Sentinel-2 10m)',
            's2-ndmi': 'Indeks Kelembapan Kanopi & Gambut NDMI (Sentinel-2 10m)',
            'flood-hazard-rp02': 'Peta Bahaya Banjir PU 2-Tahun',
            'flood-hazard-rp10': 'Peta Bahaya Banjir PU 10-Tahun',
            'hazard-flood': 'Peta Pemodelan Bahaya Banjir PU 2-Tahun',
            'ls9-sr': 'Citra Satelit Landsat 9 Reflektansi 30m',
            's2-count': 'Kualitas Data (Scene Count)'
          };
          const label = pikselLabels[resolvedProductId] || pikselLabels[layerId] || resolvedProductId;
          showToast(`Lapisan Satelit ${label} ${visible ? 'diaktifkan di peta' : 'dinonaktifkan'}.`, 'success', 3000);
        }
        break;
      }

      case 'filterStations': {
        if (!map) return;
        const query = (args.query || '').toLowerCase().trim();
        const minElev = args.minElevation !== undefined ? Number(args.minElevation) : null;
        const maxElev = args.maxElevation !== undefined ? Number(args.maxElevation) : null;

        try {
          const res = await fetch('/data/gee_cfsv2_stations.geojson');
          if (res.ok) {
            const data = await res.json();
            const matched = data.features?.filter((f: any) => {
              const p = f.properties || {};
              const matchName = !query ||
                (p.name && p.name.toLowerCase().includes(query)) ||
                (p.province && p.province.toLowerCase().includes(query)) ||
                (p.island && p.island.toLowerCase().includes(query));

              const elev = p.elevation_m !== undefined ? p.elevation_m : 0;
              const matchMin = minElev === null || elev >= minElev;
              const matchMax = maxElev === null || elev <= maxElev;

              return matchName && matchMin && matchMax;
            });

            if (matched && matched.length > 0) {
              const first = matched[0];
              const coords = first.geometry?.coordinates;
              if (coords) {
                map.flyTo({
                  center: coords,
                  zoom: 11,
                  pitch: 45,
                  duration: 2500
                });
                showToast(`Ditemukan ${matched.length} stasiun cuaca cocok. Terbang ke ${first.properties?.name || 'stasiun'}...`, 'success', 3500);
              }
            } else {
              showToast(`Tidak ditemukan stasiun yang cocok dengan kriteria "${query}".`, 'warning', 3000);
            }
          }
        } catch (e) {
          logger.warn('[AINavigator] Failed to filter stations:', e);
        }
        break;
      }

      default:
        logger.info('[AINavigator] Unhandled action:', action);
    }
  }
}
