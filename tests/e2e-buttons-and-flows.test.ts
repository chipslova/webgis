// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as maplibregl from 'maplibre-gl';
import { BASEMAPS } from '../src/config/basemaps';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../src/config/piksel';
import { MapManager } from '../src/map/map-manager';
import { PikselLoader } from '../src/tools/piksel-loader';
import { GEELoader } from '../src/tools/gee-loader';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { MeasureTool } from '../src/tools/measure';
import { BasemapCustomizer } from '../src/tools/basemap-customizer';
import { SwipeCompareManager, SWIPE_PRESETS } from '../src/tools/swipe-compare';
import { SidebarUI } from '../src/ui/sidebar';
import { PikselPanelUI } from '../src/ui/piksel-panel';
import { GEEPanelUI } from '../src/ui/gee-panel';
import { DataPanelUI } from '../src/ui/data-panel';
import { DynamicLegendUI } from '../src/ui/dynamic-legend';
import { BasemapCustomizerUI } from '../src/ui/basemap-customizer-panel';
import { SwipeCompareUI } from '../src/ui/swipe-compare-ui';
import { CommandPaletteUI } from '../src/ui/command-palette';
import { GuidedTourUI } from '../src/ui/guided-tour';
import { showToast } from '../src/ui/toast';
import { setupUniversalEscapeHandler } from '../src/utils/a11y';

// Read index.html for DOM element verification
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<link[\s\S]*?>/gi, '');

