// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PikselLoader } from '../src/tools/piksel-loader';

describe('Piksel Time-Lapse Silky-Smooth Double-Buffering & Next-Frame Preload', () => {
  let createdLayers: Record<string, any> = {};
  let createdSources: Record<string, any> = {};

  const createMockMap = () => ({
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    getStyle: vi.fn().mockReturnValue({ version: 8 }),
    getZoom: vi.fn().mockReturnValue(10),
    getCenter: vi.fn().mockReturnValue({ lng: 110, lat: -7 }),
    getPitch: vi.fn().mockReturnValue(0),
    getBearing: vi.fn().mockReturnValue(0),
    getLayer: vi.fn((id: string) => createdLayers[id] || null),
    getSource: vi.fn((id: string) => createdSources[id] || null),
    addLayer: vi.fn((layer: any) => {
      createdLayers[layer.id] = layer;
    }),
    addSource: vi.fn((id: string, source: any) => {
      createdSources[id] = source;
    }),
    removeLayer: vi.fn((id: string) => {
      delete createdLayers[id];
    }),
    removeSource: vi.fn((id: string) => {
      delete createdSources[id];
    }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
  });

  beforeEach(() => {
    createdLayers = {};
    createdSources = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with primary slot 0 and not expose basemap', () => {
    const mockMap = createMockMap() as any;
    const loader = new PikselLoader(mockMap);

    loader.setActiveProduct('s2-geomad-rgb');
    expect(loader.getActiveProductId()).toBe('s2-geomad-rgb');

    const primaryLayerId = loader.getLayerIdForSlot('s2-geomad-rgb', 0);
    expect(primaryLayerId).toBe('piksel-raster-s2-geomad-rgb');
    expect(mockMap.addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'piksel-raster-s2-geomad-rgb',
      type: 'raster'
    }));
  });

  it('should preserve previous year layer during transition (0% basemap leakage)', () => {
    const mockMap = createMockMap() as any;
    const loader = new PikselLoader(mockMap);
    loader.setActiveProduct('s2-geomad-rgb');

    const slot0LayerId = loader.getLayerIdForSlot('s2-geomad-rgb', 0);
    const slot1LayerId = loader.getLayerIdForSlot('s2-geomad-rgb', 1);

    expect(createdLayers[slot0LayerId]).toBeDefined();

    // Transition to 2024
    loader.setSelectedYear('2024');

    // Slot 1 (incoming buffer) must be added ON TOP of slot 0
    expect(mockMap.addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: slot1LayerId,
      type: 'raster'
    }));

    // CRITICAL: Slot 0 must NOT have been removed immediately!
    // It remains in createdLayers so the map never drops to the basemap
    expect(loader.getActiveLayerId()).toBe(slot1LayerId);
  });

  it('should prefetch next chronological year into idle slot in background', () => {
    const mockMap = createMockMap() as any;
    const loader = new PikselLoader(mockMap);
    loader.setActiveProduct('s2-geomad-rgb');
    loader.setSelectedYear('2022');

    // Trigger prefetch for next chronological year (2023)
    loader.prefetchNextYear();

    expect(mockMap.addLayer).toHaveBeenCalledWith(expect.objectContaining({
      paint: expect.objectContaining({
        'raster-opacity': 0.0001
      })
    }));
  });

  it('should perform instant 0ms transition when year is prefetched', () => {
    const mockMap = createMockMap() as any;
    const loader = new PikselLoader(mockMap);
    loader.setActiveProduct('s2-geomad-rgb');
    loader.setSelectedYear('2022');

    // Prefetch next year (2023)
    loader.prefetchNextYear();

    // Step to 2023
    loader.setSelectedYear('2023');

    // Should immediately fade opacity from 0.0001 to full currentOpacity on the activated slot
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      expect.stringMatching(/piksel-raster-s2-geomad-rgb/),
      'raster-opacity',
      loader.getOpacity()
    );
    expect(loader.getSelectedYear()).toBe('2023');
  });

  it('should synchronize opacity and filters across both buffer slots', () => {
    const mockMap = createMockMap() as any;
    const loader = new PikselLoader(mockMap);
    loader.setActiveProduct('s2-geomad-rgb');

    const slot0Id = loader.getLayerIdForSlot('s2-geomad-rgb', 0);
    const slot1Id = loader.getLayerIdForSlot('s2-geomad-rgb', 1);

    // Create both layers in mock map
    createdLayers[slot0Id] = { id: slot0Id };
    createdLayers[slot1Id] = { id: slot1Id };

    loader.setOpacity(0.5);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(slot0Id, 'raster-opacity', 0.5);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(slot1Id, 'raster-opacity', 0.5);

    loader.setBrightness(0.3);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(slot0Id, 'raster-brightness-min', 0.15);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(slot1Id, 'raster-brightness-min', 0.15);
  });

  it('should normalize and preserve Landsat 9 discrete scene dates during year transitions', () => {
    const mockMap = createMockMap() as any;
    const loader = new PikselLoader(mockMap);

    // 1. Activate Landsat 9
    loader.setActiveProduct('ls9-sr');
    expect(loader.getActiveProductId()).toBe('ls9-sr');
    expect(loader.getSelectedYear()).toBe('2024-08-05');

    const slot0SourceId = loader.getSourceIdForSlot('ls9-sr', 0);
    const initialSource = createdSources[slot0SourceId];
    expect(initialSource).toBeDefined();
    expect(initialSource.tiles[0]).toContain('TIME=2024-08-05');
    expect(initialSource.tiles[0]).toContain('LAYERS=ls9_c2l2_sr');

    // 2. Switch year using 4-digit '2023' (e.g. from timeline slider or tick click)
    loader.setSelectedYear('2023');
    expect(loader.getSelectedYear()).toBe('2023-08-03');

    const slot1SourceId = loader.getSourceIdForSlot('ls9-sr', 1);
    const bufferSource = createdSources[slot1SourceId];
    expect(bufferSource).toBeDefined();
    expect(bufferSource.tiles[0]).toContain('TIME=2023-08-03');

    // 3. Switch back to '2024' (or '2024-08-05')
    loader.setSelectedYear('2024');
    expect(loader.getSelectedYear()).toBe('2024-08-05');
    const returnSource = createdSources[slot0SourceId];
    expect(returnSource).toBeDefined();
    expect(returnSource.tiles[0]).toContain('TIME=2024-08-05');

    // 4. Chronological years should be properly extracted as 4-digit strings
    expect(loader.getChronologicalYears()).toEqual(['2021', '2022', '2023', '2024']);
  });
});
