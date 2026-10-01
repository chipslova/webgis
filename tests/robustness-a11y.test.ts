// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import { PermalinkManager } from '../src/tools/permalink';
import { announceToScreenReader, setupUniversalEscapeHandler } from '../src/utils/a11y';
import { ErrorHandler } from '../src/utils/error-handler';

describe('GeoJsonLoader Robustness & Normalizer', () => {
  it('should successfully normalize a valid FeatureCollection', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [106.8456, -6.2088] },
          properties: { name: 'Jakarta' }
        }
      ]
    };

    const res = GeoJsonLoader.normalizeAndValidate(fc);
    expect(res.valid).toBe(true);
    expect(res.data?.type).toBe('FeatureCollection');
    expect(res.data?.features.length).toBe(1);
  });

  it('should auto-wrap a single Feature object into a FeatureCollection', () => {
    const singleFeature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [110.3695, -7.7956] },
      properties: { name: 'Yogyakarta' }
    };

    const res = GeoJsonLoader.normalizeAndValidate(singleFeature);
    expect(res.valid).toBe(true);
    expect(res.data?.type).toBe('FeatureCollection');
    expect(res.data?.features[0].properties?.name).toBe('Yogyakarta');
  });

  it('should auto-wrap an array of Features into a FeatureCollection', () => {
    const featureArray = [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [112.7521, -7.2575] },
        properties: { name: 'Surabaya' }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [119.4327, -5.1477] },
        properties: { name: 'Makassar' }
      }
    ];

    const res = GeoJsonLoader.normalizeAndValidate(featureArray);
    expect(res.valid).toBe(true);
    expect(res.data?.features.length).toBe(2);
  });

  it('should reject non-JSON / empty objects', () => {
    expect(GeoJsonLoader.normalizeAndValidate(null).valid).toBe(false);
    expect(GeoJsonLoader.normalizeAndValidate({}).valid).toBe(false);
    expect(GeoJsonLoader.normalizeAndValidate({ type: 'FeatureCollection', features: [] }).valid).toBe(false);
  });

  it('should reject out-of-bounds UTM meter coordinates and warn about WGS84 EPSG:4326', () => {
    const utmFeature: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [705423.5, 9312450.8] }, // Projected meters
          properties: { name: 'UTM Zone 48S Coord' }
        }
      ]
    };

    const res = GeoJsonLoader.normalizeAndValidate(utmFeature);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('WGS84');
  });
});

describe('Permalink Robustness & Parameter Parsing', () => {
  it('should safely parse valid structured hash parameters', () => {
    const hash = '#map=8.50/-6.2088/106.8456/30/15&proj=globe&basemap=esri-imagery&product=s2-ndvi&year=2024&gee=lst,poi';
    const state = PermalinkManager.parseHash(hash);

    expect(state.zoom).toBe(8.5);
    expect(state.lat).toBe(-6.2088);
    expect(state.lng).toBe(106.8456);
    expect(state.pitch).toBe(30);
    expect(state.bearing).toBe(15);
    expect(state.projection).toBe('globe');
    expect(state.basemapId).toBe('esri-imagery');
    expect(state.productId).toBe('s2-ndvi');
    expect(state.year).toBe('2024');
    expect(state.geeLayers).toEqual(['lst', 'poi']);
  });

  it('should gracefully handle malformed or nonsensical hash strings without throwing', () => {
    const badHash1 = '#map=invalid/notanumber/NaN/bad';
    const state1 = PermalinkManager.parseHash(badHash1);
    expect(state1.lat).toBeUndefined();
    expect(state1.lng).toBeUndefined();

    const badHash2 = '#undefined/null/foo';
    const state2 = PermalinkManager.parseHash(badHash2);
    expect(state2.lat).toBeUndefined();
  });
});

describe('Accessibility (a11y) Live Announcer & Keyboard Escape', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should create #a11y-announcer element and announce text with aria-live', async () => {
    announceToScreenReader('Peta dasar diubah ke Esri Topo');

    const announcer = document.getElementById('a11y-announcer');
    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute('aria-live')).toBe('polite');

    // Wait for micro-timeout in announcer
    await new Promise((r) => setTimeout(r, 80));
    expect(announcer?.textContent).toBe('Peta dasar diubah ke Esri Topo');
  });

  it('should execute universal Escape key handlers in priority order', () => {
    const handler1 = vi.fn().mockReturnValue(false);
    const handler2 = vi.fn().mockReturnValue(true);
    const handler3 = vi.fn().mockReturnValue(false);

    const cleanup = setupUniversalEscapeHandler([handler1, handler2, handler3]);

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(event);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(handler3).not.toHaveBeenCalled(); // Stopped after handler2 returned true

    cleanup();
  });
});

describe('ErrorHandler & Network Resilience', () => {
  it('should return singleton instance and report online status correctly', () => {
    const handler = ErrorHandler.getInstance();
    expect(handler).toBeDefined();
    expect(typeof handler.getIsOnline()).toBe('boolean');
  });

  it('should safely execute wrapAsync and catch errors without crashing', async () => {
    const handler = ErrorHandler.getInstance();
    const failingTask = async () => {
      throw new Error('Network timeout');
    };

    const res = await handler.wrapAsync(failingTask, 'Gagal mengambil data', 'fallback_data');
    expect(res).toBe('fallback_data');
  });
});

describe('Basemap Popover Keyboard Navigation & a11y', () => {
  it('should support ArrowDown, ArrowUp, Home, and End keys across items', async () => {
    document.body.innerHTML = `
      <div id="basemap-popover" style="display: none;">
        <div id="popover-basemap-rec-list"></div>
        <div id="popover-basemap-thematic-list"></div>
        <div id="popover-basemap-canvas-list"></div>
      </div>
      <button id="btn-toggle-basemap" class="dock-btn"></button>
    `;

    const { BasemapCustomizer } = await import('../src/tools/basemap-customizer');
    const { BasemapCustomizerUI } = await import('../src/ui/basemap-customizer-panel');

    const mockMap: any = {
      getStyle: vi.fn().mockReturnValue({ layers: [] }),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      setTerrain: vi.fn(),
      addSource: vi.fn(),
      getSource: vi.fn(),
      removeSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(),
      removeLayer: vi.fn(),
      on: vi.fn(),
      easeTo: vi.fn(),
      getPitch: vi.fn().mockReturnValue(0),
      getZoom: vi.fn().mockReturnValue(10)
    };

    const customizer = new BasemapCustomizer(mockMap);
    const customizerUI = new BasemapCustomizerUI(customizer);

    // Open popover
    customizerUI.togglePopover('basemap-popover');
    const popover = document.getElementById('basemap-popover');
    expect(popover?.style.display).toBe('block');

    const items = Array.from(document.querySelectorAll<HTMLElement>('.basemap-popover-item'));
    expect(items.length).toBeGreaterThan(2);

    items[0].focus();
    expect(document.activeElement).toBe(items[0]);

    // Test ArrowDown navigation
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    // Test ArrowUp navigation
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);

    // Test End key navigation
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items[items.length - 1]);

    // Test Home key navigation
    items[items.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });
});
