// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpatialAnalysisUI } from '../src/ui/spatial-analysis-ui';
import { SidebarUI } from '../src/ui/sidebar';
import * as fs from 'fs';
import * as path from 'path';

const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<link[\s\S]*?>/gi, '');

describe('Spatial Analysis AOI Auto-Clearing on Tab Navigation', () => {
  let mockMap: any;
  let spatialAnalysisUI: SpatialAnalysisUI;
  let sidebarUI: SidebarUI;
  const sources: Record<string, any> = {};
  const layers: Record<string, any> = {};

  beforeEach(() => {
    document.body.innerHTML = indexHtml;

    for (const k in sources) delete sources[k];
    for (const k in layers) delete layers[k];

    mockMap = {
      getSource: vi.fn((id: string) => sources[id]),
      addSource: vi.fn((id: string, def: any) => {
        sources[id] = {
          ...def,
          setData: vi.fn((data: any) => {
            sources[id].data = data;
          })
        };
      }),
      removeSource: vi.fn((id: string) => {
        delete sources[id];
      }),
      getLayer: vi.fn((id: string) => layers[id]),
      addLayer: vi.fn((def: any) => {
        layers[def.id] = def;
      }),
      removeLayer: vi.fn((id: string) => {
        delete layers[id];
      }),
      getStyle: vi.fn(() => ({ version: 8, layers: [] })),
      getContainer: vi.fn(() => document.createElement('div')),
      getCanvas: vi.fn(() => ({
        style: { cursor: '' }
      })),
      on: vi.fn(),
      off: vi.fn(),
      flyTo: vi.fn()
    };

    // Mock fetch for offline tests
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    })));

    spatialAnalysisUI = new SpatialAnalysisUI(mockMap, 'spatial-analysis-panel');
    spatialAnalysisUI.init();

    sidebarUI = new SidebarUI();
  });

  it('should clear AOI polygon data and reset result container when clearAOI() is called', () => {
    // Select a preset region to populate active AOI
    spatialAnalysisUI.selectPresetRegion('ikn-nusantara');
    expect(spatialAnalysisUI.getActiveAOIPolygon()).toBeTruthy();
    expect(sources['aoi-analysis-source'].data.type).toBe('Feature');

    // Call clearAOI
    spatialAnalysisUI.clearAOI();

    // Verify active feature is null and source data is empty
    expect(spatialAnalysisUI.getActiveAOIPolygon()).toBeNull();
    expect(sources['aoi-analysis-source'].data).toEqual({
      type: 'FeatureCollection',
      features: []
    });

    // Verify empty state container restored
    const container = document.getElementById('aoi-analysis-results-container');
    expect(container?.innerHTML).toContain('Belum Ada Area Analisis yang Dipilih');
  });

  it('should automatically clear AOI when switching to a different sidebar tab', () => {
    // Select a preset first
    spatialAnalysisUI.selectPresetRegion('ikn-nusantara');
    expect(spatialAnalysisUI.getActiveAOIPolygon()).toBeTruthy();

    // Switch sidebar tab to 'map'
    sidebarUI.setActiveTab('map');

    // AOI should now be completely cleared
    expect(spatialAnalysisUI.getActiveAOIPolygon()).toBeNull();
    expect(sources['aoi-analysis-source'].data).toEqual({
      type: 'FeatureCollection',
      features: []
    });
  });

  it('should cleanly abort active drawing mode when clearAOI() is invoked', () => {
    // Start drawing
    spatialAnalysisUI.startDrawing();
    expect(spatialAnalysisUI.isDrawingActive()).toBe(true);

    // Call clearAOI
    spatialAnalysisUI.clearAOI();

    expect(spatialAnalysisUI.isDrawingActive()).toBe(false);
    expect(spatialAnalysisUI.getActiveAOIPolygon()).toBeNull();

    // Drawing action buttons should be hidden and start button restored
    const drawBtn = document.getElementById('btn-start-draw-aoi');
    const drawingActions = document.getElementById('aoi-drawing-actions');
    expect(drawBtn?.style.display).toBe('inline-flex');
    expect(drawingActions?.style.display).toBe('none');
  });
});