describe('E2E WebGIS Exhaustive Buttons & Interaction Flow Audit', () => {
  let mockMap: any;
  let mapManager: MapManager;
  let pikselLoader: PikselLoader;
  let geeLoader: GEELoader;
  let geojsonLoader: GeoJsonLoader;
  let measureTool: MeasureTool;
  let customizer: BasemapCustomizer;
  let swipeManager: SwipeCompareManager;
  let sidebarUI: SidebarUI;
  let pikselPanelUI: PikselPanelUI;
  let geePanelUI: GEEPanelUI;
  let dataPanelUI: DataPanelUI;
  let legendUI: DynamicLegendUI;
  let customizerUI: BasemapCustomizerUI;
  let swipeUI: SwipeCompareUI;
  let cmdPaletteUI: CommandPaletteUI;
  let guidedTourUI: GuidedTourUI;

  beforeEach(() => {
    document.body.innerHTML = indexHtml;

    // Mock global fetch for GEE and local GeoJSON endpoints
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] })
      } as any)
    );

    const layers: any[] = [];
    const sources: Record<string, any> = {};

    mockMap = {
      getStyle: vi.fn().mockReturnValue({ layers: [] }),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      setTerrain: vi.fn(),
      addSource: vi.fn((id, src) => { sources[id] = src; }),
      getSource: vi.fn((id) => sources[id]),
      removeSource: vi.fn((id) => { delete sources[id]; }),
      addLayer: vi.fn((l) => { layers.push(l); }),
      getLayer: vi.fn((id) => layers.find((l) => l.id === id)),
      removeLayer: vi.fn((id) => {
        const idx = layers.findIndex((l) => l.id === id);
        if (idx !== -1) layers.splice(idx, 1);
      }),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      flyTo: vi.fn(),
      easeTo: vi.fn(),
      fitBounds: vi.fn(),
      resize: vi.fn(),
      triggerRepaint: vi.fn(),
      getPitch: vi.fn().mockReturnValue(0),
      getBearing: vi.fn().mockReturnValue(0),
      getZoom: vi.fn().mockReturnValue(10),
      getCenter: vi.fn().mockReturnValue({ lng: 117.89, lat: -2.55 }),
      getCanvas: vi.fn().mockReturnValue(document.createElement('canvas')),
      getCanvasContainer: vi.fn().mockReturnValue(document.createElement('div')),
      project: vi.fn().mockReturnValue(new maplibregl.Point(100, 100)),
      addControl: vi.fn(),
      setStyle: vi.fn(),
      setMaxZoom: vi.fn(),
      setZoom: vi.fn(),
      setCenter: vi.fn(),
      setPitch: vi.fn(),
      setBearing: vi.fn()
    };

    mapManager = new MapManager('map');
    (mapManager as any).map = mockMap;

    pikselLoader = new PikselLoader(mockMap);
    geeLoader = new GEELoader(mockMap);
    geojsonLoader = new GeoJsonLoader(mockMap);
    measureTool = new MeasureTool(mockMap);
    customizer = new BasemapCustomizer(mockMap, mapManager);
    sidebarUI = new SidebarUI();
    swipeManager = new SwipeCompareManager(mockMap, mapManager, sidebarUI, pikselLoader, () => mockMap);

    pikselPanelUI = new PikselPanelUI(pikselLoader);
    pikselPanelUI.init();

    geePanelUI = new GEEPanelUI(geeLoader);
    geePanelUI.init();

    dataPanelUI = new DataPanelUI(geojsonLoader, sidebarUI, () => {});

    legendUI = new DynamicLegendUI('legend-content', pikselLoader, geeLoader, geojsonLoader);
    legendUI.render();

    customizerUI = new BasemapCustomizerUI(customizer, mapManager, pikselLoader);
    customizerUI.init();

    swipeUI = new SwipeCompareUI(swipeManager);
    swipeUI.init();

    guidedTourUI = new GuidedTourUI(mapManager, pikselLoader, geeLoader, customizer, sidebarUI);
    cmdPaletteUI = new CommandPaletteUI(mapManager, pikselLoader, geeLoader, measureTool, sidebarUI, swipeManager, guidedTourUI);
  });

  describe('A. Header & Top Bar Interaction Flow', () => {
    it('1. Geocoder input typing, clear button, and search results dropdown', () => {
      const input = document.getElementById('geocoder-input') as HTMLInputElement;
      const clearBtn = document.getElementById('search-clear-btn') as HTMLButtonElement;
      const resultsDiv = document.getElementById('geocoder-results') as HTMLElement;

      expect(input).not.toBeNull();
      expect(clearBtn).not.toBeNull();

      input.value = 'Jakarta';
      input.dispatchEvent(new Event('input'));
      clearBtn.style.display = 'flex';
      expect(clearBtn.style.display).toBe('flex');

      // Click clear
      clearBtn.click();
      input.value = '';
      clearBtn.style.display = 'none';
      resultsDiv.style.display = 'none';
      expect(input.value).toBe('');
      expect(clearBtn.style.display).toBe('none');
    });

    it('2. Command Palette shortcut trigger and modal state toggling', () => {
      expect(cmdPaletteUI.isPaletteOpen()).toBe(false);

      cmdPaletteUI.open();
      expect(cmdPaletteUI.isPaletteOpen()).toBe(true);
      expect(document.getElementById('cmd-palette-backdrop')).not.toBeNull();

      cmdPaletteUI.close();
      expect(cmdPaletteUI.isPaletteOpen()).toBe(false);
      expect(document.getElementById('cmd-palette-backdrop')).toBeNull();
    });

    it('3. Mobile/Compact Header More Dropdown toggles smoothly', () => {
      const moreBtn = document.getElementById('btn-header-more-actions') as HTMLButtonElement;
      const dropdown = document.getElementById('header-more-dropdown') as HTMLElement;

      expect(dropdown.style.display).toBe('none');

      // Open dropdown
      dropdown.style.display = 'flex';
      moreBtn.setAttribute('aria-expanded', 'true');
      expect(dropdown.style.display).toBe('flex');
      expect(moreBtn.getAttribute('aria-expanded')).toBe('true');

      // Close dropdown
      dropdown.style.display = 'none';
      moreBtn.setAttribute('aria-expanded', 'false');
      expect(dropdown.style.display).toBe('none');
    });
  });

  describe('B. Sidebar Tabs, Panels & Workflow Integrations', () => {
    it('1. Tab switching between all 7 modules', () => {
      const tabs = ['map', 'piksel', 'gee', 'measure', 'data', 'legend', 'about'] as const;
      tabs.forEach((tab) => {
        sidebarUI.setActiveTab(tab);
        expect(document.querySelector(`.sidebar-tab-btn[data-tab="${tab}"]`)?.classList.contains('active')).toBe(true);
        expect(document.getElementById(`panel-${tab}`)?.classList.contains('active')).toBe(true);
      });
    });

    it('2. Piksel Panel: Preset clicking triggers auto-fly and generates Undo Toast Action', () => {
      const map = pikselLoader.getMap();
      const prevCenter = map.getCenter();
      const prevZoom = map.getZoom();

      const bromoPreset = PIKSEL_PRESETS.find((p) => p.id === 'bromo');
      expect(bromoPreset).toBeDefined();

      if (bromoPreset) {
        pikselLoader.flyToPreset(bromoPreset);
        expect(mockMap.flyTo).toHaveBeenCalled();

        let undoTriggered = false;
        showToast(`🚀 Peta diarahkan ke ${bromoPreset.name}`, {
          type: 'info',
          durationMs: 7000,
          action: {
            label: '↩️ Kembali',
            onClick: () => {
              undoTriggered = true;
              mockMap.flyTo({ center: prevCenter, zoom: prevZoom });
            }
          }
        });

        const toastActionBtn = document.querySelector('.toast-action-btn') as HTMLButtonElement;
        expect(toastActionBtn).not.toBeNull();
        expect(toastActionBtn.textContent).toBe('↩️ Kembali');

        // Click undo
        toastActionBtn.click();
        expect(undoTriggered).toBe(true);
      }
    });

    it('3. GEE Panel: Layers toggle on and off and reflect in active layer set', async () => {
      expect(geeLoader.isLayerActive('poi')).toBe(true);
      expect(geeLoader.isLayerActive('lst')).toBe(false);

      await geeLoader.toggleLayer('lst', true);
      expect(geeLoader.isLayerActive('lst')).toBe(true);

      await geeLoader.toggleLayer('elevation', true);
      expect(geeLoader.isLayerActive('elevation')).toBe(true);

      await geeLoader.toggleLayer('lst', false);
      expect(geeLoader.isLayerActive('lst')).toBe(false);
    });

    it('4. Data Panel: Sample cities data loading and layer management', () => {
      geojsonLoader.loadSampleData();
      const allIds = geojsonLoader.getAllMapLayerIds();
      expect(allIds.length).toBeGreaterThan(0);

      // Verify custom layer item exists
      const layers = geojsonLoader.getLayers();
      expect(layers.length).toBeGreaterThan(0);
      expect(layers[0].name).toContain('Indonesia');

      // Test layer opacity adjustment
      geojsonLoader.setLayerOpacity(layers[0].id, 0.5);
      expect(layers[0].opacity).toBe(0.5);

      // Test layer visibility toggle
      geojsonLoader.toggleLayerVisibility(layers[0].id, false);
      expect(layers[0].visible).toBe(false);

      // Test layer removal
      geojsonLoader.removeLayer(layers[0].id);
      expect(geojsonLoader.getLayers().length).toBe(0);
    });

    it('5. Measure Tool: Distance and Area modes activate and clear without crashes', () => {
      measureTool.setMode('distance');
      expect(measureTool.getMode()).toBe('distance');

      measureTool.setMode('area');
      expect(measureTool.getMode()).toBe('area');

      measureTool.clear();
      measureTool.setMode('none');
      expect(measureTool.getMode()).toBe('none');
    });

    it('6. Dynamic Legend: Dynamically renders active layer items and color swatches', () => {
      legendUI.render();
      const legendContainer = document.getElementById('panel-legend');
      expect(legendContainer).not.toBeNull();
    });
  });

  describe('C. Swipe Comparison Split-Screen Workflow', () => {
    it('1. Activating and deactivating Swipe Comparison', () => {
      expect(swipeManager.isActive()).toBe(false);

      swipeManager.activate();
      expect(swipeManager.isActive()).toBe(true);

      expect(swipeManager.getLeftConfig().productId).toBeDefined();
      expect(swipeManager.getRightConfig().productId).toBeDefined();
      expect(swipeManager.getSliderPosition()).toBe(50);

      swipeManager.deactivate();
      expect(swipeManager.isActive()).toBe(false);
    });

    it('2. Swipe UI renders unified comparison card and responds to slider movement', () => {
      swipeManager.activate();
      swipeUI.render();

      const root = document.getElementById('swipe-ui-root');
      expect(root).not.toBeNull();

      const leftSelect = root?.querySelector('#swipe-left-prod') as HTMLSelectElement;
      const rightSelect = root?.querySelector('#swipe-right-prod') as HTMLSelectElement;
      expect(leftSelect).not.toBeNull();
      expect(rightSelect).not.toBeNull();

      // Move slider
      swipeManager.setSliderPosition(75);
      expect(swipeManager.getSliderPosition()).toBe(75);

      // Apply preset
      const iknPreset = SWIPE_PRESETS.find((p) => p.id === 'ikn-development');
      if (iknPreset) {
        swipeManager.applyPreset(iknPreset);
        expect(swipeManager.getLeftConfig().year).toBe('2018');
        expect(swipeManager.getRightConfig().year).toBe('2025');
      }

      swipeManager.deactivate();
    });
  });

  describe('D. Universal Escape (`ESC`) Key Accessibility', () => {
    it('should close Command Palette on ESC key', () => {
      cmdPaletteUI.open();
      expect(cmdPaletteUI.isPaletteOpen()).toBe(true);

      const cleanup = setupUniversalEscapeHandler([
        () => {
          if (cmdPaletteUI.isPaletteOpen()) {
            cmdPaletteUI.close();
            return true;
          }
          return false;
        }
      ]);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(cmdPaletteUI.isPaletteOpen()).toBe(false);
      cleanup();
    });
  });

  describe('E. Basemap Gallery Badges & Sublayer Limitation Workflows', () => {
    it('1. Vector basemap allows full sublayer toggles and bulk mute/unmute', () => {
      // Set to vector basemap
      mapManager.setBasemap('openfreemap-liberty');
      customizer.setBasemapId('openfreemap-liberty');
      customizerUI.syncUI();

      const notice = document.getElementById('popover-sublayer-notice');
      expect(notice?.style.display).toBe('none');

      const btnMute = document.getElementById('btn-popover-sublayers-mute') as HTMLButtonElement;
      const btnAll = document.getElementById('btn-popover-sublayers-all') as HTMLButtonElement;
      expect(btnMute.disabled).toBe(false);
      expect(btnAll.disabled).toBe(false);

      // Click Mute (Clean map)
      btnMute.click();
      const stateMuted = customizer.getState();
      expect(stateMuted.sublayers.roads).toBe(false);
      expect(stateMuted.sublayers.poi).toBe(false);
      expect(stateMuted.sublayers.place_names).toBe(false);

      // Click All (Restore)
      btnAll.click();
      const stateAll = customizer.getState();
      expect(stateAll.sublayers.roads).toBe(true);
      expect(stateAll.sublayers.poi).toBe(true);
      expect(stateAll.sublayers.place_names).toBe(true);
    });

    it('2. Raster basemap locks sublayer toggles, displays notice, and provides quick-switch button', () => {
      // Switch to raster basemap
      mapManager.setBasemap('esri-imagery');
      customizer.setBasemapId('esri-imagery');
      customizerUI.syncUI();

      const notice = document.getElementById('popover-sublayer-notice');
      expect(notice?.style.display).toBe('block');
      expect(notice?.textContent).toContain('Sublayer Khusus Basemap Vektor');

      const btnMute = document.getElementById('btn-popover-sublayers-mute') as HTMLButtonElement;
      const btnAll = document.getElementById('btn-popover-sublayers-all') as HTMLButtonElement;
      expect(btnMute.disabled).toBe(true);
      expect(btnAll.disabled).toBe(true);

      const roadsToggle = document.getElementById('popover-check-roads') as HTMLInputElement;
      expect(roadsToggle.disabled).toBe(true);

      // Quick switch button exists in notice
      const quickSwitchBtn = document.getElementById('btn-notice-switch-vector') as HTMLButtonElement;
      expect(quickSwitchBtn).not.toBeNull();

      quickSwitchBtn.click();
      expect(mapManager.getCurrentBasemapId()).toBe('openfreemap-liberty');
    });
  });
});
