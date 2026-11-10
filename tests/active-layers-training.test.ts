// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActiveLayersUI } from '../src/ui/active-layers';
import { MapManager } from '../src/map/map-manager';
import { PikselLoader } from '../src/tools/piksel-loader';
import { GEELoader } from '../src/tools/gee-loader';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { MeasureTool } from '../src/tools/measure';
import { TrainingSampler } from '../src/tools/training-sampler';

describe('ActiveLayersUI Training Samples Integration', () => {
  let mockMap: any;
  let mapManager: MapManager;
  let pikselLoader: PikselLoader;
  let geeLoader: GEELoader;
  let geojsonLoader: GeoJsonLoader;
  let measureTool: MeasureTool;
  let trainingSampler: TrainingSampler;
  let activeLayersUI: ActiveLayersUI;
  let onNavigateTab: any;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="active-layers-container"></div>
      <div id="map-status-pill" style="display: none;"></div>
      <button id="subtab-btn-training"></button>
    `;

    mockMap = {
      getStyle: vi.fn().mockReturnValue({ layers: [] }),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue({}),
      getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
      addLayer: vi.fn(),
      addSource: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
      getCanvas: vi.fn().mockReturnValue({ style: {} })
    };

    mapManager = new MapManager('map');
    (mapManager as any).map = mockMap;
    pikselLoader = new PikselLoader(mockMap);
    geeLoader = new GEELoader(mockMap);
    geojsonLoader = new GeoJsonLoader(mockMap);
    measureTool = new MeasureTool(mockMap);
    trainingSampler = new TrainingSampler(mockMap);
    onNavigateTab = vi.fn();

    activeLayersUI = new ActiveLayersUI(
      'active-layers-container',
      mapManager,
      pikselLoader,
      geeLoader,
      geojsonLoader,
      measureTool,
      onNavigateTab,
      trainingSampler
    );
  });

  it('should not display training samples row when 0 samples exist', () => {
    expect(activeLayersUI).toBeDefined();
    const container = document.getElementById('active-layers-container');
    expect(container?.innerHTML).not.toContain('Titik Sampel Latih');
  });

  it('should render training samples row dynamically when samples are added', () => {
    trainingSampler.setActiveClass(1);
    trainingSampler.addSample([106.8, -6.2], 'manual');
    trainingSampler.setActiveClass(2);
    trainingSampler.addSample([107.6, -6.9], 'manual');

    const container = document.getElementById('active-layers-container');
    expect(container?.innerHTML).toContain('Titik Sampel Latih (Ground Truth)');
    expect(container?.innerHTML).toContain('2 titik');
    expect(container?.innerHTML).toContain('btn-toggle-training-samples');
    expect(container?.innerHTML).toContain('btn-remove-active-training-samples');
  });

  it('should toggle layer visibility when eye button is clicked', () => {
    trainingSampler.addSample([100, 0], 'manual');
    expect(trainingSampler.isLayerVisible()).toBe(true);

    const eyeBtn = document.querySelector<HTMLElement>('.btn-toggle-training-samples');
    eyeBtn?.click();

    expect(trainingSampler.isLayerVisible()).toBe(false);
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('training-samples-layer', 'visibility', 'none');

    // Click again to re-enable
    const eyeBtnAfter = document.querySelector<HTMLElement>('.btn-toggle-training-samples');
    eyeBtnAfter?.click();
    expect(trainingSampler.isLayerVisible()).toBe(true);
  });

  it('should trigger zoomToExtent when Zoom button is clicked', () => {
    trainingSampler.addSample([100, 0], 'manual');
    const zoomSpy = vi.spyOn(trainingSampler, 'zoomToExtent');

    // Click row body to expand details
    const rowBody = document.querySelector<HTMLElement>('.al-row-body[data-expand-id="training-samples"]');
    rowBody?.click();

    const zoomBtn = document.querySelector<HTMLElement>('.al-zoom-training-samples-btn');
    zoomBtn?.click();

    expect(zoomSpy).toHaveBeenCalled();
  });

  it('should navigate to Data tab and click training subtab when Buka Studio is clicked', () => {
    trainingSampler.addSample([100, 0], 'manual');
    const subtabTrainingBtn = document.getElementById('subtab-btn-training');
    const clickSpy = vi.spyOn(subtabTrainingBtn!, 'click');

    // Click row body to expand details
    const rowBody = document.querySelector<HTMLElement>('.al-row-body[data-expand-id="training-samples"]');
    rowBody?.click();

    const gotoBtn = document.querySelector<HTMLElement>('.al-goto-training-studio-btn');
    gotoBtn?.click();

    expect(onNavigateTab).toHaveBeenCalledWith('data');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should clear training samples when Remove button is clicked with confirmation', () => {
    trainingSampler.addSample([100, 0], 'manual');
    expect(trainingSampler.getSamples().length).toBe(1);

    const origConfirm = window.confirm;
    window.confirm = () => true;

    const removeBtn = document.querySelector<HTMLElement>('.btn-remove-active-training-samples');
    removeBtn?.click();

    expect(trainingSampler.getSamples().length).toBe(0);
    const container = document.getElementById('active-layers-container');
    expect(container?.innerHTML).not.toContain('Titik Sampel Latih');
    window.confirm = origConfirm;
  });
});
