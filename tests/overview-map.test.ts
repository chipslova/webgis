// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverviewMapUI } from '../src/ui/overview-map';

describe('Interactive Inset Overview Locator Map', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <main id="map"></main>
      </div>
    `;
  });

  it('should initialize and insert locator map into DOM', () => {
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

    const overview = new OverviewMapUI(mockMap);
    const container = document.getElementById('overview-locator-map');
    expect(container).not.toBeNull();
    expect(container?.getAttribute('role')).toBe('region');

    const viewportRect = document.getElementById('overview-viewport-rect');
    expect(viewportRect).not.toBeNull();

    const centerDot = document.getElementById('overview-center-dot');
    expect(centerDot).not.toBeNull();

    // Map listeners attached
    expect(mockMap.on).toHaveBeenCalledWith('move', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('zoom', expect.any(Function));
  });

  it('should toggle collapse state smoothly', () => {
    const mockMap: any = {
      on: vi.fn(),
      off: vi.fn(),
      getBounds: vi.fn().mockReturnValue(null),
      getCenter: vi.fn().mockReturnValue(null),
    };

    const overview = new OverviewMapUI(mockMap);
    const container = document.getElementById('overview-locator-map');
    const toggleBtn = document.getElementById('btn-toggle-overview-collapse') as HTMLButtonElement;

    expect(container?.classList.contains('collapsed')).toBe(false);
    toggleBtn?.click();
    expect(container?.classList.contains('collapsed')).toBe(true);
    toggleBtn?.click();
    expect(container?.classList.contains('collapsed')).toBe(false);
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

  it('should toggle visibility and destroy cleanly without leaking listeners', () => {
    const offMock = vi.fn();
    const mockMap: any = {
      on: vi.fn(),
      off: offMock,
      getBounds: vi.fn().mockReturnValue(null),
      getCenter: vi.fn().mockReturnValue(null),
    };

    const overview = new OverviewMapUI(mockMap);
    const container = document.getElementById('overview-locator-map');

    overview.setVisible(false);
    expect(container?.style.display).toBe('none');

    overview.setVisible(true);
    expect(container?.style.display).toBe('flex');

    overview.destroy();
    expect(offMock).toHaveBeenCalledWith('move', expect.any(Function));
    expect(offMock).toHaveBeenCalledWith('zoom', expect.any(Function));
    expect(document.getElementById('overview-locator-map')).toBeNull();
  });
});
