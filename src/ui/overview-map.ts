import { Map as MapLibreMap } from 'maplibre-gl';
import { logger } from '../utils/logger';

// Bounding box of the Overview Map (Indonesia & surrounding ASEAN region)
const OVERVIEW_BBOX = {
  minLng: 94.0,
  maxLng: 142.0,
  minLat: -11.5,
  maxLat: 6.5
};

export class OverviewMapUI {
  private map: MapLibreMap | null = null;
  private container: HTMLElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private viewportRect: SVGRectElement | null = null;
  private centerDot: SVGCircleElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private isCollapsed: boolean = false;
  private isBound: boolean = false;
  private moveListener: (() => void) | null = null;

  constructor(map?: MapLibreMap | null) {
    if (map) {
      this.setMap(map);
    }
  }

  public setMap(map: MapLibreMap) {
    this.map = map;
    this.initDOM();
    this.bindEvents();
    this.updateViewport();
  }

  private initDOM() {
    let container = document.getElementById('overview-locator-map');
    if (!container) {
      container = document.createElement('div');
      container.id = 'overview-locator-map';
      container.className = 'overview-locator-map glass-panel';
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', 'Peta Lokator Inset Nusantara');

      container.innerHTML = `
        <div class="overview-header">
          <div class="overview-title-group">
            <span class="overview-icon" aria-hidden="true">🧭</span>
            <span class="overview-title">LOKATOR NUSANTARA</span>
          </div>
          <button id="btn-toggle-overview-collapse" class="overview-toggle-btn" title="Kecilkan / Besarkan Lokator" aria-label="Kecilkan peta lokator">
            <svg class="overview-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
        <div class="overview-body" id="overview-body">
          <svg id="overview-svg" class="overview-svg" viewBox="0 0 240 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <!-- Background & Gridlines -->
            <rect width="240" height="100" class="overview-bg-ocean" rx="4"></rect>
            <!-- Equator Line (Lat 0) -->
            <line x1="0" y1="36.1" x2="240" y2="36.1" class="overview-equator-line" stroke-dasharray="2,2"></line>
            
            <!-- Simplified Archipelagic Landmass Contours -->
            <g class="overview-islands" fill="currentColor">
              <!-- Sumatra -->
              <path class="overview-island" d="M 12,32 L 20,24 L 38,40 L 52,58 L 57,68 L 50,71 L 32,53 L 15,36 Z"></path>
              <!-- Java -->
              <path class="overview-island" d="M 52,72 L 75,74 L 98,76 L 98,80 L 75,79 L 52,76 Z"></path>
              <!-- Bali & Nusa Tenggara -->
              <path class="overview-island" d="M 100,77 L 105,77 L 110,78 L 120,77 L 132,80 L 134,83 L 122,81 L 100,80 Z"></path>
              <!-- Kalimantan (Borneo) -->
              <path class="overview-island" d="M 68,30 L 88,24 L 105,32 L 108,48 L 98,62 L 78,63 L 68,50 Z"></path>
              <!-- Sulawesi -->
              <path class="overview-island" d="M 118,34 L 130,34 L 132,40 L 124,44 L 130,52 L 138,58 L 134,64 L 122,63 L 120,50 L 116,40 Z"></path>
              <!-- Maluku Islands -->
              <path class="overview-island" d="M 142,38 L 148,38 L 146,45 L 142,43 Z M 140,55 L 150,56 L 148,64 L 140,62 Z"></path>
              <!-- Papua -->
              <path class="overview-island" d="M 160,40 L 180,36 L 225,48 L 225,78 L 195,78 L 180,62 L 165,56 L 158,45 Z"></path>
            </g>

            <!-- Dynamic Viewport Bounds Polygon -->
            <rect id="overview-viewport-rect" class="overview-viewport-rect" x="0" y="0" width="0" height="0" rx="2"></rect>
            <!-- Center Crosshair / Point Indicator -->
            <circle id="overview-center-dot" class="overview-center-dot" cx="0" cy="0" r="2.5"></circle>
          </svg>
          <div class="overview-footer-hint">Klik peta untuk navigasi cepat</div>
        </div>
      `;

      // Mount to map container or body
      const mapContainer = document.getElementById('map') || document.getElementById('app') || document.body;
      mapContainer.appendChild(container);
    }

    this.container = container;
    this.svgEl = document.getElementById('overview-svg') as unknown as SVGSVGElement;
    this.viewportRect = document.getElementById('overview-viewport-rect') as unknown as SVGRectElement;
    this.centerDot = document.getElementById('overview-center-dot') as unknown as SVGCircleElement;
    this.toggleBtn = document.getElementById('btn-toggle-overview-collapse') as HTMLButtonElement;
  }

