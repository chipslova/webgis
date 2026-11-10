// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PikselLoader } from '../src/tools/piksel-loader';
import { PikselPanelUI } from '../src/ui/piksel-panel';

describe('BIG Piksel Upstream Health Probe & Graceful Fallback Suite', () => {
  let mockMap: any;
  let mockMapManager: any;
  let pikselLoader: PikselLoader;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    mockMap = {
      addSource: vi.fn(),
      getSource: vi.fn(),
      removeSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn().mockReturnValue(null),
      removeLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      getStyle: vi.fn().mockReturnValue({ version: 8 }),
      getZoom: vi.fn(() => 12),
      flyTo: vi.fn(),
      getCenter: vi.fn(() => ({ lng: 112.95, lat: -7.94 })),
      getPitch: vi.fn(() => 0),
      getBearing: vi.fn(() => 0)
    };

    mockMapManager = {
      setBasemap: vi.fn(),
      getActiveBasemap: vi.fn(() => ({ id: 'osm', type: 'raster' }))
    };

    originalFetch = global.fetch;
    pikselLoader = new PikselLoader(mockMap);
    pikselLoader.setMapManager(mockMapManager);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should initialize with checking state and probe healthy upstream endpoint correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'healthy',
        latencyMs: 140,
        upstream: 'ows.staging.piksel.big.go.id',
        checkedAt: '2026-11-09T07:00:00Z'
      })
    });

    const health = await pikselLoader.checkUpstreamHealth(true);
    expect(health.status).toBe('healthy');
    expect(health.latencyMs).toBe(140);
    expect(health.upstream).toBe('ows.staging.piksel.big.go.id');
    expect(health.message).toContain('normal');
  });

  it('should mark upstream as degraded when server responds with degraded status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'degraded',
        latencyMs: 3200,
        upstream: 'ows.staging.piksel.big.go.id'
      })
    });

    const health = await pikselLoader.checkUpstreamHealth(true);
    expect(health.status).toBe('degraded');
    expect(health.latencyMs).toBe(3200);
    expect(health.message).toContain('lambat');
  });

  it('should mark upstream as offline when fetch throws network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const health = await pikselLoader.checkUpstreamHealth(true);
    expect(health.status).toBe('offline');
    expect(health.message).toContain('terputus');
  });

  it('should notify subscribers via onUpstreamHealthChange', async () => {
    const callback = vi.fn();
    pikselLoader.onUpstreamHealthChange(callback);

    // Initial subscriber receives current state immediately
    expect(callback).toHaveBeenCalledTimes(1);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'healthy', latencyMs: 95 })
    });

    await pikselLoader.checkUpstreamHealth(true);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[1][0].status).toBe('healthy');
  });

  it('should switch to Esri World Imagery fallback cleanly', () => {
    pikselLoader.setActiveProduct('s2-geomad-rgb');
    expect(pikselLoader.getActiveProduct()).not.toBeNull();

    pikselLoader.switchToEsriFallback();

    expect(pikselLoader.getActiveProduct()).toBeNull();
    expect(mockMapManager.setBasemap).toHaveBeenCalledWith('esri-imagery');
  });

  it('should render upstream status card and bind fallback actions in PikselPanelUI', async () => {
    const panelDiv = document.createElement('div');
    panelDiv.id = 'panel-piksel';
    document.body.appendChild(panelDiv);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'degraded', latencyMs: 2800 })
    });

    const panelUI = new PikselPanelUI(pikselLoader);
    panelUI.init();

    // Verify upstream status bar exists
    const healthBar = document.getElementById('piksel-upstream-health-bar');
    expect(healthBar).not.toBeNull();
    expect(healthBar?.innerHTML).toContain('Server Hulu BIG Piksel');

    // Activate product and simulate error state in loader
    pikselLoader.setActiveProduct('s2-geomad-rgb');
    (pikselLoader as any).emitState('error');

    // The slot should display the fallback Esri button
    const fallbackBtn = panelDiv.querySelector('#btn-fallback-esri-imagery') as HTMLButtonElement | null;
    expect(fallbackBtn).not.toBeNull();

    // Clicking fallback button should switch to Esri imagery
    fallbackBtn?.click();
    expect(mockMapManager.setBasemap).toHaveBeenCalledWith('esri-imagery');
  });

  it('should display specific loaded and failed tile details in the partial degraded alert', () => {
    mockMap.getBounds = vi.fn().mockReturnValue({
      getWest: () => 110.0,
      getEast: () => 110.8,
      getNorth: () => -7.2,
      getSouth: () => -7.8
    });
    mockMap.getZoom = vi.fn().mockReturnValue(10);
    mockMap.flyTo = vi.fn();

    const panelDiv = document.getElementById('panel-piksel') || document.createElement('div');
    panelDiv.id = 'panel-piksel';
    document.body.appendChild(panelDiv);

    const panelUI = new PikselPanelUI(pikselLoader);
    panelUI.init();

    pikselLoader.setActiveProduct('s2-geomad-rgb');

    // Simulate 2 failed raster tiles
    (pikselLoader as any).tilesFailed = 2;
    (pikselLoader as any).emitState('degraded');

    const alertBox = document.querySelector('.clean-alert.alert-partial') as HTMLElement;
    expect(alertBox).not.toBeNull();
    expect(alertBox.textContent).toContain('Ubin Raster Sebagian Dimuat');
    expect(alertBox.textContent).toContain('Ubin Tidak Dimuat');

    // Ratio badge should be rendered
    const ratioBadge = alertBox.querySelector('.tile-status-ratio-badge');
    expect(ratioBadge).not.toBeNull();
    expect(ratioBadge?.textContent).toContain('Ubin Aktif');

    // Failed tile items should be listed with sector label and coordinate
    const failedTileItems = alertBox.querySelectorAll('.tile-badge-item.is-failed');
    expect(failedTileItems.length).toBeGreaterThanOrEqual(1);

    const firstFailed = failedTileItems[0] as HTMLElement;
    expect(firstFailed.dataset.lng).toBeDefined();
    expect(firstFailed.dataset.lat).toBeDefined();
    expect(firstFailed.textContent).toContain('Sektor');
    expect(firstFailed.textContent).toContain('Ubin');

    // Clicking the failed tile should fly the map to the tile's center coordinates
    firstFailed.click();
    expect(mockMap.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: [Number(firstFailed.dataset.lng), Number(firstFailed.dataset.lat)]
    }));

    // Toggle tile grid button in alert
    const toggleGridBtn = alertBox.querySelector('#btn-toggle-tile-grid') as HTMLButtonElement | null;
    expect(toggleGridBtn).not.toBeNull();
    toggleGridBtn?.click();
    expect(pikselLoader.isGridVisible()).toBe(true);
  });
});
