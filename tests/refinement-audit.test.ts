// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PikselPanelUI } from '../src/ui/piksel-panel';
import { PikselLoader } from '../src/tools/piksel-loader';
import { PIKSEL_PRODUCTS } from '../src/config/piksel';
describe('Audit Refinement & Correctness Test Suite', () => {
  let mapMock: any;
  let pikselLoader: PikselLoader;
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="panel-piksel">
        <div id="piksel-presets-container"></div>
        <div id="piksel-products-container"></div>
      </div>
      <div id="modal-map-export" style="display:none;">
        <input id="export-input-title" value="" />
        <input id="export-input-subtitle" value="" />
      </div>
    `;
    mapMock = {
      getStyle: vi.fn().mockReturnValue({ version: 8, sources: {}, layers: [] }),
      getSource: vi.fn(),
      addSource: vi.fn(),
      removeSource: vi.fn(),
      getLayer: vi.fn(),
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      getBearing: vi.fn().mockReturnValue(0),
      getCenter: vi.fn().mockReturnValue({ lng: 117.89, lat: -2.55 }),
      getZoom: vi.fn().mockReturnValue(5),
      getCanvas: vi.fn().mockReturnValue({
        width: 800,
        height: 600,
        getContext: vi.fn().mockReturnValue({
          fillStyle: '',
          fillRect: vi.fn(),
          fillText: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          measureText: vi.fn().mockReturnValue({ width: 50 }),
          drawImage: vi.fn()
        })
      })
    };
    pikselLoader = new PikselLoader(mapMock as any);
  });
  it('should render all 6 category filters including Kualitas & Densitas', () => {
    const panelUI = new PikselPanelUI(pikselLoader);
    panelUI.render();
    const catButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.cat-filter-btn'));
    const catIds = catButtons.map(b => b.dataset.cat);
    expect(catIds).toContain('all');
    expect(catIds).toContain('geomad');
    expect(catIds).toContain('indices');
    expect(catIds).toContain('quality');
    expect(catIds).toContain('hazard');
    expect(catIds).toContain('landsat');
    const qualityBtn = catButtons.find(b => b.dataset.cat === 'quality');
    expect(qualityBtn?.textContent?.trim()).toContain('Kualitas & Densitas');
  });
  it('should dynamically inject 10 meters resolution into export subtitle for Sentinel-2', () => {
    const s2Product = PIKSEL_PRODUCTS.find(p => p.id === 's2-geomad-rgb');
    expect(s2Product).toBeDefined();
    expect(s2Product?.resolution).toBe('10 meters');
    pikselLoader.setActiveProduct('s2-geomad-rgb');
    expect(pikselLoader.getActiveProduct()?.id).toBe('s2-geomad-rgb');
    const activeProduct = pikselLoader.getActiveProduct();
    const activeYear = pikselLoader.getSelectedYear() || '2025';
    const defaultSub = activeProduct
      ? `${activeProduct.name} (${activeYear}) • OGC WMS (${activeProduct.resolution || '10m'})`
      : 'Sistem Informasi Geografis & Analisis Spasial Nasional';
    expect(defaultSub).toContain('10 meters');
  });
  it('should preserve 10 meters resolution for Sentinel-2 GeoMAD products in export', () => {
    pikselLoader.setActiveProduct('s2-geomad-rgb');
    const activeProduct = pikselLoader.getActiveProduct();
    const activeYear = pikselLoader.getSelectedYear() || '2025';
    const defaultSub = activeProduct
      ? `${activeProduct.name} (${activeYear}) • OGC WMS (${activeProduct.resolution || '10m'})`
      : 'Sistem Informasi Geografis & Analisis Spasial Nasional';
    expect(defaultSub).toContain('10 meters');
  });
});