  private bindEvents() {
    if (this.isBound || !this.map) return;
    this.isBound = true;

    // 1. Collapse toggle
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
    }

    // 2. Click to navigate main map
    if (this.svgEl) {
      this.svgEl.addEventListener('click', (e: MouseEvent) => {
        if (!this.map || !this.svgEl) return;
        const rect = this.svgEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const normalizedX = Math.max(0, Math.min(1, clickX / rect.width));
        const normalizedY = Math.max(0, Math.min(1, clickY / rect.height));

        const lng = OVERVIEW_BBOX.minLng + normalizedX * (OVERVIEW_BBOX.maxLng - OVERVIEW_BBOX.minLng);
        const lat = OVERVIEW_BBOX.maxLat - normalizedY * (OVERVIEW_BBOX.maxLat - OVERVIEW_BBOX.minLat);

        try {
          this.map.flyTo({
            center: [lng, lat],
            zoom: Math.max(this.map.getZoom(), 5),
            duration: 1000,
            essential: true
          });
        } catch (err) {
          logger.warn('[OverviewMap] flyTo failed:', err);
        }
      });
    }

    // 3. Map move & zoom listener
    this.moveListener = () => {
      this.updateViewport();
    };
    this.map.on('move', this.moveListener);
    this.map.on('zoom', this.moveListener);
  }

  public updateViewport() {
    if (!this.map || !this.viewportRect || !this.centerDot) return;

    try {
      const bounds = this.map.getBounds();
      const center = this.map.getCenter();
      if (!bounds || !center) return;

      const west = bounds.getWest();
      const east = bounds.getEast();
      const north = bounds.getNorth();
      const south = bounds.getSouth();

      const totalLngSpan = OVERVIEW_BBOX.maxLng - OVERVIEW_BBOX.minLng;
      const totalLatSpan = OVERVIEW_BBOX.maxLat - OVERVIEW_BBOX.minLat;

      const svgWidth = 240;
      const svgHeight = 100;

      // Project coordinates into 240x100 SVG space
      const minX = ((west - OVERVIEW_BBOX.minLng) / totalLngSpan) * svgWidth;
      const maxX = ((east - OVERVIEW_BBOX.minLng) / totalLngSpan) * svgWidth;
      const minY = ((OVERVIEW_BBOX.maxLat - north) / totalLatSpan) * svgHeight;
      const maxY = ((OVERVIEW_BBOX.maxLat - south) / totalLatSpan) * svgHeight;

      const clampedMinX = Math.max(-10, Math.min(svgWidth + 10, minX));
      const clampedMaxX = Math.max(-10, Math.min(svgWidth + 10, maxX));
      const clampedMinY = Math.max(-10, Math.min(svgHeight + 10, minY));
      const clampedMaxY = Math.max(-10, Math.min(svgHeight + 10, maxY));

      const rectX = Math.min(clampedMinX, clampedMaxX);
      const rectY = Math.min(clampedMinY, clampedMaxY);
      const rectW = Math.max(4, Math.abs(clampedMaxX - clampedMinX));
      const rectH = Math.max(4, Math.abs(clampedMaxY - clampedMinY));

      this.viewportRect.setAttribute('x', rectX.toFixed(1));
      this.viewportRect.setAttribute('y', rectY.toFixed(1));
      this.viewportRect.setAttribute('width', rectW.toFixed(1));
      this.viewportRect.setAttribute('height', rectH.toFixed(1));

      // Center dot
      const dotX = ((center.lng - OVERVIEW_BBOX.minLng) / totalLngSpan) * svgWidth;
      const dotY = ((OVERVIEW_BBOX.maxLat - center.lat) / totalLatSpan) * svgHeight;
      this.centerDot.setAttribute('cx', Math.max(0, Math.min(svgWidth, dotX)).toFixed(1));
      this.centerDot.setAttribute('cy', Math.max(0, Math.min(svgHeight, dotY)).toFixed(1));
    } catch {
      // Ignore during initial map load or projection switches
    }
  }

  public toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    if (this.container) {
      this.container.classList.toggle('collapsed', this.isCollapsed);
    }
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute('title', this.isCollapsed ? 'Besarkan Lokator' : 'Kecilkan Lokator');
      this.toggleBtn.setAttribute('aria-label', this.isCollapsed ? 'Besarkan peta lokator' : 'Kecilkan peta lokator');
    }
  }

  public setVisible(visible: boolean) {
    if (this.container) {
      this.container.style.display = visible ? 'flex' : 'none';
    }
  }

  public destroy() {
    if (this.map && this.moveListener) {
      this.map.off('move', this.moveListener);
      this.map.off('zoom', this.moveListener);
    }
    this.container?.remove();
  }
}
