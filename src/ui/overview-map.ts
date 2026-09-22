import { Map as MapLibreMap } from 'maplibre-gl';
import { logger } from '../utils/logger';
import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';

// Bounding box of the Overview Map (Indonesia & surrounding ASEAN region)
const OVERVIEW_BBOX = {
  minLng: 94.0,
  maxLng: 142.0,
  minLat: -11.5,
  maxLat: 6.5
};

export class OverviewMapUI {
  private map: MapLibreMap | null = null;
  private popover: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private closeBtn: HTMLElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private viewportRect: SVGRectElement | null = null;
  private centerDot: SVGCircleElement | null = null;
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
    this.popover = document.getElementById('locator-popover');
    this.toggleBtn = document.getElementById('btn-toggle-locator');
    this.closeBtn = document.getElementById('btn-close-locator-popover');
    this.svgEl = document.getElementById('overview-svg') as unknown as SVGSVGElement;
    this.viewportRect = document.getElementById('overview-viewport-rect') as unknown as SVGRectElement;
    this.centerDot = document.getElementById('overview-center-dot') as unknown as SVGCircleElement;
  }

  private bindEvents() {
    if (this.isBound || !this.map) return;
    this.isBound = true;

    // 1. Toggle Button
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopover();
      });
    }

    // 2. Close Button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePopover();
      });
    }

    // 3. Click to navigate main map via SVG
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
          showToast(`Mengarahkan ke koordinat [${lat.toFixed(2)}, ${lng.toFixed(2)}]`, 'info');
        } catch (err) {
          logger.warn('[OverviewMap] flyTo failed:', err);
        }
      });
    }

    // 4. Island Quick Jump Chips
    const chipButtons = document.querySelectorAll<HTMLButtonElement>('.locator-chip-btn');
    chipButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lng = parseFloat(btn.dataset.lng || '0');
        const lat = parseFloat(btn.dataset.lat || '0');
        const zoom = parseFloat(btn.dataset.zoom || '6.0');
        const name = btn.textContent?.trim() || 'Wilayah';

        if (this.map && typeof this.map.flyTo === 'function') {
          this.map.flyTo({
            center: [lng, lat],
            zoom: zoom,
            duration: 1200,
            essential: true
          });
          announceToScreenReader(`Mengarahkan peta ke ${name}`);
          showToast(`Menuju ke ${name}`, 'info');
        }
      });
    });

    // 5. Map move & zoom listener
    this.moveListener = () => {
      this.updateViewport();
    };
    this.map.on('move', this.moveListener);
    this.map.on('zoom', this.moveListener);
  }

  public togglePopover() {
    if (!this.popover) return;
    const isVisible = this.popover.style.display === 'block';

    // Close all other popovers first
    ['basemap-popover', 'sublayers-popover', 'terrain-popover'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('popover-open'));

    if (!isVisible) {
      this.popover.style.display = 'block';
      this.toggleBtn?.classList.add('popover-open');
      this.updateViewport();
      announceToScreenReader('Peta Inset Penunjuk Kepulauan dibuka');
    } else {
      this.popover.style.display = 'none';
      this.toggleBtn?.classList.remove('popover-open');
    }
  }

  public closePopover() {
    if (this.popover) {
      this.popover.style.display = 'none';
    }
    this.toggleBtn?.classList.remove('popover-open');
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

  public setVisible(visible: boolean) {
    if (this.popover) {
      this.popover.style.display = visible ? 'block' : 'none';
      if (this.toggleBtn) {
        this.toggleBtn.classList.toggle('popover-open', visible);
      }
    }
  }

  public destroy() {
    if (this.map && this.moveListener) {
      this.map.off('move', this.moveListener);
      this.map.off('zoom', this.moveListener);
    }
  }
}
