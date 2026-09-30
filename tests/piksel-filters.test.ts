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
    flyTo: vi.fn(),
    easeTo: vi.fn(),
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

  it('should verify all products in PIKSEL_PRODUCTS use authentic BIG Piksel WMS base URL', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    const products = loader.getProducts();
    expect(products.length).toBeGreaterThan(0);
    products.forEach((p) => {
      expect(p.serviceUrl).toContain('piksel');
      expect(p.attribution).toContain('Badan Informasi Geospasial');
    });
  });

  it('should manage Time-Lapse multitemporal playback and stepping', () => {
    vi.useFakeTimers();
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    loader.setActiveProduct('s2-geomad-rgb');

    const years = loader.getChronologicalYears();
    expect(years[0]).toBe('2017');
    expect(years[years.length - 1]).toBe('2025');

    loader.setSelectedYear('2020');
    expect(loader.getSelectedYear()).toBe('2020');

    // Step forward
    loader.stepTimeLapse(1);
    expect(loader.getSelectedYear()).toBe('2021');

    // Step backward
    loader.stepTimeLapse(-1);
    expect(loader.getSelectedYear()).toBe('2020');

    // Wrap around backward
    loader.setSelectedYear('2017');
    loader.stepTimeLapse(-1);
    expect(loader.getSelectedYear()).toBe('2025');

    // Wrap around forward
    loader.stepTimeLapse(1);
    expect(loader.getSelectedYear()).toBe('2017');

    // Play & Pause
    expect(loader.isTimeLapsePlaying()).toBe(false);
    loader.setTimeLapseSpeed(1000);
    expect(loader.getTimeLapseSpeed()).toBe(1000);

    loader.playTimeLapse();
    expect(loader.isTimeLapsePlaying()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(loader.getSelectedYear()).toBe('2018');

    vi.advanceTimersByTime(1000);
    expect(loader.getSelectedYear()).toBe('2019');

    loader.pauseTimeLapse();
    expect(loader.isTimeLapsePlaying()).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(loader.getSelectedYear()).toBe('2019');

    vi.useRealTimers();
  });

  it('should render Time-Lapse UI widget and handle play/pause/step/tick interactions', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    const panelUI = new PikselPanelUI(loader);
    panelUI.init();

    loader.setActiveProduct('s2-geomad-rgb');
    panelUI.render();

    const playBtn = document.getElementById('btn-timelapse-play') as HTMLButtonElement;
    const prevBtn = document.getElementById('btn-timelapse-prev') as HTMLButtonElement;
    const nextBtn = document.getElementById('btn-timelapse-next') as HTMLButtonElement;
    const slider = document.getElementById('timelapse-slider') as HTMLInputElement;
    const badge = document.getElementById('timelapse-current-year-badge');
    const tick2022 = document.querySelector('.timelapse-tick-btn[data-year="2022"]') as HTMLButtonElement;

    expect(playBtn).not.toBeNull();
    expect(prevBtn).not.toBeNull();
    expect(nextBtn).not.toBeNull();
    expect(slider).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(tick2022).not.toBeNull();

    // Click tick 2022
    tick2022.click();
    expect(loader.getSelectedYear()).toBe('2022');
    expect(document.getElementById('timelapse-current-year-badge')?.innerText).toBe('2022');

    // Click next
    const nextBtnFresh = document.getElementById('btn-timelapse-next') as HTMLButtonElement;
    nextBtnFresh.click();
    expect(loader.getSelectedYear()).toBe('2023');
    expect(document.getElementById('timelapse-current-year-badge')?.innerText).toBe('2023');

    // Click prev
    const prevBtnFresh = document.getElementById('btn-timelapse-prev') as HTMLButtonElement;
    prevBtnFresh.click();
    expect(loader.getSelectedYear()).toBe('2022');

    // Toggle play
    const playBtnFresh = document.getElementById('btn-timelapse-play') as HTMLButtonElement;
    playBtnFresh.click();
    expect(loader.isTimeLapsePlaying()).toBe(true);
    expect(document.getElementById('btn-timelapse-play')?.innerHTML).toContain('Jeda');

    playBtnFresh.click();
    expect(loader.isTimeLapsePlaying()).toBe(false);
    expect(document.getElementById('btn-timelapse-play')?.innerHTML).toContain('Putar');
  });

  it('should activate s2-ndmi (Normalized Difference Moisture Index) and render moisture legend', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    const panelUI = new PikselPanelUI(loader);
    panelUI.init();

    loader.setActiveProduct('s2-ndmi');
    const activeProduct = loader.getActiveProduct();

    expect(activeProduct).toBeDefined();
    expect(activeProduct?.id).toBe('s2-ndmi');
    expect(activeProduct?.name).toContain('NDMI');
    expect(activeProduct?.badge).toContain('Indeks Kelembapan');
    expect(activeProduct?.timeEnabled).toBe(true);
    expect(activeProduct?.legend.type).toBe('continuous');
    if (activeProduct?.legend.type === 'continuous') {
      expect(activeProduct.legend.gradientClass).toBe('ndmi-gradient');
      expect(activeProduct.legend.swatches?.length).toBeGreaterThanOrEqual(3);
    }

    panelUI.render();
    const card = document.querySelector('.clean-product-card[data-id="s2-ndmi"]');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('is-active')).toBe(true);
  });

  it('should navigate to Sebangau, Kampar, and Jakarta presets with correct recommended products', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    const presets = loader.getPresets();

    const palangkaPreset = presets.find((p) => p.id === 'palangka-raya-karhutla');
    expect(palangkaPreset).toBeDefined();
    expect(palangkaPreset?.recommendedProduct).toBe('s2-ndmi');

    const riauPreset = presets.find((p) => p.id === 'riau-peatland');
    expect(riauPreset).toBeDefined();
    expect(riauPreset?.recommendedProduct).toBe('s2-ndmi');

    const jktPreset = presets.find((p) => p.id === 'jakarta-urban');
    expect(jktPreset).toBeDefined();
    expect(jktPreset?.recommendedProduct).toBe('s2-ndbi');

    loader.flyToPreset(palangkaPreset!);
    expect(mockMap.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: palangkaPreset!.center,
      zoom: palangkaPreset!.zoom
    }));
    expect(loader.getActiveProductId()).toBe('s2-ndmi');
  });

  it('should have s2-bsi disabled with upstream server error notice', () => {
    const mockMap: any = createMockMap();
    const loader = new PikselLoader(mockMap);
    const bsiProduct = loader.getProducts().find((p) => p.id === 's2-bsi');

    expect(bsiProduct).toBeDefined();
    expect(bsiProduct?.isDisabled).toBe(true);
    expect(bsiProduct?.badge).toBe('Server Maintenance');
    expect(bsiProduct?.statusNotice).toContain('Error 500 upstream');
  });
});

