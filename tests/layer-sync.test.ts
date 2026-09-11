// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GEELoader } from '../src/tools/gee-loader';
import { GEEPanelUI } from '../src/ui/gee-panel';
import { ActiveLayersUI } from '../src/ui/active-layers';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { PikselLoader } from '../src/tools/piksel-loader';
import { MeasureTool } from '../src/tools/measure';
import { DataPanelUI } from '../src/ui/data-panel';

describe('Layer & Checkbox UI State Synchronization', () => {
  let mockMap: any;
  let geeLoader: GEELoader;
  let geePanelUI: GEEPanelUI;
  let geojsonLoader: GeoJsonLoader;
  let pikselLoader: PikselLoader;
  let measureTool: MeasureTool;
  let activeLayersUI: ActiveLayersUI;
  let dataPanelUI: DataPanelUI;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="active-layers-container"></div>
      <div id="layers-list"></div>
      <div id="panel-gee">
        <input type="checkbox" id="toggle-gee-poi" />
        <input type="checkbox" id="toggle-gee-lst" />
        <input type="checkbox" id="toggle-gee-elevation" />
        <input type="checkbox" id="toggle-gee-landcover" />
        <input type="range" id="gee-opacity-slider" value="80" />
        <span id="gee-opacity-val">80%</span>
        <button id="btn-focus-gee-area"></button>
        <button id="btn-download-geojson"></button>
        <button id="btn-download-csv"></button>
        <button id="btn-download-geotiff"></button>
        <canvas id="gee-chart-canvas"></canvas>
      </div>
      <div id="panel-piksel"></div>
    `;

    // Mock global fetch for GEE data
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] })
      } as any)
    );

    mockMap = {
      getZoom: () => 10,
      flyTo: vi.fn(),
      easeTo: vi.fn(),
      on: vi.fn(),
      getStyle: () => ({ layers: [] }),
      getLayer: vi.fn().mockReturnValue(null),
      getSource: vi.fn().mockReturnValue(null),
      addLayer: vi.fn(),
      addSource: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      getCanvas: () => ({ style: {} })
    };

    geeLoader = new GEELoader(mockMap);
    geePanelUI = new GEEPanelUI(geeLoader);
    geePanelUI.init();

    geojsonLoader = new GeoJsonLoader(mockMap);
    pikselLoader = new PikselLoader(mockMap);
    measureTool = new MeasureTool(mockMap);

    const mockMapManager: any = {
      getMap: () => mockMap,
      getCurrentBasemapId: () => 'google-hybrid',
      enforceLayerOrder: vi.fn()
    };

    activeLayersUI = new ActiveLayersUI(
      'active-layers-container',
      mockMapManager,
      pikselLoader,
      geeLoader,
      geojsonLoader,
      measureTool
    );

    const mockSidebar: any = {
      setActiveTab: vi.fn()
    };

    dataPanelUI = new DataPanelUI(
      geojsonLoader,
      mockSidebar,
      () => {}
    );
  });

  it('should have toggle-gee-poi unchecked initially because POI is not active by default', () => {
    const poiCheckbox = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    expect(poiCheckbox.checked).toBe(false);
  });

  it('should automatically sync toggle-gee-poi when POI layer is toggled and removed', async () => {
    const poiCheckbox = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    expect(poiCheckbox.checked).toBe(false);

    // Activate POI layer explicitly
    await geeLoader.toggleLayer('poi', true);
    activeLayersUI.render();
    expect(poiCheckbox.checked).toBe(true);
    expect(geeLoader.isLayerActive('poi')).toBe(true);

    // Simulate clicking remove button on POI layer in Active Layers
    const removeBtn = document.querySelector('.btn-remove-gee-poi') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    // The POI layer is now removed from geeLoader
    expect(geeLoader.isLayerActive('poi')).toBe(false);
    // The checkbox in GEE Panel MUST be unchecked
    expect(poiCheckbox.checked).toBe(false);
  });

  it('should automatically uncheck all GEE checkboxes when "Hapus Semua Layer" (Clear All) is clicked', async () => {
    const poiCheckbox = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    const lstCheckbox = document.getElementById('toggle-gee-lst') as HTMLInputElement;

    // Activate POI and LST
    await geeLoader.toggleLayer('poi', true);
    await geeLoader.toggleLayer('lst', true);
    activeLayersUI.render();
    expect(lstCheckbox.checked).toBe(true);
    expect(poiCheckbox.checked).toBe(true);

    // Click "Clear All Overlays" button
    const clearAllBtn = document.getElementById('btn-al-clear-all') as HTMLButtonElement;
    expect(clearAllBtn).not.toBeNull();
    clearAllBtn.click();

    // Verify all GEE checkboxes are unchecked
    expect(poiCheckbox.checked).toBe(false);
    expect(lstCheckbox.checked).toBe(false);
    expect((document.getElementById('toggle-gee-elevation') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('toggle-gee-landcover') as HTMLInputElement).checked).toBe(false);

    // Verify loaders are cleared
    expect(geeLoader.isLayerActive('poi')).toBe(false);
    expect(geeLoader.isLayerActive('lst')).toBe(false);
  });

  it('should sync checkbox when geeLoader.clearAllLayers is invoked directly', async () => {
    const poiCheckbox = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    await geeLoader.toggleLayer('poi', true);
    expect(poiCheckbox.checked).toBe(true);

    geeLoader.clearAllLayers();

    expect(poiCheckbox.checked).toBe(false);
    expect(geeLoader.isLayerActive('poi')).toBe(false);
  });

  it('should sync DataPanelUI list when GeoJSON layers are cleared or removed', () => {
    // Add custom mock layer to customLayers Map
    (geojsonLoader as any).customLayers.set('test-layer-1', {
      id: 'test-layer-1',
      name: 'Test GeoJSON',
      featureCount: 5,
      color: '#ff0000',
      visible: true,
      type: 'polygon',
      data: { type: 'FeatureCollection', features: [] }
    });
    (geojsonLoader as any).notifyLayersChange();

    let list = document.getElementById('layers-list');
    expect(list?.innerHTML).toContain('Test GeoJSON');

    // Remove layer
    geojsonLoader.clearAllLayers();
    expect(list?.innerHTML).toContain('Belum ada layer vektor kustom');
  });
});
