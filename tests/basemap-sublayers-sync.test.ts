// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BasemapCustomizer } from '../src/tools/basemap-customizer';
import { BasemapCustomizerUI } from '../src/ui/basemap-customizer-panel';
import { MapManager } from '../src/map/map-manager';

describe('Basemap Customizer & Sublayers Active Synchronization Suite', () => {
  let mockMap: any;
  let mapManager: MapManager;
  let customizer: BasemapCustomizer;
  let customizerUI: BasemapCustomizerUI;

  beforeEach(() => {
    document.body.innerHTML = `
      <!-- Active Basemap Card & Sublayers button -->
      <div class="active-basemap-card">
        <h4 id="active-bm-title">Esri World Imagery</h4>
        <span id="active-bm-type-badge">RASTER</span>
        <button id="btn-sidebar-open-basemaps"></button>
        <button id="btn-sidebar-open-sublayers" class="btn btn-outline btn-sm">
          <span>Sublapisan</span>
          <span id="sidebar-sublayers-active-badge" class="badge-sublayers-active" style="display: none;">● Aktif</span>
        </button>
      </div>

      <!-- Bottom Tools Dock -->
      <nav id="bottom-layer-tools">
        <button id="btn-toggle-basemap" class="dock-btn"></button>
        <button id="btn-toggle-sublayers" class="dock-btn">
          <span class="dock-btn-text">Tampilan Peta</span>
          <span id="dock-sublayers-active-dot" class="dock-btn-badge-dot" style="display: none;"></span>
        </button>
        <button id="btn-toggle-terrain" class="dock-btn">
          <span class="dock-btn-text">Medan 3D</span>
        </button>
        <button id="btn-toggle-grid" class="dock-btn"></button>
        <button id="btn-toggle-locator" class="dock-btn"></button>
      </nav>

      <!-- Glass Popover: Sublayers & Relief 3D -->
      <div id="sublayers-popover" class="glass-popover" style="display: none;">
        <button id="btn-close-sublayers-popover"></button>
        <div class="customizer-tabs">
          <button type="button" class="customizer-tab-btn active" id="tab-btn-sublayers">
            <span>🔲 Sublapisan Vektor</span>
            <span id="badge-tab-sublayers" class="tab-indicator-badge" style="display: none;">Aktif</span>
          </button>
          <button type="button" class="customizer-tab-btn" id="tab-btn-terrain">
            <span>⛰️ Relief & Medan 3D</span>
            <span id="badge-tab-terrain" class="tab-indicator-badge" style="display: none;">Aktif</span>
          </button>
        </div>

        <div id="pane-customizer-sublayers" class="customizer-tab-pane active">
          <div class="sublayer-notice" id="popover-sublayer-notice" style="display: none;"></div>
          <button id="btn-popover-sublayers-all"></button>
          <button id="btn-popover-sublayers-mute"></button>
          <div class="vector-sublayers-list">
            <label class="sublayer-item">
              <input type="checkbox" id="popover-check-buildings" class="sublayer-toggle" data-key="buildings" checked />
            </label>
            <label class="sublayer-item">
              <input type="checkbox" id="popover-check-roads" class="sublayer-toggle" data-key="roads" checked />
            </label>
          </div>
        </div>

        <div id="pane-customizer-terrain" class="customizer-tab-pane">
          <input type="checkbox" id="popover-check-hillshade" class="sublayer-toggle" />
          <input type="checkbox" id="popover-terrain-master-toggle" class="sublayer-toggle" />
          
          <div id="terrain-exaggeration-container" class="terrain-section is-disabled">
            <span id="popover-terrain-exaggeration-val">1.50x</span>
            <input type="range" id="popover-terrain-exaggeration-slider" min="0.5" max="5.0" step="0.1" value="1.5" disabled />
            <div id="terrain-exaggeration-notice" class="terrain-exag-notice" style="display: block;"></div>
          </div>

          <input type="checkbox" id="popover-check-buildings-3d" class="sublayer-toggle" />
        </div>
      </div>

      <div id="basemap-popover" class="glass-popover" style="display: none;">
        <button id="btn-close-basemap-popover"></button>
        <div id="popover-basemap-rec-list"></div>
        <div id="popover-basemap-thematic-list"></div>
        <div id="popover-basemap-canvas-list"></div>
      </div>
      <div id="terrain-popover" style="display: none;"></div>
      <div id="locator-popover" style="display: none;"></div>
      <div id="basemap-grid"></div>
    `;

    mockMap = {
      getStyle: vi.fn().mockReturnValue({ layers: [] }),
      getSource: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      getTerrain: vi.fn().mockReturnValue(null),
      setTerrain: vi.fn(),
      getZoom: vi.fn().mockReturnValue(15),
      getPitch: vi.fn().mockReturnValue(50),
      getCenter: vi.fn().mockReturnValue({ lng: 106.8272, lat: -6.1754 }),
      flyTo: vi.fn(),
      on: vi.fn()
    };

    mapManager = new MapManager('map');
    (mapManager as any).map = mockMap;
    (mapManager as any).currentBasemapId = 'esri-imagery';

    customizer = new BasemapCustomizer(mockMap, mapManager);
    customizerUI = new BasemapCustomizerUI(customizer, mapManager);
  });

  it('should disable Vertical Exaggeration slider and display explanation notice when DEM 3D is OFF', () => {
    expect(customizerUI).toBeDefined();
    const slider = document.getElementById('popover-terrain-exaggeration-slider') as HTMLInputElement;
    const container = document.getElementById('terrain-exaggeration-container');
    const notice = document.getElementById('terrain-exaggeration-notice');

    expect(customizer.getState().terrain3D).toBe(false);
    expect(slider.disabled).toBe(true);
    expect(container?.classList.contains('is-disabled')).toBe(true);
    expect(notice?.style.display).not.toBe('none');
  });

  it('should unlock Vertical Exaggeration slider and hide notice when DEM 3D is toggled ON', () => {
    const slider = document.getElementById('popover-terrain-exaggeration-slider') as HTMLInputElement;
    const container = document.getElementById('terrain-exaggeration-container');
    const notice = document.getElementById('terrain-exaggeration-notice');

    customizer.toggle3DTerrain(true);
    expect(customizer.getState().terrain3D).toBe(true);
    expect(slider.disabled).toBe(false);
    expect(container?.classList.contains('is-disabled')).toBe(false);
    expect(notice?.style.display).toBe('none');
  });

  it('should highlight sidebar Sublayers button, dock button, and terrain tab badge when 3D building extrusion is activated', () => {
    const btnSidebar = document.getElementById('btn-sidebar-open-sublayers');
    const badgeSidebar = document.getElementById('sidebar-sublayers-active-badge');
    const btnDockSublayers = document.getElementById('btn-toggle-sublayers');
    const dockDot = document.getElementById('dock-sublayers-active-dot');
    const badgeTerrainTab = document.getElementById('badge-tab-terrain');

    // Initially all off
    expect(btnSidebar?.classList.contains('active')).toBe(false);
    expect(badgeSidebar?.style.display).toBe('none');
    expect(btnDockSublayers?.classList.contains('active')).toBe(false);
    expect(dockDot?.style.display).toBe('none');
    expect(badgeTerrainTab?.style.display).toBe('none');

    // Activate 3D Buildings
    customizer.toggle3DBuildings(true);
    expect(customizer.getState().buildings3D).toBe(true);

    // Verify indicators are active
    expect(btnSidebar?.classList.contains('active')).toBe(true);
    expect(badgeSidebar?.style.display).not.toBe('none');
    expect(btnDockSublayers?.classList.contains('active')).toBe(true);
    expect(dockDot?.style.display).not.toBe('none');
    expect(badgeTerrainTab?.style.display).not.toBe('none');
    expect(badgeTerrainTab?.textContent).toContain('3D Bangunan');
  });

  it('should retain 3D Buildings active state and indicators when switching basemap', () => {
    // 1. Activate 3D Buildings
    customizer.toggle3DBuildings(true);
    expect(customizer.getState().buildings3D).toBe(true);

    // 2. Switch basemap to another basemap
    (mapManager as any).currentBasemapId = 'openfreemap-liberty';
    customizer.setBasemapId('openfreemap-liberty');

    // 3. UI should remain synced and active
    const checkBuildings3D = document.getElementById('popover-check-buildings-3d') as HTMLInputElement;
    const btnSidebar = document.getElementById('btn-sidebar-open-sublayers');
    const badgeSidebar = document.getElementById('sidebar-sublayers-active-badge');
    const btnDockSublayers = document.getElementById('btn-toggle-sublayers');

    expect(checkBuildings3D.checked).toBe(true);
    expect(btnSidebar?.classList.contains('active')).toBe(true);
    expect(badgeSidebar?.style.display).not.toBe('none');
    expect(btnDockSublayers?.classList.contains('active')).toBe(true);
  });

  it('should intelligently switch to Terrain tab when opening sublayers while 3D settings are active on a raster basemap', () => {
    (mapManager as any).currentBasemapId = 'esri-imagery'; // raster
    customizer.toggle3DBuildings(true);

    const btnSidebar = document.getElementById('btn-sidebar-open-sublayers');
    btnSidebar?.click();

    const paneTerrain = document.getElementById('pane-customizer-terrain');
    const tabBtnTerrain = document.getElementById('tab-btn-terrain');
    expect(paneTerrain?.classList.contains('active')).toBe(true);
    expect(tabBtnTerrain?.classList.contains('active')).toBe(true);
  });
});
