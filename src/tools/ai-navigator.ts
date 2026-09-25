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
  isFreeTier?: boolean;
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
   * Dispatches user prompt to the zero-bill Gemini Navigator serverless endpoint
   */
  public async sendPrompt(userPrompt: string): Promise<AINavigatorResponse> {
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

    try {
      const response = await fetch('/api/gemini-navigator', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || `Error ${response.status}: Permintaan AI gagal diproses.`;
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
        actions,
        isFreeTier: data.isFreeTier
      };
    } catch (err: any) {
      const errorMsg = `Koneksi gagal: ${err?.message || 'Tidak dapat terhubung ke server AI.'}`;
      logger.error('[AINavigator] Prompt error:', err);
      return {
        success: false,
        reply: errorMsg,
        actions: [],
        error: errorMsg
      };
    }
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
