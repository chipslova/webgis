import * as maplibregl from 'maplibre-gl';
import { MapManager } from '../map/map-manager';
import { PikselLoader } from './piksel-loader';
import { GEELoader } from './gee-loader';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config/basemaps';

export interface LoadingState {
  isLoading: boolean;
  title: string;
  subtitle: string;
  source?: string;
  isZoomOut?: boolean;
}

export class MapLoadingIndicator {
  private map: maplibregl.Map;
  private mapManager?: MapManager;
  private pikselLoader?: PikselLoader;
  private geeLoader?: GEELoader;

  private progressBarEl: HTMLElement | null = null;
  private pillEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private statusContainerEl: HTMLElement | null = null;

  private activeRequests = 0;
  private isVisible = false;
  private showTimer: any = null;
  private slowServerTimer: any = null;
  private safetyTimeoutTimer: any = null;
  private hideTimer: any = null;

  private lastZoom = 0;
  private isZoomOut = false;
  private manualLoadingCount = 0;

  constructor(
    map: maplibregl.Map,
    mapManager?: MapManager,
    pikselLoader?: PikselLoader,
    geeLoader?: GEELoader
  ) {
    this.map = map;
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;

    this.lastZoom = typeof map.getZoom === 'function' ? map.getZoom() : 4.5;

    this.initDOM();
    this.bindMapEvents();
  }

  private initDOM() {
    this.progressBarEl = document.getElementById('map-loading-progress-bar');
    this.pillEl = document.getElementById('map-tile-loading-pill');
    this.titleEl = document.getElementById('map-tile-loading-title');
    this.subEl = document.getElementById('map-tile-loading-sub');
    this.statusContainerEl = document.getElementById('status-tile-loader');
    this.statusTextEl = document.getElementById('status-tile-loader-text');
  }

  private bindMapEvents() {
    if (!this.map || typeof this.map.on !== 'function') return;

    // 1. Detect Zoom Direction
    this.map.on('zoomstart', () => {
      const currentZoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : this.lastZoom;
      this.isZoomOut = currentZoom < this.lastZoom;
      this.lastZoom = currentZoom;
      this.triggerLoading();
    });

    this.map.on('zoomend', () => {
      this.lastZoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : this.lastZoom;
    });

    // 2. Data & Tile Loading Lifecycle
    this.map.on('dataloading', (e: any) => {
      if (e.dataType === 'source' || e.dataType === 'tile' || e.dataType === 'style') {
        this.activeRequests++;
        this.triggerLoading();
      }
    });

    this.map.on('data', (e: any) => {
      if (e.dataType === 'source' || e.dataType === 'tile' || e.dataType === 'style') {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        if (this.activeRequests === 0 && !this.manualLoadingCount) {
          this.scheduleHide();
        }
      }
    });

    // 3. Map Idle: All tiles and renders in view completed
    this.map.on('idle', () => {
      this.activeRequests = 0;
      if (!this.manualLoadingCount) {
        this.scheduleHide();
      }
    });

    // 4. Map Error: Safeguard against stuck indicators on tile 404 / timeouts
    this.map.on('error', () => {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      if (this.activeRequests === 0 && !this.manualLoadingCount) {
        this.scheduleHide();
      }
    });

    // 5. Basemap Selection Change Listener
    if (typeof window !== 'undefined') {
      window.addEventListener('webgis:basemap-selected', (e: any) => {
        const bmId = e.detail?.basemapId;
        this.triggerLoading(bmId);
      });
    }

    // 6. External Product Change Listeners
    if (this.pikselLoader) {
      this.pikselLoader.onLayersChange(() => {
        if (this.pikselLoader?.getActiveProduct()) {
          this.triggerLoading();
        }
      });
    }

    if (this.geeLoader) {
      this.geeLoader.onLayersChange(() => {
        this.triggerLoading();
      });
    }
  }

  /**
   * Resolves contextual loading messages based on active basemap and tools
   */
  public resolveContextualMessages(targetBasemapId?: string): { title: string; subtitle: string } {
    const currentBmId = targetBasemapId || this.mapManager?.getCurrentBasemapId() || DEFAULT_BASEMAP_ID;
    const bm = BASEMAPS.find(b => b.id === currentBmId);
    const bmName = bm ? bm.name : 'Peta Dasar';

    let title = `Memuat Ubin ${bmName}...`;
    let subtitle = this.isZoomOut
      ? 'Mengunduh data tinjauan wilayah (Zoom Out)...'
      : 'Mengunduh data ubin resolusi tinggi...';

    if (currentBmId === 'big-rbi') {
      title = 'Memuat Ubin Rupabumi Indonesia (BIG)...';
      subtitle = this.isZoomOut
        ? 'Mengunduh ubin tinjauan wilayah nasional dari server BIG...'
        : 'Mengunduh ubin peta topografi resmi BIG...';
    } else if (this.pikselLoader && this.pikselLoader.getActiveProduct()) {
      const activeProd = this.pikselLoader.getActiveProduct();
      title = `Memuat Citra Satelit ${activeProd?.name || 'Sentinel-2'}...`;
      subtitle = 'Mengunduh data ubin WMS Piksel BIG...';
    } else if (this.geeLoader && (this.geeLoader.isLayerActive('lst') || this.geeLoader.isLayerActive('precipitation'))) {
      title = 'Memproses Analisis Google Earth Engine...';
      subtitle = 'Mengunduh data serverless Google Earth Engine...';
    }

    return { title, subtitle };
  }

