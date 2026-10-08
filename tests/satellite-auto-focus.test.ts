import { describe, it, expect, vi } from 'vitest';
import { PikselLoader } from '../src/tools/piksel-loader';
import { PIKSEL_PRODUCTS, } from '../src/config/piksel';

describe('Satellite Auto-Focus & Optimal View Navigation', () => {
  it('should have optimalFocus defined for all active satellite products', () => {
    const activeProducts = PIKSEL_PRODUCTS.filter((p) => !p.isDisabled);
    expect(activeProducts.length).toBeGreaterThan(0);

    activeProducts.forEach((prod) => {
      expect(prod.optimalFocus, `Product ${prod.id} must have optimalFocus`).toBeDefined();
      expect(prod.optimalFocus?.name).toBeTruthy();
      expect(prod.optimalFocus?.center).toHaveLength(2);
      expect(prod.optimalFocus?.zoom).toBeGreaterThanOrEqual(prod.minZoom ?? 8);
    });
  });

  it('should auto-fly to the clearest data location and optimal zoom when autoFlyToOptimalView is called', () => {
    const flyToMock = vi.fn();
    const easeToMock = vi.fn();
    const mockMap: any = {
      getZoom: () => 4.5,
      getCenter: () => ({ lng: 118, lat: -2 }),
      flyTo: flyToMock,
      easeTo: easeToMock,
      on: vi.fn(),
      getStyle: () => ({}),
      getLayer: vi.fn(),
      getSource: vi.fn()
    };

    const loader = new PikselLoader(mockMap);

    // Test Sentinel-2 RGB -> Bromo
    const targetRgb = loader.autoFlyToOptimalView('s2-geomad-rgb', true);
    expect(targetRgb).toBe('Bromo Tengger Semeru');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [112.9485, -7.9514],
        zoom: 12
      })
    );

    // Test NDVI -> IKN
    flyToMock.mockClear();
    const targetNdvi = loader.autoFlyToOptimalView('s2-ndvi', true);
    expect(targetNdvi).toBe('IKN Nusantara');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [116.7050, -0.9700],
        zoom: 11.5
      })
    );

    // Test NDBI -> Jakarta
    flyToMock.mockClear();
    const targetNdbi = loader.autoFlyToOptimalView('s2-ndbi', true);
    expect(targetNdbi).toBe('DKI Jakarta & Sekitarnya');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [106.8272, -6.1754],
        zoom: 11.5
      })
    );

    // Test Flood Hazard RP02 -> Citarum Karawang
    flyToMock.mockClear();
    const targetFlood = loader.autoFlyToOptimalView('flood-hazard-rp02', true);
    expect(targetFlood).toBe('Karawang & Dataran Banjir Citarum');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [107.2500, -6.2200],
        zoom: 10.5
      })
    );

    // Test Landsat 9 -> Bali
    flyToMock.mockClear();
    const targetLandsat = loader.autoFlyToOptimalView('ls9-sr', true);
    expect(targetLandsat).toBe('Pulau Bali & Batur');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [115.2000, -8.3500],
        zoom: 10
      })
    );

    // Test Scene Count -> Jawa Timur
    flyToMock.mockClear();
    const targetCount = loader.autoFlyToOptimalView('s2-count', true);
    expect(targetCount).toBe('Jawa Timur & Selat Madura');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [112.7500, -7.6000],
        zoom: 10.5
      })
    );
  });

  it('should auto-fly even if current zoom was already above minZoom when camera is far from the data area', () => {
    const flyToMock = vi.fn();
    const mockMap: any = {
      getZoom: () => 9.5, // above minZoom 8
      getCenter: () => ({ lng: 135.0, lat: -4.0 }), // Looking at Papua
      flyTo: flyToMock,
      easeTo: vi.fn(),
      on: vi.fn(),
      getStyle: () => ({}),
      getLayer: vi.fn(),
      getSource: vi.fn()
    };

    const loader = new PikselLoader(mockMap);
    // User switches to flood hazard (which only exists in West Java)
    const result = loader.autoFlyToOptimalView('flood-hazard-rp02');
    expect(result).toBe('Karawang & Dataran Banjir Citarum');
    expect(flyToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [107.2500, -6.2200],
        zoom: 10.5
      })
    );
  });

  it('should not re-fly if camera is already close and zoom is already at optimal level', () => {
    const flyToMock = vi.fn();
    const easeToMock = vi.fn();
    const mockMap: any = {
      getZoom: () => 12.0,
      getCenter: () => ({ lng: 112.9485, lat: -7.9514 }), // Already at Bromo
      flyTo: flyToMock,
      easeTo: easeToMock,
      on: vi.fn(),
      getStyle: () => ({}),
      getLayer: vi.fn(),
      getSource: vi.fn()
    };

    const loader = new PikselLoader(mockMap);
    const result = loader.autoFlyToOptimalView('s2-geomad-rgb', false);
    expect(result).toBeNull();
    expect(flyToMock).not.toHaveBeenCalled();
    expect(easeToMock).not.toHaveBeenCalled();
  });
});