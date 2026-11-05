// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeasureTool } from '../src/tools/measure';
import { SpatialAnalysisUI } from '../src/ui/spatial-analysis-ui';
import { SidebarUI } from '../src/ui/sidebar';
import * as fs from 'fs';
import * as path from 'path';

// Read index.html for DOM element verification (stripping script and link tags for happy-dom parser)
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<link[\s\S]*?>/gi, '');

describe('MeasureTool Fullscreen Mode, Floating Action Pill & Mutual Exclusion', () => {
  let mockMap: any;
  let measureTool: MeasureTool;
  let spatialAnalysisUI: SpatialAnalysisUI;
  let sidebarUI: SidebarUI;

  beforeEach(() => {
    document.body.innerHTML = indexHtml;

    // Mock MapLibre map instance
    const sources: Record<string, any> = {};
    const layers: Record<string, any> = {};
    const mockCanvas = {
      style: { cursor: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

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
      setLayoutProperty: vi.fn((layerId: string, prop: string, val: any) => {
        if (layers[layerId]) {
          layers[layerId].layout = layers[layerId].layout || {};
          layers[layerId].layout[prop] = val;
        }
      }),
      getStyle: vi.fn(() => ({ version: 8, layers: [] })),
      getContainer: vi.fn(() => document.createElement('div')),
      getCanvas: vi.fn(() => mockCanvas),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      queryTerrainElevation: vi.fn(() => 150)
    };

    sidebarUI = new SidebarUI();
    measureTool = new MeasureTool(mockMap);
    spatialAnalysisUI = new SpatialAnalysisUI(mockMap, 'spatial-analysis-panel');
  });

  it('should have #measure-floating-pill with undo, cancel, and finish buttons in DOM', () => {
    const pill = document.getElementById('measure-floating-pill');
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('role')).toBe('toolbar');

    const statusText = document.getElementById('measure-pill-status-text');
    expect(statusText).not.toBeNull();

    const undoBtn = document.getElementById('btn-measure-pill-undo');
    const cancelBtn = document.getElementById('btn-measure-pill-cancel');
    const finishBtn = document.getElementById('btn-measure-pill-finish');

    expect(undoBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();
    expect(finishBtn).not.toBeNull();
  });

  it('should enter fullscreen drawing mode and show floating pill on setMode("distance")', () => {
    let collapseSidebarTriggered = false;
    window.addEventListener('webgis:collapse-sidebar-for-drawing', () => {
      collapseSidebarTriggered = true;
    });

    measureTool.setMode('distance');

    expect(collapseSidebarTriggered).toBe(true);
    expect(document.body.classList.contains('measure-drawing-active')).toBe(true);

    const pill = document.getElementById('measure-floating-pill');
    expect(pill?.style.display).toBe('flex');

    const statusText = document.getElementById('measure-pill-status-text');
    expect(statusText?.innerHTML).toContain('Mode Ukur Jarak');
  });

  it('should update floating pill status dynamically as distance points are added and undone', () => {
    measureTool.setMode('distance');
    const statusText = document.getElementById('measure-pill-status-text');

    // Add first point
    (measureTool as any).addPoint([106.8456, -6.2088]); // Jakarta
    expect(statusText?.innerHTML).toContain('1 Titik');

    // Add second point
    (measureTool as any).addPoint([107.6191, -6.9175]); // Bandung (~118 km)
    expect(statusText?.innerHTML).toContain('Jarak:');
    expect(statusText?.innerHTML).toContain('2 Simpul');
    expect(statusText?.innerHTML).toContain('km');

    // Undo last point
    measureTool.undoLastPoint();
    expect(statusText?.innerHTML).toContain('1 Titik');

    // Undo remaining point
    measureTool.undoLastPoint();
    expect(statusText?.innerHTML).toContain('Mode Ukur Jarak');
  });

  it('should enter area mode and update floating pill status with area calculations', () => {
    measureTool.setMode('area');
    const statusText = document.getElementById('measure-pill-status-text');
    expect(statusText?.innerHTML).toContain('Mode Ukur Luas');

    // Add points
    (measureTool as any).addPoint([106.8, -6.2]);
    (measureTool as any).addPoint([106.9, -6.2]);
    expect(statusText?.innerHTML).toContain('2 Simpul');

    (measureTool as any).addPoint([106.85, -6.1]);
    expect(statusText?.innerHTML).toContain('Luas:');
    expect(statusText?.innerHTML).toContain('3 Simpul');
  });

  it('should restore sidebar and remove drawing-active class on finishMeasurement', () => {
    let restoreSidebarTriggered = false;
    window.addEventListener('webgis:restore-sidebar-after-drawing', () => {
      restoreSidebarTriggered = true;
    });

    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    (measureTool as any).addPoint([107.6, -6.9]);

    measureTool.finishMeasurement();

    expect(restoreSidebarTriggered).toBe(true);
    expect(document.body.classList.contains('measure-drawing-active')).toBe(false);

    const pill = document.getElementById('measure-floating-pill');
    expect(pill?.style.display).toBe('none');
  });

  it('should restore sidebar and clear layers on cancelMeasurement', () => {
    let restoreSidebarTriggered = false;
    window.addEventListener('webgis:restore-sidebar-after-drawing', () => {
      restoreSidebarTriggered = true;
    });

    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);

    measureTool.cancelMeasurement();

    expect(restoreSidebarTriggered).toBe(true);
    expect(measureTool.getMode()).toBe('none');
    expect(document.body.classList.contains('measure-drawing-active')).toBe(false);

    const pill = document.getElementById('measure-floating-pill');
    expect(pill?.style.display).toBe('none');
  });

  it('should strictly cancel active measurement when AOI drawing starts', () => {
    let measureCancelled = false;
    window.addEventListener('webgis:cancel-active-measure', () => {
      measureCancelled = true;
      measureTool.cancelMeasurement();
    });

    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    expect(measureTool.getMode()).toBe('distance');

    // Start AOI drawing
    spatialAnalysisUI.startDrawing();

    expect(measureCancelled).toBe(true);
    expect(measureTool.getMode()).toBe('none');
    expect(spatialAnalysisUI.isDrawingActive()).toBe(true);
  });

  it('should support multiple onTabChange callbacks and cleanly cancel active drawing on tab switch', () => {
    let tabA = '';
    let tabB = '';

    sidebarUI.onTabChange((id) => {
      tabA = id;
      if (id !== 'measure' && measureTool.isDrawingActive()) {
        measureTool.cancelMeasurement();
      }
    });

    sidebarUI.onTabChange((id) => {
      tabB = id;
    });

    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    expect(measureTool.isDrawingActive()).toBe(true);

    // Switch to analysis tab
    sidebarUI.setActiveTab('analysis');

    expect(tabA).toBe('analysis');
    expect(tabB).toBe('analysis');
    expect(measureTool.getMode()).toBe('none');
  });
  it('should reset mode to "none" and reset cursor to default on finishMeasurement', () => {
    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    (measureTool as any).addPoint([107.6, -6.9]);

    expect(measureTool.getMode()).toBe('distance');
    expect(mockMap.getCanvas().style.cursor).toBe('crosshair');

    measureTool.finishMeasurement();

    expect(measureTool.getMode()).toBe('none');
    expect(mockMap.getCanvas().style.cursor).toBe('');
    expect(document.body.classList.contains('measure-drawing-active')).toBe(false);
    expect(measureTool.hasActiveMeasurement()).toBe(true);

    // Verify subsequent click does NOT restart drawing because mode is 'none'
    const initialPointsCount = (measureTool as any).points.length;
    mockMap.on.mock.calls
      .filter(([event]: [string]) => event === 'click')
      .forEach(([, handler]: [string, any]) => handler({ lngLat: { lng: 108.0, lat: -7.0 } }));

    expect((measureTool as any).points.length).toBe(initialPointsCount);
  });

  it('should have Selesai button in #panel-measure and trigger finishMeasurement on click', () => {
    const finishBtn = document.getElementById('btn-measure-finish');
    expect(finishBtn).not.toBeNull();
    expect(finishBtn?.textContent).toContain('Selesai');

    let finished = false;
    measureTool.onFinish(() => {
      finished = true;
    });

    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    (measureTool as any).addPoint([107.6, -6.9]);

    measureTool.finishMeasurement();
    expect(finished).toBe(true);
    expect(measureTool.getMode()).toBe('none');
  });

  it('should allow clearing finished measurement via Escape key from any tab', () => {
    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    (measureTool as any).addPoint([107.6, -6.9]);
    measureTool.finishMeasurement();

    expect(measureTool.hasActiveMeasurement()).toBe(true);
    expect(measureTool.getMode()).toBe('none');

    // Press Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(measureTool.hasActiveMeasurement()).toBe(false);
    expect(mockMap.getCanvas().style.cursor).toBe('');
  });

  it('should reset mode and cursor when switching away from measure tab even if 0 points placed', () => {
    measureTool.setMode('distance');
    expect(measureTool.getMode()).toBe('distance');
    expect(mockMap.getCanvas().style.cursor).toBe('crosshair');

    // Switch to map tab via event
    window.dispatchEvent(new CustomEvent('webgis:sidebar-tab-change', { detail: { tabId: 'map' } }));

    expect(measureTool.getMode()).toBe('none');
    expect(mockMap.getCanvas().style.cursor).toBe('');
    expect(document.body.classList.contains('measure-drawing-active')).toBe(false);
  });

  it('should auto-finish measurement when switching away if points are valid', () => {
    measureTool.setMode('distance');
    (measureTool as any).addPoint([106.8, -6.2]);
    (measureTool as any).addPoint([107.6, -6.9]);
    expect(measureTool.isDrawingActive()).toBe(true);

    // Switch to data tab via event
    window.dispatchEvent(new CustomEvent('webgis:sidebar-tab-change', { detail: { tabId: 'data' } }));

    expect(measureTool.getMode()).toBe('none');
    expect(measureTool.hasActiveMeasurement()).toBe(true);
    expect(mockMap.getCanvas().style.cursor).toBe('');
    expect(document.body.classList.contains('measure-drawing-active')).toBe(false);
  });
});
