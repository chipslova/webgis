// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BASEMAPS } from '../src/config/basemaps';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../src/config/piksel';
import { BasemapCustomizer } from '../src/tools/basemap-customizer';
import { BasemapCustomizerUI } from '../src/ui/basemap-customizer-panel';
import { SidebarUI, TabId } from '../src/ui/sidebar';
import { PermalinkManager } from '../src/tools/permalink';
import * as maplibregl from 'maplibre-gl';
import { PointInspector } from '../src/tools/point-inspector';
import { GuidedTourUI } from '../src/ui/guided-tour';
import { PikselLoader } from '../src/tools/piksel-loader';

// Read index.html for DOM element verification (stripping script and link tags for happy-dom parser)
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<link[\s\S]*?>/gi, '');

describe('Full WebGIS Feature & Button Audit', () => {
  beforeEach(() => {
    document.body.innerHTML = indexHtml;
  });

  describe('1. HTML DOM Structure & Interactive Element IDs', () => {
    it('should contain all required Header & Toolbar buttons', () => {
      expect(document.getElementById('btn-start-tour')).not.toBeNull();
      expect(document.getElementById('btn-quick-tour')).not.toBeNull();
      expect(document.getElementById('btn-toggle-globe')).not.toBeNull();
      expect(document.getElementById('btn-reset-map')).not.toBeNull();
      expect(document.getElementById('btn-export-map')).not.toBeNull();
      expect(document.getElementById('btn-share-map')).not.toBeNull();
      expect(document.getElementById('btn-quick-import')).not.toBeNull();
      expect(document.getElementById('geocoder-input')).not.toBeNull();
      expect(document.getElementById('geocoder-results')).not.toBeNull();
    });

    it('should contain all 7 Sidebar Navigation Tabs and Panels', () => {
      const tabs: TabId[] = ['map', 'piksel', 'gee', 'measure', 'data', 'legend', 'about'];
      tabs.forEach((tab) => {
        const tabBtn = document.querySelector(`.sidebar-tab-btn[data-tab="${tab}"]`);
        const panel = document.getElementById(`panel-${tab}`);
        expect(tabBtn, `Tab button for data-tab="${tab}" should exist`).not.toBeNull();
        expect(panel, `Sidebar panel #panel-${tab} should exist`).not.toBeNull();
      });
    });

    it('should contain the Floating Bottom Tools Dock and 3 Glass Popovers', () => {
      // Dock & Buttons (Clean 4-button tools dock)
      expect(document.getElementById('bottom-layer-tools')).not.toBeNull();
      expect(document.getElementById('btn-toggle-basemap')).not.toBeNull();
      expect(document.getElementById('btn-toggle-sublayers')).not.toBeNull();
      expect(document.getElementById('btn-toggle-terrain')).not.toBeNull();
      expect(document.getElementById('btn-toggle-grid')).not.toBeNull();

      // Popovers
      expect(document.getElementById('basemap-popover')).not.toBeNull();
      expect(document.getElementById('sublayers-popover')).not.toBeNull();
      expect(document.getElementById('terrain-popover')).not.toBeNull();

      // Close buttons
      expect(document.getElementById('btn-close-basemap-popover')).not.toBeNull();
      expect(document.getElementById('btn-close-sublayers-popover')).not.toBeNull();
      expect(document.getElementById('btn-close-terrain-popover')).not.toBeNull();
    });

    it('should contain Sublayers & Global Overlays controls', () => {
      expect(document.getElementById('popover-check-hillshade')).not.toBeNull();
      expect(document.getElementById('btn-popover-sublayers-all')).not.toBeNull();
      expect(document.getElementById('btn-popover-sublayers-mute')).not.toBeNull();

      const sublayerKeys = ['poi', 'road_names', 'place_names', 'admin_boundaries', 'landcover', 'water', 'buildings', 'roads'];
      sublayerKeys.forEach((key) => {
        expect(document.getElementById(`popover-check-${key}`), `Sublayer checkbox #popover-check-${key} should exist`).not.toBeNull();
      });
    });

    it('should contain 3D Terrain Popover controls', () => {
      expect(document.getElementById('popover-terrain-master-toggle')).not.toBeNull();
      expect(document.getElementById('popover-terrain-exaggeration-slider')).not.toBeNull();
      expect(document.getElementById('popover-terrain-exaggeration-val')).not.toBeNull();
    });

    it('should contain GEE Analysis controls', () => {
      expect(document.getElementById('btn-focus-gee-area')).not.toBeNull();
      expect(document.getElementById('gee-opacity-slider')).not.toBeNull();
      expect(document.getElementById('toggle-gee-lst')).not.toBeNull();
      expect(document.getElementById('toggle-gee-poi')).not.toBeNull();
      expect(document.getElementById('toggle-gee-elevation')).not.toBeNull();
      expect(document.getElementById('toggle-gee-landcover')).not.toBeNull();
      expect(document.getElementById('btn-download-geojson')).not.toBeNull();
      expect(document.getElementById('btn-download-csv')).not.toBeNull();
      expect(document.getElementById('btn-download-geotiff')).not.toBeNull();
    });

    it('should contain Spatial Measurement (Turf.js) controls', () => {
      expect(document.getElementById('btn-measure-dist')).not.toBeNull();
      expect(document.getElementById('btn-measure-area')).not.toBeNull();
      expect(document.getElementById('btn-measure-clear')).not.toBeNull();
      expect(document.getElementById('measure-instruction-box')).not.toBeNull();
      expect(document.getElementById('measure-result-card')).not.toBeNull();
      expect(document.getElementById('measure-result-value')).not.toBeNull();
    });

    it('should contain Point Inspector and Telemetry Status bar elements', () => {
      expect(document.getElementById('floating-inspector-card')).not.toBeNull();
      expect(document.getElementById('floating-insp-close')).not.toBeNull();
      expect(document.getElementById('insp-lat')).not.toBeNull();
      expect(document.getElementById('insp-lng')).not.toBeNull();
      expect(document.getElementById('insp-coord-decimal')).not.toBeNull();
      expect(document.getElementById('insp-elevation')).not.toBeNull();
      expect(document.getElementById('insp-lst')).not.toBeNull();
      expect(document.getElementById('btn-insp-copy-coords')).not.toBeNull();

      expect(document.getElementById('stat-lat')).not.toBeNull();
      expect(document.getElementById('stat-lng')).not.toBeNull();
      expect(document.getElementById('stat-zoom')).not.toBeNull();
      expect(document.getElementById('stat-pitch')).not.toBeNull();
      expect(document.getElementById('stat-bearing')).not.toBeNull();
      expect(document.getElementById('btn-copy-coords')).not.toBeNull();
    });
  });

  describe('2. SidebarUI Tab Navigation Interaction', () => {
    it('should switch active tabs and display corresponding panels correctly', () => {
      const sidebar = new SidebarUI();

      // Switch to Piksel
      sidebar.setActiveTab('piksel');
      expect(document.querySelector('.sidebar-tab-btn[data-tab="piksel"]')?.classList.contains('active')).toBe(true);
      expect(document.getElementById('panel-piksel')?.classList.contains('active')).toBe(true);
      expect(document.querySelector('.sidebar-tab-btn[data-tab="map"]')?.classList.contains('active')).toBe(false);

      // Switch to GEE
      sidebar.setActiveTab('gee');
      expect(document.querySelector('.sidebar-tab-btn[data-tab="gee"]')?.classList.contains('active')).toBe(true);
      expect(document.getElementById('panel-gee')?.classList.contains('active')).toBe(true);

      // Switch to Measure
      sidebar.setActiveTab('measure');
      expect(document.querySelector('.sidebar-tab-btn[data-tab="measure"]')?.classList.contains('active')).toBe(true);
      expect(document.getElementById('panel-measure')?.classList.contains('active')).toBe(true);

      // Collapse & Expand Sidebar
      sidebar.setOpen(false);
      expect(document.getElementById('sidebar')?.classList.contains('collapsed')).toBe(true);

      sidebar.setOpen(true);
      expect(document.getElementById('sidebar')?.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('3. BasemapCustomizerUI Popover & Engine State Sync', () => {
    let mockMap: any;
    let customizer: BasemapCustomizer;
    let customizerUI: BasemapCustomizerUI;

    beforeEach(() => {
      const layers: any[] = [];
      const sources: any = {};
      mockMap = {
        getStyle: vi.fn().mockReturnValue({ layers: [] }),
        setLayoutProperty: vi.fn(),
        setPaintProperty: vi.fn(),
        setTerrain: vi.fn(),
        addSource: vi.fn((id, src) => { sources[id] = src; }),
        getSource: vi.fn((id) => sources[id]),
        removeSource: vi.fn((id) => { delete sources[id]; }),
        addLayer: vi.fn((l) => { layers.push(l); }),
        getLayer: vi.fn((id) => layers.find(l => l.id === id)),
        removeLayer: vi.fn((id) => {
          const idx = layers.findIndex(l => l.id === id);
          if (idx !== -1) layers.splice(idx, 1);
        }),
        on: vi.fn(),
        easeTo: vi.fn(),
        getPitch: vi.fn().mockReturnValue(0),
        getZoom: vi.fn().mockReturnValue(10)
      };

      customizer = new BasemapCustomizer(mockMap);
      customizerUI = new BasemapCustomizerUI(customizer);
    });

    it('should open and close floating popovers with exclusive visibility', () => {
      const basemapPopover = document.getElementById('basemap-popover');
      const sublayersPopover = document.getElementById('sublayers-popover');
      const terrainPopover = document.getElementById('terrain-popover');

      expect(basemapPopover?.style.display).toBe('none');

      // Toggle Basemap Popover
      customizerUI.togglePopover('basemap-popover');
      expect(basemapPopover?.style.display).toBe('block');
      expect(sublayersPopover?.style.display).toBe('none');
      expect(terrainPopover?.style.display).toBe('none');

      // Toggle Sublayers Popover (should close basemap popover)
      customizerUI.togglePopover('sublayers-popover');
      expect(basemapPopover?.style.display).toBe('none');
      expect(sublayersPopover?.style.display).toBe('block');
      expect(terrainPopover?.style.display).toBe('none');

      // Close all
      customizerUI.closeAllPopovers();
      expect(basemapPopover?.style.display).toBe('none');
      expect(sublayersPopover?.style.display).toBe('none');
      expect(terrainPopover?.style.display).toBe('none');
    });

    it('should sync 3D terrain toggling and vertical exaggeration slider', () => {
      customizer.toggle3DTerrain(true);
      expect(customizer.getState().terrain3D).toBe(true);

      customizer.setTerrainExaggeration(2.5);
      expect(customizer.getState().terrainExaggeration).toBe(2.5);

      const masterToggle = document.getElementById('popover-terrain-master-toggle') as HTMLInputElement;
      const exagVal = document.getElementById('popover-terrain-exaggeration-val');
      const dockBtn = document.getElementById('btn-toggle-terrain');
      expect(masterToggle.checked).toBe(true);
      expect(exagVal?.innerText).toBe('2.50x');
      expect(dockBtn?.classList.contains('active')).toBe(true);

      // Toggle off via customizer engine
      customizer.toggle3DTerrain(false);
      expect(customizer.getState().terrain3D).toBe(false);
      expect(masterToggle.checked).toBe(false);
      expect(dockBtn?.classList.contains('active')).toBe(false);
    });

    it('should sync Global Overlays (Hillshade)', () => {
      customizer.toggleTerrainHillshade(true);
      expect(customizer.getState().terrainHillshade).toBe(true);
      const hillshadeCheck = document.getElementById('popover-check-hillshade') as HTMLInputElement;
      expect(hillshadeCheck.checked).toBe(true);

      customizer.toggleTerrainHillshade(false);
      expect(customizer.getState().terrainHillshade).toBe(false);
      expect(hillshadeCheck.checked).toBe(false);
    });

    it('should sync Vector Sublayer bulk operations (Semua & Mute)', () => {
      customizer.setAllSublayers(false);
      expect(customizer.getState().sublayers.poi).toBe(false);
      expect(customizer.getState().sublayers.roads).toBe(false);

      const poiCheck = document.getElementById('popover-check-poi') as HTMLInputElement;
      expect(poiCheck.checked).toBe(false);

      customizer.setAllSublayers(true);
      expect(customizer.getState().sublayers.poi).toBe(true);
      expect(customizer.getState().sublayers.roads).toBe(true);
      expect(poiCheck.checked).toBe(true);
    });
  });

  describe('4. Piksel EO WMS Temporal & TimeMode Architecture', () => {
    it('should have correct timeMode defined for all Piksel products', () => {
      const annualProducts = ['s2-geomad-rgb', 's2-geomad-nir', 's2-ndvi', 's2-ndwi', 's2-bsi', 's2-count'];
      annualProducts.forEach((id) => {
        const prod = PIKSEL_PRODUCTS.find(p => p.id === id);
        expect(prod).toBeDefined();
        expect(prod?.timeMode, `Product ${id} should have timeMode: annual`).toBe('annual');
        expect(prod?.minZoom, `Product ${id} should have minZoom >= 8`).toBeGreaterThanOrEqual(8);
      });

      const landsatProd = PIKSEL_PRODUCTS.find(p => p.id === 'ls9-sr');
      expect(landsatProd).toBeDefined();
      expect(landsatProd?.timeMode).toBe('year-range');
      expect(landsatProd?.minZoom).toBe(7);
      expect(landsatProd?.availableYears).toContain('2026');
      expect(landsatProd?.availableYears).toContain('2021');

      const floodProd = PIKSEL_PRODUCTS.find(p => p.id === 'flood-hazard-rp02');
      expect(floodProd).toBeDefined();
      expect(floodProd?.timeMode).toBe('none');
      expect(floodProd?.timeEnabled).toBe(false);
    });
  });

  describe('5. Point Inspector Coordinate Inspection', () => {
    it('should inspect coordinates and populate inspector DOM elements accurately', () => {
      const containerDiv = document.createElement('div');
      const mockMap: any = {
        on: vi.fn(),
        off: vi.fn(),
        loaded: vi.fn().mockReturnValue(true),
        isMoving: vi.fn().mockReturnValue(false),
        isZooming: vi.fn().mockReturnValue(false),
        isRotating: vi.fn().mockReturnValue(false),
        _camera: { transform: { width: 800, height: 600, center: { lng: 106, lat: -6 }, zoom: 10, pitch: 0, bearing: 0, getCoveringTilesDetailsProvider: vi.fn().mockReturnValue({ allowWorldCopies: vi.fn().mockReturnValue(false) }) } },
        project: vi.fn().mockReturnValue(new maplibregl.Point(100, 100)),
        transform: { width: 800, height: 600, center: { lng: 106, lat: -6 }, zoom: 10, pitch: 0, bearing: 0, locationPoint: vi.fn().mockReturnValue(new maplibregl.Point(100, 100)), getCoveringTilesDetailsProvider: vi.fn().mockReturnValue({ allowWorldCopies: vi.fn().mockReturnValue(false) }) },
        getCanvas: vi.fn().mockReturnValue({ style: {} }),
        getCanvasContainer: vi.fn().mockReturnValue(containerDiv)
      };

      const inspector = new PointInspector(mockMap);
      inspector.inspectCoordinate(106.8456, -6.2088);

      const latEl = document.getElementById('insp-lat');
      const lngEl = document.getElementById('insp-lng');
      const decEl = document.getElementById('insp-coord-decimal');
      expect(latEl?.innerText).toContain('6°');
      expect(latEl?.innerText).toContain('S');
      expect(lngEl?.innerText).toContain('106°');
      expect(lngEl?.innerText).toContain('E');
      expect(decEl?.innerText).toContain('-6.2088');
      expect(document.getElementById('floating-inspector-card')?.classList.contains('active')).toBe(true);

      inspector.close();
      expect(document.getElementById('floating-inspector-card')?.classList.contains('active')).toBe(false);
    });
  });

  describe('6. Permalink State Hash Serialization & Parsing', () => {
    it('should serialize and parse map camera, 3D terrain, and overlay states', () => {
      const hash = '#map=5.50/-2.5000/117.5000/25/45&proj=globe&basemap=osm-standard&product=s2-ndvi&year=2024&p_op=0.90&terrain=1&hillshade=1&gee=lst,elevation&g_op=0.75';
      const parsed = PermalinkManager.parseHash(hash);

      expect(parsed.zoom).toBe(5.5);
      expect(parsed.lat).toBe(-2.5);
      expect(parsed.lng).toBe(117.5);
      expect(parsed.pitch).toBe(25);
      expect(parsed.bearing).toBe(45);
      expect(parsed.basemapId).toBe('osm-standard');
      expect(parsed.projection).toBe('globe');
      expect(parsed.productId).toBe('s2-ndvi');
      expect(parsed.year).toBe('2024');
      expect(parsed.pikselOpacity).toBe(0.9);
      expect(parsed.terrain3D).toBe(true);
      expect(parsed.terrainHillshade).toBe(true);
      expect(parsed.geeLayers).toContain('lst');
      expect(parsed.geeLayers).toContain('elevation');
      expect(parsed.geeOpacity).toBe(0.75);
    });
  });

  describe('7. Smart Navigation & Interactive Guided Tour (9.8/10 Standards)', () => {
    it('should have autoFlyToOptimalView on PikselLoader for low-zoom imagery selection', () => {
      const flyToMock = vi.fn();
      const easeToMock = vi.fn();
      const mockMap: any = {
        getZoom: () => 4.5,
        flyTo: flyToMock,
        easeTo: easeToMock,
        on: vi.fn(),
        getStyle: () => ({}),
        getLayer: vi.fn(),
        getSource: vi.fn()
      };

      const loader = new PikselLoader(mockMap);
      const target = loader.autoFlyToOptimalView('s2-geomad-rgb');
      expect(target).toBe('Bromo Tengger Semeru');
      expect(flyToMock).toHaveBeenCalled();
    });

    it('should initialize and progress through the 3-step Guided Tour', async () => {
      const flyToMock = vi.fn();
      const mockMap: any = {
        getZoom: () => 4.5,
        flyTo: flyToMock,
        easeTo: vi.fn(),
        on: vi.fn(),
        getStyle: () => ({}),
        getLayer: vi.fn(),
        getSource: vi.fn()
      };

      const mockMapManager: any = {
        getMap: () => mockMap,
        getCurrentBasemapId: () => 'esri-imagery',
        setBasemap: vi.fn()
      };

      const mockSidebar: any = {
        setActiveTab: vi.fn()
      };

      const tour = new GuidedTourUI(mockMapManager, null, null, null, mockSidebar);
      const steps = tour.getSteps();
      expect(steps.length).toBe(3);
      expect(steps[0].title).toContain('Bromo');
      expect(steps[1].title).toContain('Urban Heat Island');
      expect(steps[2].title).toContain('Bandung');

      // Start Tour
      await tour.startTour();
      const tourCard = document.getElementById('webgis-tour-card');
      expect(tourCard).not.toBeNull();
      expect(tourCard?.querySelector('.tour-title')?.textContent).toContain('Bromo');

      // Step Next
      await tour.nextStep();
      expect(tourCard?.querySelector('.tour-title')?.textContent).toContain('Urban Heat Island');

      // Step Next to 3
      await tour.nextStep();
      expect(tourCard?.querySelector('.tour-title')?.textContent).toContain('Bandung');

      // End Tour
      tour.endTour();
      expect(document.getElementById('webgis-tour-card')).toBeNull();
    });
  });
});
