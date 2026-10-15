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

        <input type="checkbox" id="toggle-gee-precipitation" />
        <div id="gee-precip-opacity-row" style="display: none;">
          <input type="range" id="gee-precip-opacity" min="0" max="100" value="85" />
          <span id="gee-precip-opacity-val">85%</span>
        </div>
        <div id="gee-precip-legend" style="display: none;"></div>

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
      if (url.includes('/api/gee-lst-tiles')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'live',
            tileUrlTemplate: 'http://test.url/{z}/{x}/{y}'
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
    expect(mapMock.addLayer).toHaveBeenCalled();
  });



  it('should toggle precipitation layer and adjust its opacity correctly', async () => {
    const precipCheckbox = document.getElementById('toggle-gee-precipitation') as HTMLInputElement;
    expect(precipCheckbox).not.toBeNull();
    expect(precipCheckbox.checked).toBe(false);

    precipCheckbox.checked = true;
    precipCheckbox.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 50));

    expect(geeLoader.isLayerActive('precipitation')).toBe(true);
    expect(geeLoader.isLayerVisible('precipitation')).toBe(true);

    const opacityRow = document.getElementById('gee-precip-opacity-row');
    expect(opacityRow?.style.display).toBe('flex');

    const slider = document.getElementById('gee-precip-opacity') as HTMLInputElement;
    const valLabel = document.getElementById('gee-precip-opacity-val');

    slider.value = '60';
    slider.dispatchEvent(new Event('input'));

    expect(valLabel?.innerText).toBe('60%');
    expect(geeLoader.getLayerOpacity('precipitation')).toBe(0.6);
  });

  it('should query and render 100% Google Earth Engine LST temperature in live widget', async () => {
    document.body.innerHTML += `
      <div class="gee-live-weather-card">
        <span class="gee-weather-badge" id="gee-weather-time">NASA MODIS</span>
        <span class="gee-weather-icon" id="gee-weather-icon">☀️</span>
        <div id="gee-weather-temp">--.- °C</div>
        <div id="gee-weather-city">📍 Jakarta</div>
        <strong id="gee-weather-day-temp">--.- °C</strong>
        <strong id="gee-weather-night-temp">--.- °C</strong>
        <strong id="gee-weather-delta-temp">--</strong>
        <button class="gee-weather-chip" data-lat="-6.175" data-lon="106.827" data-city="Jakarta">Jakarta</button>
        <button class="gee-weather-chip" data-lat="-6.914" data-lon="107.609" data-city="Bandung">Bandung</button>
      </div>
    `;

    // Mock fetch for /api/gee-timeseries
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/api/gee-timeseries')) {
        const body = JSON.parse(opts?.body || '{}');
        const cityName = body.lat < -6.5 ? 'Bandung' : 'Jakarta';
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            source: 'MODIS/061/MOD11A2',
            point: [body.lon, body.lat],
            data: [
              { date: '2024-08-28', day_c: cityName === 'Bandung' ? 35.9 : 35.1, night_c: 24.3 }
            ]
          })
        });
      }
      return originalFetch(url, opts);
    });

    await geePanelUI.fetchLiveGEETemp(-6.175, 106.827, 'Jakarta Pusat');

    const tempEl = document.getElementById('gee-weather-temp');
    const dayEl = document.getElementById('gee-weather-day-temp');
    const nightEl = document.getElementById('gee-weather-night-temp');
    const deltaEl = document.getElementById('gee-weather-delta-temp');
    const timeEl = document.getElementById('gee-weather-time');

    expect(tempEl?.innerText).toBe('35.1 °C');
    expect(dayEl?.innerText).toBe('35.1 °C');
    expect(nightEl?.innerText).toBe('24.3 °C');
    expect(deltaEl?.innerText).toBe('+10.8 °C');
    expect(timeEl?.innerText).toBe('2024-08-28 · Terra');

    // Test clicking Bandung chip
    await geePanelUI.fetchLiveGEETemp(-6.914, 107.609, 'Bandung');
    expect(tempEl?.innerText).toBe('35.9 °C');
    expect(dayEl?.innerText).toBe('35.9 °C');
    expect(deltaEl?.innerText).toBe('+11.6 °C');

    globalThis.fetch = originalFetch;
  });

  it('should query and render 100% Google Earth Engine CHIRPS precipitation in live telemetry widget', async () => {
    document.body.innerHTML += `
      <div class="gee-live-weather-card precip-telemetry-card">
        <select id="gee-precip-period-select">
          <option value="2024-08-15" selected>Kemarau (Agu 2024)</option>
        </select>
        <span class="gee-weather-badge" id="gee-precip-status-time">01–31 Agu 2024</span>
        <span class="gee-weather-city" id="gee-precip-city">📍 Jakarta</span>
        <span class="gee-weather-icon" id="gee-precip-icon">☀️</span>
        <span class="gee-weather-source-pill" id="gee-precip-status-pill">Cerah</span>
        <div id="gee-precip-val">--.- mm/hari</div>
        <strong id="gee-precip-today-val">--.- mm</strong>
        <span id="gee-precip-today-label">Rata-rata Harian</span>
        <strong id="gee-precip-7d-val">--.- mm</strong>
        <strong id="gee-precip-30d-val">--.- mm</strong>
      </div>
    `;

    const originalFetch = globalThis.fetch;
    let requestedPayload: any = null;
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/api/gee-timeseries')) {
        requestedPayload = JSON.parse(opts?.body || '{}');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            source: 'UCSB-CHG/CHIRPS/DAILY',
            point: [requestedPayload.lon, requestedPayload.lat],
            data: [
              { date: '2024-08-01', precip: 2.0 },
              { date: '2024-08-02', precip: 6.0 },
              { date: '2024-08-03', precip: 1.0 }
            ]
          })
        });
      }
      return originalFetch(url, opts);
    });

    await geePanelUI.fetchLivePrecipitation(-6.175, 106.827, 'Jakarta Pusat');

    // Ensure it strictly targeted GEE precipitation, NOT any third-party weather API
    expect(requestedPayload).not.toBeNull();
    expect(requestedPayload.satellite).toBe('precipitation');
    expect(requestedPayload.startDate).toBe('2024-08-01');
    expect(requestedPayload.endDate).toBe('2024-08-31');

    const valEl = document.getElementById('gee-precip-val');
    const todayEl = document.getElementById('gee-precip-today-val');
    const el7d = document.getElementById('gee-precip-7d-val');
    const el30d = document.getElementById('gee-precip-30d-val');
    const timeEl = document.getElementById('gee-precip-status-time');
    const statusPill = document.getElementById('gee-precip-status-pill');

    expect(valEl?.innerText).toBe('3.0 mm/hari');
    expect(todayEl?.innerText).toBe('3.0 mm');
    expect(el7d?.innerText).toBe('6.0 mm');
    expect(el30d?.innerText).toBe('9.0 mm');
    expect(timeEl?.innerText).toBe('01–31 Agu 2024');
    expect(statusPill?.innerText).toBe('Hujan Sedang');

    globalThis.fetch = originalFetch;
  });
});

