// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PikselLoader } from '../src/tools/piksel-loader';
import { PikselPanelUI } from '../src/ui/piksel-panel';
import { PIKSEL_PRODUCTS } from '../src/config/piksel';

describe('Satellite Image Filter Adjustments (Brightness, Contrast, Saturation)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <div id="panel-piksel"></div>
      </div>
    `;
  });

  const createMockMap = () => ({
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    getStyle: vi.fn().mockReturnValue({ version: 8 }),
    getZoom: vi.fn().mockReturnValue(10),
    getCenter: vi.fn().mockReturnValue({ lng: 110, lat: -7 }),
    getPitch: vi.fn().mockReturnValue(0),
    getBearing: vi.fn().mockReturnValue(0),
    getLayer: vi.fn().mockReturnValue({ id: 'piksel-raster-s2-geomad-rgb' }),
    getSource: vi.fn().mockReturnValue(null),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  });

  it('should initialize with default filter values (0) and update filters correctly', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    expect(loader.getFilters()).toEqual({
      brightness: 0,
      contrast: 0,
      saturation: 0,
    });

    loader.setActiveProduct(PIKSEL_PRODUCTS[0].id);

    loader.setBrightness(0.4);
    expect(loader.getFilters().brightness).toBe(0.4);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'piksel-raster-s2-geomad-rgb',
      'raster-brightness-min',
      0.2
    );

    loader.setContrast(0.5);
    expect(loader.getFilters().contrast).toBe(0.5);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'piksel-raster-s2-geomad-rgb',
      'raster-contrast',
      0.5
    );

    loader.setSaturation(-0.2);
    expect(loader.getFilters().saturation).toBe(-0.2);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'piksel-raster-s2-geomad-rgb',
      'raster-saturation',
      -0.2
    );

    loader.resetFilters();
    expect(loader.getFilters()).toEqual({
      brightness: 0,
      contrast: 0,
      saturation: 0,
    });
  });

  it('should render filter sliders in PikselPanelUI and handle user input and reset', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    const panelUI = new PikselPanelUI(loader);
    panelUI.init();

    // Activate a product by id
    loader.setActiveProduct(PIKSEL_PRODUCTS[0].id);
    panelUI.render();

    const brightnessSlider = document.getElementById('piksel-filter-brightness') as HTMLInputElement;
    const contrastSlider = document.getElementById('piksel-filter-contrast') as HTMLInputElement;
    const saturationSlider = document.getElementById('piksel-filter-saturation') as HTMLInputElement;
    const resetBtn = document.getElementById('btn-reset-piksel-filters') as HTMLButtonElement;

    expect(brightnessSlider).not.toBeNull();
    expect(contrastSlider).not.toBeNull();
    expect(saturationSlider).not.toBeNull();
    expect(resetBtn).not.toBeNull();

    // Simulate brightness change
    brightnessSlider.value = '30';
    brightnessSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(loader.getFilters().brightness).toBe(0.3);

    const bText = document.getElementById('piksel-brightness-val');
    expect(bText?.innerText).toBe('+30%');

    // Simulate reset click
    resetBtn.click();
    expect(loader.getFilters().brightness).toBe(0);
  });
});
