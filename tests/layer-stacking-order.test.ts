// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MapManager } from '../src/map/map-manager';
import { SpatialAnalysisUI } from '../src/ui/spatial-analysis-ui';

describe('MapManager Layer Stacking & Analysis Layer Visibility', () => {
  let mapManager: MapManager;
  let mockMap: any;
  let layerStack: string[] = [];

  beforeEach(() => {
    layerStack = [];
    document.body.innerHTML = `
      <div id="map"></div>
      <div id="spatial-analysis-panel"></div>
    `;

    mockMap = {
      getStyle: vi.fn().mockReturnValue({ layers: [] }),
      getSource: vi.fn().mockReturnValue(null),
      addSource: vi.fn(),
      getLayer: vi.fn((id: string) => (layerStack.includes(id) ? { id } : null)),
      addLayer: vi.fn((layer: any, beforeId?: string) => {
        if (beforeId && layerStack.includes(beforeId)) {
          const idx = layerStack.indexOf(beforeId);
          layerStack.splice(idx, 0, layer.id);
        } else {
          layerStack.push(layer.id);
        }
      }),
      removeLayer: vi.fn((id: string) => {
        layerStack = layerStack.filter(l => l !== id);
      }),
      removeSource: vi.fn(),
      moveLayer: vi.fn((id: string, beforeId?: string) => {
        layerStack = layerStack.filter(l => l !== id);
        if (beforeId && layerStack.includes(beforeId)) {
          const idx = layerStack.indexOf(beforeId);
          layerStack.splice(idx, 0, id);
        } else {
          layerStack.push(id);
        }
      }),
      on: vi.fn(),
      once: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      flyTo: vi.fn(),
      getCanvas: vi.fn().mockReturnValue({ style: {} })
    };

    mapManager = new MapManager('map');
    (mapManager as any).map = mockMap;
  });

  it('should maintain Spatial Analysis AOI layers above GEE raster and vector layers in enforceLayerOrder', () => {
    const mockPiksel = {
      getAllMapLayerIds: () => ['piksel-wms-layer', 'piksel-grid-fill', 'piksel-grid-line']
    };

    const mockGee = {
      getAllMapLayerIds: () => [
        'gee-modis-day-wms-layer',
        'gee-modis-night-wms-layer',
        'gee-modis-landcover-layer',
        'gee-modis-lst-day-fill',
        'gee-modis-stations-circles',
        'gee-modis-stations-labels'
      ]
    };

    const mockGeoJson = {
      getAllMapLayerIds: () => ['custom-layer-buffer-fill', 'custom-layer-buffer-line']
    };

    const mockAnalysis = {
      getAllMapLayerIds: () => ['aoi-analysis-fill', 'aoi-analysis-line', 'aoi-vertices-layer']
    };

    const mockMeasure = {
      getAllMapLayerIds: () => ['measure-fill', 'measure-line', 'measure-points']
    };

    mapManager.setPikselLoader(mockPiksel);
    mapManager.setGeeLoader(mockGee);
    mapManager.setGeoJsonLoader(mockGeoJson);
    mapManager.setSpatialAnalysisUI(mockAnalysis);
    mapManager.setMeasureTool(mockMeasure);

    // Populate simulated layers on map in arbitrary inverted order
    layerStack = [
      'measure-points',
      'aoi-analysis-fill',
      'aoi-analysis-line',
      'aoi-vertices-layer',
      'custom-layer-buffer-fill',
      'gee-modis-day-wms-layer',
      'gee-modis-stations-circles',
      'piksel-wms-layer'
    ];

    // Execute layer re-ordering
    mapManager.executeEnforceLayerOrder();

    // Verification: Analysis layer MUST be placed after (above) GEE rasters and GEE vector stations
    const pikselIdx = layerStack.indexOf('piksel-wms-layer');
    const geeRasterIdx = layerStack.indexOf('gee-modis-day-wms-layer');
    const geeStationsIdx = layerStack.indexOf('gee-modis-stations-circles');
    const bufferIdx = layerStack.indexOf('custom-layer-buffer-fill');
    const aoiFillIdx = layerStack.indexOf('aoi-analysis-fill');
    const aoiLineIdx = layerStack.indexOf('aoi-analysis-line');
    const measureIdx = layerStack.indexOf('measure-points');

    expect(pikselIdx).toBeLessThan(geeRasterIdx);
    expect(geeRasterIdx).toBeLessThan(geeStationsIdx);
    expect(geeStationsIdx).toBeLessThan(bufferIdx);
    expect(bufferIdx).toBeLessThan(aoiFillIdx);
    expect(aoiFillIdx).toBeLessThan(aoiLineIdx);
    expect(aoiLineIdx).toBeLessThan(measureIdx);
  });

  it('should register spatialAnalysisUI lifecycle and restore layers after style change', () => {
    const analysisUI = new SpatialAnalysisUI(mockMap, 'spatial-analysis-panel');
    let layersChangeFired = false;
    analysisUI.onLayersChange(() => {
      layersChangeFired = true;
    });

    analysisUI.init();
    expect(analysisUI.getAllMapLayerIds()).toEqual([
      'aoi-analysis-fill',
      'aoi-analysis-line',
      'aoi-rubberband-layer',
      'aoi-vertices-layer'
    ]);

    analysisUI.restoreAfterStyleChange();
    expect(layersChangeFired).toBe(true);
  });
});
