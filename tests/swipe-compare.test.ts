import { describe, it, expect, vi } from 'vitest';
import { SwipeCompareManager, SWIPE_PRESETS } from '../src/tools/swipe-compare';

describe('Swipe / Split-Screen Comparison Mode', () => {
  const mockMap: any = {
    on: vi.fn(),
    off: vi.fn(),
    getCenter: () => ({ lng: 116.7, lat: -0.97 }),
    getZoom: () => 12,
    getPitch: () => 0,
    getBearing: () => 0,
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
    getStyle: () => ({ layers: [] }),
    getSource: () => null,
    addSource: vi.fn(),
    removeSource: vi.fn(),
    getLayer: () => null,
    addLayer: vi.fn(),
    removeLayer: vi.fn()
  };

  it('should initialize with default states and 50% split', () => {
    const manager = new SwipeCompareManager(mockMap);
    expect(manager.isActive()).toBe(false);
    expect(manager.getSliderPosition()).toBe(50);

    const left = manager.getLeftConfig();
    const right = manager.getRightConfig();
    expect(left.year).toBe('2018');
    expect(right.year).toBe('2025');
  });

  it('should clamp slider position between 0 and 100', () => {
    const manager = new SwipeCompareManager(mockMap);
    manager.setSliderPosition(75);
    expect(manager.getSliderPosition()).toBe(75);

    manager.setSliderPosition(-10);
    expect(manager.getSliderPosition()).toBe(0);

    manager.setSliderPosition(150);
    expect(manager.getSliderPosition()).toBe(100);
  });

  it('should update left and right configs correctly', () => {
    const manager = new SwipeCompareManager(mockMap);
    manager.setLeftConfig({ productId: 's2-ndvi', year: '2020' });
    expect(manager.getLeftConfig().productId).toBe('s2-ndvi');
    expect(manager.getLeftConfig().year).toBe('2020');

    manager.setRightConfig({ productId: 's2-ndwi', year: '2024' });
    expect(manager.getRightConfig().productId).toBe('s2-ndwi');
    expect(manager.getRightConfig().year).toBe('2024');
  });

  it('should have valid comparison presets with required metadata', () => {
    expect(SWIPE_PRESETS.length).toBeGreaterThanOrEqual(4);

    SWIPE_PRESETS.forEach((preset) => {
      expect(preset.id).toBeDefined();
      expect(preset.name).toBeDefined();
      expect(preset.locationName).toBeDefined();
      expect(preset.center.length).toBe(2);
      expect(preset.zoom).toBeGreaterThan(0);
      expect(preset.left.productId).toBeDefined();
      expect(preset.right.productId).toBeDefined();
    });
  });

  it('should trigger state change listeners on updates', () => {
    const manager = new SwipeCompareManager(mockMap);
    const cb = vi.fn();
    manager.onStateChange(cb);

    manager.setSliderPosition(40);
    expect(cb).toHaveBeenCalled();
  });
});
