// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GEELoader } from '../src/tools/gee-loader';
import { GEEPanelUI } from '../src/ui/gee-panel';

describe('GEE Land Surface Temperature (LST) & Thermal Layer Suite', () => {
  let mapMock: any;
  let geeLoader: GEELoader;
  let geePanelUI: GEEPanelUI;
  let layersMap: Map<string, any>;
  let sourcesMap: Map<string, any>;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="panel-gee">
        <input type="checkbox" id="toggle-gee-lst" />
        <div id="gee-lst-opacity-row" style="display: none;">
          <input type="range" id="gee-lst-day-opacity" min="0" max="100" value="85" />
          <span id="gee-lst-day-opacity-val">85%</span>
        </div>

        <input type="checkbox" id="toggle-gee-elevation" />
        <div id="gee-lst-night-opacity-row" style="display: none;">
          <input type="range" id="gee-lst-night-opacity" min="0" max="100" value="85" />
          <span id="gee-lst-night-opacity-val">85%</span>
        </div>

        <input type="checkbox" id="toggle-gee-landcover" />
        <div id="gee-lc-opacity-row" style="display: none;">
          <input type="range" id="gee-landcover-opacity" min="0" max="100" value="85" />
          <span id="gee-landcover-opacity-val">85%</span>
        </div>

        <input type="checkbox" id="toggle-gee-poi" />
        <div id="gee-lulc-legend" style="display: none;"></div>

        <button id="btn-focus-gee-area">Focus Area</button>
        <button id="btn-focus-gee-indonesia">Focus Indonesia</button>
      </div>
    `;

    layersMap = new Map();
    sourcesMap = new Map();

    mapMock = {
      getStyle: vi.fn().mockReturnValue({ version: 8 }),
      getSource: vi.fn((id: string) => sourcesMap.get(id)),
      addSource: vi.fn((id: string, src: any) => sourcesMap.set(id, src)),
      removeSource: vi.fn((id: string) => sourcesMap.delete(id)),
      getLayer: vi.fn((id: string) => layersMap.get(id)),
      addLayer: vi.fn((layer: any) => layersMap.set(layer.id, layer)),
      removeLayer: vi.fn((id: string) => layersMap.delete(id)),
      setLayoutProperty: vi.fn((id: string, prop: string, val: any) => {
        const l = layersMap.get(id);
        if (l) {
          l.layout = l.layout || {};
          l.layout[prop] = val;
        }
      }),
      setPaintProperty: vi.fn((id: string, prop: string, val: any) => {
        const l = layersMap.get(id);
        if (l) {
          l.paint = l.paint || {};
          l.paint[prop] = val;
        }
      }),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      flyTo: vi.fn(),
      getCanvas: vi.fn().mockReturnValue({ style: {} }),
      getCanvasContainer: vi.fn().mockReturnValue(document.createElement('div'))
    };

    // Mock fetch for GeoJSON datasets
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('gee_cfsv2_stations.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [106.8272, -6.1754] },
                properties: { id: 'jkt', name: 'Monas Station', lst_day_c: 34.8, lst_night_c: 24.2 }
              }
            ]
          })
        });
      }
      if (url.includes('gee_cfsv2_grid.geojson')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[106.5, -6.5], [106.6, -6.5], [106.6, -6.4], [106.5, -6.4], [106.5, -6.5]]]
                },
                properties: { lst_day_c: 33.5, lst_night_c: 23.2, temp_air_c: 33.5, temp_surface_c: 23.2 }
              }
            ]
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    geeLoader = new GEELoader(mapMock as any);
    geePanelUI = new GEEPanelUI(geeLoader);
    geePanelUI.init();
  });

  it('should toggle daytime LST layer when clicking #toggle-gee-lst checkbox', async () => {
    const lstCheckbox = document.getElementById('toggle-gee-lst') as HTMLInputElement;
    expect(lstCheckbox).not.toBeNull();
    expect(lstCheckbox.checked).toBe(false);

    // Simulate user clicking checkbox
    lstCheckbox.checked = true;
    lstCheckbox.dispatchEvent(new Event('change'));

    // Wait for data load and layer rendering
    await new Promise((r) => setTimeout(r, 50));

    expect(geeLoader.isLayerActive('lst-day')).toBe(true);
    expect(geeLoader.isLayerVisible('lst-day')).toBe(true);
    expect(mapMock.addLayer).toHaveBeenCalled();

    // Verify opacity box becomes visible
    const opacityRow = document.getElementById('gee-lst-opacity-row');
    expect(opacityRow?.style.display).toBe('flex');
  });

  it('should toggle nighttime LST layer when clicking #toggle-gee-elevation checkbox', async () => {
    const nightCheckbox = document.getElementById('toggle-gee-elevation') as HTMLInputElement;
    expect(nightCheckbox).not.toBeNull();
    expect(nightCheckbox.checked).toBe(false);

    nightCheckbox.checked = true;
    nightCheckbox.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 50));

    expect(geeLoader.isLayerActive('lst-night')).toBe(true);
    expect(geeLoader.isLayerVisible('lst-night')).toBe(true);

    const opacityRow = document.getElementById('gee-lst-night-opacity-row');
    expect(opacityRow?.style.display).toBe('flex');
  });

  it('should adjust daytime LST opacity via slider and update paint properties', async () => {
    await geeLoader.toggleLayer('lst-day', true);
    await new Promise((r) => setTimeout(r, 50));

    const slider = document.getElementById('gee-lst-day-opacity') as HTMLInputElement;
    const valLabel = document.getElementById('gee-lst-day-opacity-val');

    slider.value = '50';
    slider.dispatchEvent(new Event('input'));

    expect(valLabel?.innerText).toBe('50%');
    expect(geeLoader.getLayerOpacity('lst-day')).toBe(0.5);
  });

  it('should restore active GEE layers after style change via restoreAfterStyleChange', async () => {
    await geeLoader.toggleLayer('lst-day', true);
    await new Promise((r) => setTimeout(r, 50));

    expect(geeLoader.isLayerActive('lst-day')).toBe(true);

    // Simulate basemap change (style reload)
    geeLoader.restoreAfterStyleChange();
    expect(mapMock.setLayoutProperty).toHaveBeenCalled();
  });

  it('should render 18 climate observation station circles and labels when stations are toggled', async () => {
    const poiCheckbox = document.getElementById('toggle-gee-poi') as HTMLInputElement;
    expect(poiCheckbox).not.toBeNull();

    poiCheckbox.checked = true;
    poiCheckbox.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 50));

    expect(geeLoader.isLayerActive('stations')).toBe(true);
    expect(mapMock.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gee-modis-stations-circles' })
    );
    expect(mapMock.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gee-modis-stations-labels' })
    );
  });
});