  /**
   * Triggers loading indicator with short debounce to avoid flicker on cached tiles
   */
  public triggerLoading(targetBasemapId?: string) {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (!this.showTimer && !this.isVisible) {
      this.showTimer = setTimeout(() => {
        this.renderShow(targetBasemapId);
      }, 70);
    } else if (this.isVisible) {
      const { title, subtitle } = this.resolveContextualMessages(targetBasemapId);
      this.updateContent(title, subtitle);
    }
  }

  /**
   * Displays the loading visual components
   */
  private renderShow(targetBasemapId?: string) {
    this.isVisible = true;
    this.showTimer = null;

    const { title, subtitle } = this.resolveContextualMessages(targetBasemapId);

    // 1. Top Glowing Progress Bar
    if (this.progressBarEl) {
      this.progressBarEl.classList.add('is-active');
    }

    // 2. Floating Map Loading Pill
    if (this.pillEl) {
      this.pillEl.style.display = 'flex';
      this.pillEl.classList.remove('is-hiding');
      this.updateContent(title, subtitle);
    }

    // 3. Status Bar Tile Loader
    if (this.statusContainerEl) {
      this.statusContainerEl.style.display = 'inline-flex';
    }
    if (this.statusTextEl) {
      this.statusTextEl.innerText = 'Memuat ubin...';
    }

    // 4. Slow Server Notice (e.g. BIG RBI server processing delays)
    if (this.slowServerTimer) clearTimeout(this.slowServerTimer);
    this.slowServerTimer = setTimeout(() => {
      if (this.isVisible) {
        const currentBmId = targetBasemapId || this.mapManager?.getCurrentBasemapId() || DEFAULT_BASEMAP_ID;
        if (currentBmId === 'big-rbi') {
          this.updateContent(
            'Memuat Ubin Rupabumi Indonesia (BIG)...',
            '⏳ Server BIG sedang memproses ubin (zoom out memerlukan beberapa detik)...'
          );
        } else {
          this.updateContent(
            title,
            '⏳ Mengunduh ubin dari server eksternal, mohon tunggu sebentar...'
          );
        }
      }
    }, 2400);

    // 5. Safety Maximum Timeout (Dismiss after 12 seconds so indicator never stays forever)
    if (this.safetyTimeoutTimer) clearTimeout(this.safetyTimeoutTimer);
    this.safetyTimeoutTimer = setTimeout(() => {
      this.scheduleHide(true);
    }, 12000);
  }

  private updateContent(title: string, subtitle: string) {
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.subEl) this.subEl.textContent = subtitle;
  }

  /**
   * Smoothly hides the loading components
   */
  private scheduleHide(immediate: boolean = false) {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.slowServerTimer) {
      clearTimeout(this.slowServerTimer);
      this.slowServerTimer = null;
    }
    if (this.safetyTimeoutTimer) {
      clearTimeout(this.safetyTimeoutTimer);
      this.safetyTimeoutTimer = null;
    }

    if (!this.isVisible) return;

    if (this.hideTimer) clearTimeout(this.hideTimer);

    const delay = immediate ? 0 : 200;
    this.hideTimer = setTimeout(() => {
      // Show brief success badge if finished normally
      if (!immediate && this.titleEl) {
        this.titleEl.textContent = '✓ Ubin Selesai Dimuat';
        if (this.subEl) this.subEl.textContent = 'Tampilan peta telah optimal';
        if (this.statusTextEl) this.statusTextEl.innerText = 'Siap';
      }

      if (this.progressBarEl) {
        this.progressBarEl.classList.remove('is-active');
      }
      if (this.pillEl) {
        this.pillEl.classList.add('is-hiding');
      }

      setTimeout(() => {
        if (this.pillEl) {
          this.pillEl.style.display = 'none';
          this.pillEl.classList.remove('is-hiding');
        }
        if (this.statusContainerEl) {
          this.statusContainerEl.style.display = 'none';
        }
        this.isVisible = false;
        this.isZoomOut = false;
        this.hideTimer = null;
      }, immediate ? 0 : 250);
    }, delay);
  }

  /**
   * Manually trigger loading state for custom features (GeoJSON upload, Shapefile, Analysis)
   */
  public showManual(title: string, subtitle: string) {
    this.manualLoadingCount++;
    this.triggerLoading();
    setTimeout(() => {
      this.updateContent(title, subtitle);
    }, 80);
  }

  public hideManual() {
    this.manualLoadingCount = Math.max(0, this.manualLoadingCount - 1);
    if (this.manualLoadingCount === 0 && this.activeRequests === 0) {
      this.scheduleHide();
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }
}
