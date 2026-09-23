// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntersectAnalysisUI } from '../src/ui/intersect-analysis-ui';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { SpatialAnalysisUI } from '../src/ui/spatial-analysis-ui';
import * as maplibregl from 'maplibre-gl';

describe('IntersectAnalysisUI', () => {
  let mockMap: any;
  let mockGeojsonLoader: any;
  let mockSpatialAnalysisUI: any;
  let onLayersChangeCallback: any;
  let ui: IntersectAnalysisUI;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="intersect-analysis-container">
        <div id="intersect-aoi-status-card" class="intersect-aoi-status-box">
          <span id="intersect-aoi-icon">📍</span>
          <span id="intersect-aoi-label">Belum ada wilayah</span>
          <span id="intersect-aoi-sublabel">Pilih contoh</span>
          <button type="button" id="btn-quick-sample-aoi">Contoh DKI Jakarta</button>
          <button type="button" id="btn-quick-draw-aoi">Gambar di Peta</button>
        </div>

        <div class="intersect-op-tabs">
          <button type="button" class="btn-chip intersect-op-btn active" data-mode="intersect">⚔️ Irisan</button>
          <button type="button" class="btn-chip intersect-op-btn" data-mode="difference">✂️ Kurangi</button>
          <button type="button" class="btn-chip intersect-op-btn" data-mode="union">🔗 Gabung</button>
          <button type="button" class="btn-chip intersect-op-btn" data-mode="sym_difference">⚡ Beda (XOR)</button>
        </div>
        <div id="intersect-op-desc">⚔️ Irisan</div>

        <div class="intersect-target-chips">
          <button type="button" class="btn-chip active" id="chip-target-cities" data-target="cities">Kota</button>
          <button type="button" class="btn-chip" id="chip-target-stations" data-target="stations">Stasiun</button>
          <button type="button" class="btn-chip" id="chip-target-all" data-target="all">Semua</button>
          <button type="button" class="btn-chip" id="chip-target-custom" data-target="custom">Manual</button>
        </div>

        <div id="intersect-custom-selectors" style="display: none;">
          <select id="intersect-layer-a"></select>
          <select id="intersect-layer-b"></select>
        </div>

        <div class="intersect-color-swatches">
          <button type="button" class="intersect-color-chip active" data-color="#00f0ff"></button>
          <button type="button" class="intersect-color-chip" data-color="#38bdf8"></button>
        </div>
        <input type="color" id="intersect-color-custom" value="#00f0ff" />
        <input type="range" id="intersect-opacity-slider" value="70" />
        <span id="intersect-opacity-val">70%</span>

        <button id="btn-run-intersect-analysis">Temukan Objek Sekarang</button>
        <button id="btn-clear-intersect-analysis">Hapus</button>

        <div id="intersect-analysis-status" style="display: none;"></div>
      </div>
    `;

    mockMap = {
      getStyle: vi.fn().mockReturnValue({}),
      getSource: vi.fn(),
      addSource: vi.fn(),
      getLayer: vi.fn(),
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      setPaintProperty: vi.fn(),
      fitBounds: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };

    mockGeojsonLoader = {
      getLayers: vi.fn().mockReturnValue([
        {
          id: 'layer-cities-1',
          name: 'Kota Besar Indonesia',
          featureCount: 10,
          data: { type: 'FeatureCollection', features: [] }
        }
      ]),
      getLayerById: vi.fn(),
      loadSampleData: vi.fn()
    };

    mockSpatialAnalysisUI = {
      getActiveAOIPolygon: vi.fn().mockReturnValue({
        type: 'Feature',
        properties: { name: 'AOI Test' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [106.8, -6.2],
              [107.0, -6.2],
              [107.0, -6.0],
              [106.8, -6.0],
              [106.8, -6.2]
            ]
          ]
        }
      }),
      selectPresetRegion: vi.fn(),
      startDrawing: vi.fn(),
      onLayersChange: vi.fn()
    };

    onLayersChangeCallback = vi.fn();

    ui = new IntersectAnalysisUI(
      mockMap as unknown as maplibregl.Map,
      mockGeojsonLoader as unknown as GeoJsonLoader,
      mockSpatialAnalysisUI as unknown as SpatialAnalysisUI,
      onLayersChangeCallback
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register all map layer IDs correctly in getAllMapLayerIds()', () => {
    const layerIds = ui.getAllMapLayerIds();
    expect(layerIds).toContain('intersect-result-fill');
    expect(layerIds).toContain('intersect-result-line');
    expect(layerIds).toContain('intersect-result-points');
    expect(layerIds).toContain('intersect-hover-fill');
    expect(layerIds).toContain('intersect-hover-line');
  });

  it('should initialize and populate layer selectors', () => {
    ui.init();

    const selectA = document.getElementById('intersect-layer-a') as HTMLSelectElement;
    const selectB = document.getElementById('intersect-layer-b') as HTMLSelectElement;

    expect(selectA.options.length).toBeGreaterThan(0);
    expect(selectB.options.length).toBeGreaterThan(0);
    expect(selectA.innerHTML).toContain('Wilayah AOI Aktif');
  });

  it('should switch operation modes when clicking mode buttons', () => {
    ui.init();

    const diffBtn = document.querySelector('.intersect-op-btn[data-mode="difference"]') as HTMLButtonElement;
    diffBtn.dispatchEvent(new Event('click'));

    expect(diffBtn.classList.contains('active')).toBe(true);
    const descEl = document.getElementById('intersect-op-desc');
    expect(descEl?.innerHTML).toContain('Kurangi');
  });

  it('should switch target chips and toggle manual selector visibility', () => {
    ui.init();

    const customChip = document.getElementById('chip-target-custom') as HTMLButtonElement;
    const customSelectors = document.getElementById('intersect-custom-selectors') as HTMLElement;

    customChip.dispatchEvent(new Event('click'));
    expect(customChip.classList.contains('active')).toBe(true);
    expect(customSelectors.style.display).toBe('flex');

    const stationsChip = document.getElementById('chip-target-stations') as HTMLButtonElement;
    stationsChip.dispatchEvent(new Event('click'));
    expect(customSelectors.style.display).toBe('none');
  });

  it('should clear analysis and reset status box when clear button is clicked', () => {
    ui.init();

    const statusBox = document.getElementById('intersect-analysis-status')!;
    statusBox.style.display = 'block';
    statusBox.innerHTML = 'Hasil aktif';

    ui.clearAnalysis();

    expect(ui.getActiveResult()).toBeNull();
    expect(ui.getActiveBatchResult()).toBeNull();
    expect(statusBox.style.display).toBe('none');
    expect(statusBox.innerHTML).toBe('');
  });

  it('should update result color and opacity on map layers when changed', () => {
    mockMap.getLayer.mockReturnValue({ id: 'intersect-result-fill' });
    ui.init();

    const colorChip = document.querySelector('.intersect-color-chip[data-color="#38bdf8"]') as HTMLElement;
    colorChip.dispatchEvent(new Event('click'));

    expect(mockMap.setPaintProperty).toHaveBeenCalledWith('intersect-result-fill', 'fill-color', '#38bdf8');
  });

  it('should reflect active AOI status in the simplified step card', () => {
    ui.init();

    const statusCard = document.getElementById('intersect-aoi-status-card');
    const label = document.getElementById('intersect-aoi-label');

    expect(statusCard?.classList.contains('active')).toBe(true);
    expect(label?.innerText).toContain('AOI Test');
  });

  it('should trigger sample preset selection when clicking quick sample button', () => {
    ui.init();

    const quickSampleBtn = document.getElementById('btn-quick-sample-aoi') as HTMLButtonElement;
    quickSampleBtn.dispatchEvent(new Event('click'));

    expect(mockSpatialAnalysisUI.selectPresetRegion).toHaveBeenCalledWith('dki-jakarta');
  });
});
