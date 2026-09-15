// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverviewMapUI } from '../src/ui/overview-map';

describe('Interactive Inset Overview Locator Map (Docked Popover)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <main id="map"></main>
        <button id="btn-toggle-locator" class="dock-btn">Lokator</button>
        <div id="locator-popover" class="glass-popover" style="display: none;">
          <button id="btn-close-locator-popover">✕</button>
          <svg id="overview-svg" viewBox="0 0 240 100">
            <rect id="overview-viewport-rect" x="0" y="0" width="0" height="0"></rect>
            <circle id="overview-center-dot" cx="0" cy="0" r="2.5"></circle>
          </svg>
          <button class="locator-chip-btn" data-lng="101.5" data-lat="0.5" data-zoom="6.2">Sumatra</button>
          <button class="locator-chip-btn" data-lng="110.0" data-lat="-7.2" data-zoom="6.5">Jawa</button>
        </div>
      </div>
    `;
  });

  it('should initialize and bind popover controls and map listeners', () => {
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getBounds: vi.fn().mockReturnValue({
        getWest: () => 105.0,
        getEast: () => 110.0,
        getNorth: () => -5.0,
        getSouth: () => -8.0,
      }),
      getCenter: vi.fn().mockReturnValue({ lng: 107.5, lat: -6.5 }),
      getZoom: vi.fn().mockReturnValue(7),
      flyTo: vi.fn(),
    };

    new OverviewMapUI(mockMap);
    const popover = document.getElementById('locator-popover');
    expect(popover).not.toBeNull();

    const viewportRect = document.getElementById('overview-viewport-rect');
    expect(viewportRect).not.toBeNull();

    const centerDot = document.getElementById('overview-center-dot');
    expect(centerDot).not.toBeNull();

    // Map listeners attached
    expect(mockMap.on).toHaveBeenCalledWith('move', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('zoom', expect.any(Function));
  });

  it('should toggle popover visibility smoothly via toggle button and close button', () => {
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getBounds: vi.fn().mockReturnValue(null),
      getCenter: vi.fn().mockReturnValue(null),
    };

    const overview = new OverviewMapUI(mockMap);
    const popover = document.getElementById('locator-popover');
    const toggleBtn = document.getElementById('btn-toggle-locator') as HTMLButtonElement;
    const closeBtn = document.getElementById('btn-close-locator-popover') as HTMLButtonElement;

    expect(popover?.style.display).toBe('none');
    toggleBtn?.click();
    expect(popover?.style.display).toBe('block');
    expect(toggleBtn?.classList.contains('popover-open')).toBe(true);

    closeBtn?.click();
    expect(popover?.style.display).toBe('none');
    expect(toggleBtn?.classList.contains('popover-open')).toBe(false);
  });

  it('should update viewport coordinates accurately when map moves', () => {
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getBounds: vi.fn().mockReturnValue({
        getWest: () => 100.0,
        getEast: () => 120.0,
        getNorth: () => 2.0,
        getSouth: () => -4.0,
      }),
      getCenter: vi.fn().mockReturnValue({ lng: 110.0, lat: -1.0 }),
      getZoom: vi.fn().mockReturnValue(6),
    };

    const overview = new OverviewMapUI(mockMap);
    overview.updateViewport();

    const viewportRect = document.getElementById('overview-viewport-rect');
    const x = parseFloat(viewportRect?.getAttribute('x') || '0');
    const y = parseFloat(viewportRect?.getAttribute('y') || '0');
    const width = parseFloat(viewportRect?.getAttribute('width') || '0');
    const height = parseFloat(viewportRect?.getAttribute('height') || '0');

    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('should trigger map flyTo when clicking on the SVG mini-map', () => {
    const flyToMock = vi.fn();
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getBounds: vi.fn().mockReturnValue(null),
      getCenter: vi.fn().mockReturnValue(null),
      getZoom: vi.fn().mockReturnValue(6),
      flyTo: flyToMock,
    };

    new OverviewMapUI(mockMap);
    const svgEl = document.getElementById('overview-svg');
    expect(svgEl).not.toBeNull();

    // Mock getBoundingClientRect
    if (svgEl) {
      svgEl.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 240,
        height: 100,
        right: 240,
        bottom: 100,
      });

      // Dispatch click event in the middle of SVG (x=120, y=50)
      const event = new MouseEvent('click', {
        clientX: 120,
        clientY: 50,
        bubbles: true,
      });
      svgEl.dispatchEvent(event);

      expect(flyToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          center: expect.any(Array),
          duration: 1000,
        })
      );
    }
  });

  it('should trigger map flyTo when clicking quick region jump chips', () => {
    const flyToMock = vi.fn();
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getBounds: vi.fn().mockReturnValue(null),
      getCenter: vi.fn().mockReturnValue(null),
      getZoom: vi.fn().mockReturnValue(6),
      flyTo: flyToMock,
    };

    new OverviewMapUI(mockMap);
    const chipBtns = document.querySelectorAll<HTMLButtonElement>('.locator-chip-btn');
    expect(chipBtns.length).toBeGreaterThanOrEqual(2);

    chipBtns[0].click(); // Sumatra
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [101.5, 0.5],
        zoom: 6.2,
      })
    );

    chipBtns[1].click(); // Jawa
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [110.0, -7.2],
        zoom: 6.5,
      })
    );
  });

  it('should toggle visibility and destroy cleanly without leaking listeners', () => {
    const offMock = vi.fn();
    const mockMap: any = {
      on: vi.fn(),
      off: offMock,
      getBounds: vi.fn().mockReturnValue(null),
      getCenter: vi.fn().mockReturnValue(null),
    };

    const overview = new OverviewMapUI(mockMap);
    const popover = document.getElementById('locator-popover');

    overview.setVisible(false);
    expect(popover?.style.display).toBe('none');

    overview.setVisible(true);
    expect(popover?.style.display).toBe('block');

    overview.destroy();
    expect(offMock).toHaveBeenCalledWith('move', expect.any(Function));
    expect(offMock).toHaveBeenCalledWith('zoom', expect.any(Function));
  });
});
