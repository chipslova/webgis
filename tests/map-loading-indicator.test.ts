// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapLoadingIndicator } from '../src/tools/map-loading-indicator';

describe('MapLoadingIndicator - Unified Real-Time Loading System', () => {
  let mockMap: any;
  let eventHandlers: Record<string, (e?: any) => void> = {};

  beforeEach(() => {
    vi.useFakeTimers();

    eventHandlers = {};
    mockMap = {
      getZoom: vi.fn().mockReturnValue(6),
      on: vi.fn((event: string, handler: any) => {
        eventHandlers[event] = handler;
      })
    };

    // Prepare DOM elements
    document.body.innerHTML = `
      <div id="map-loading-progress-bar" class="map-loading-progress-bar"></div>
      <div id="map-tile-loading-pill" class="map-tile-loading-pill" style="display: none;">
        <span id="map-tile-loading-title" class="tile-loading-title"></span>
        <span id="map-tile-loading-sub" class="tile-loading-sub"></span>
      </div>
      <div id="status-tile-loader" class="status-tile-loader" style="display: none;">
        <span id="status-tile-loader-text"></span>
      </div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. should bind all required map lifecycle events on creation', () => {
    const indicator = new MapLoadingIndicator(mockMap);
    expect(mockMap.on).toHaveBeenCalledWith('zoomstart', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('dataloading', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('idle', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(indicator.getIsVisible()).toBe(false);
  });

  it('2. should accurately format contextual messages for BIG RBI and zoom out', () => {
    const indicator = new MapLoadingIndicator(mockMap);
    const rbiMsg = indicator.resolveContextualMessages('big-rbi');
    expect(rbiMsg.title).toContain('Rupabumi Indonesia');
    expect(rbiMsg.title).toContain('BIG');

    const esriMsg = indicator.resolveContextualMessages('esri-streets');
    expect(esriMsg.title).toContain('Esri World Streets');
  });

  it('3. should activate progress bar and floating pill when tile loading starts', () => {
    const indicator = new MapLoadingIndicator(mockMap);
    const progressBar = document.getElementById('map-loading-progress-bar');
    const pill = document.getElementById('map-tile-loading-pill');
    const titleEl = document.getElementById('map-tile-loading-title');

    // Trigger dataloading
    eventHandlers['dataloading']({ dataType: 'tile' });

    // Advance beyond debounce (70ms)
    vi.advanceTimersByTime(100);

    expect(indicator.getIsVisible()).toBe(true);
    expect(progressBar?.classList.contains('is-active')).toBe(true);
    expect(pill?.style.display).toBe('flex');
    expect(titleEl?.textContent).toBeTruthy();
  });

  it('4. should show slow server notice if loading takes longer than 2.4 seconds', () => {
    const mockMapManager = {
      getCurrentBasemapId: vi.fn().mockReturnValue('big-rbi')
    } as any;

    new MapLoadingIndicator(mockMap, mockMapManager);
    const subEl = document.getElementById('map-tile-loading-sub');

    // Trigger tile loading on BIG RBI
    eventHandlers['dataloading']({ dataType: 'tile' });
    vi.advanceTimersByTime(100);

    // Initial subtitle
    expect(subEl?.textContent).toContain('BIG');

    // Advance past slow server threshold (2400ms)
    vi.advanceTimersByTime(2500);

    // Subtitle informs user of server processing delay
    expect(subEl?.textContent).toContain('Server BIG sedang memproses ubin');
  });

  it('5. should gracefully fade out when map reaches idle state', () => {
    const indicator = new MapLoadingIndicator(mockMap);
    const progressBar = document.getElementById('map-loading-progress-bar');
    const pill = document.getElementById('map-tile-loading-pill');

    eventHandlers['dataloading']({ dataType: 'tile' });
    vi.advanceTimersByTime(100);
    expect(indicator.getIsVisible()).toBe(true);

    // Map fires idle
    eventHandlers['idle']();
    vi.advanceTimersByTime(300); // fade out sequence
    vi.advanceTimersByTime(400);

    expect(indicator.getIsVisible()).toBe(false);
    expect(progressBar?.classList.contains('is-active')).toBe(false);
    expect(pill?.style.display).toBe('none');
  });

  it('6. should detect zoom out direction and adapt contextual message', () => {
    // Start at zoom 10
    mockMap.getZoom.mockReturnValue(10);
    new MapLoadingIndicator(mockMap);

    // Zoom out to zoom 6
    mockMap.getZoom.mockReturnValue(6);
    eventHandlers['zoomstart']();
    vi.advanceTimersByTime(100);

    const subEl = document.getElementById('map-tile-loading-sub');
    expect(subEl?.textContent?.toLowerCase()).toContain('zoom out');
  });

  it('7. should support manual loading indicators for custom feature workflows', () => {
    const indicator = new MapLoadingIndicator(mockMap);
    const titleEl = document.getElementById('map-tile-loading-title');
    const subEl = document.getElementById('map-tile-loading-sub');

    indicator.showManual('Mengunggah Shapefile...', 'Memproses 1500 poligon geometri');
    vi.advanceTimersByTime(150);

    expect(indicator.getIsVisible()).toBe(true);
    expect(titleEl?.textContent).toBe('Mengunggah Shapefile...');
    expect(subEl?.textContent).toBe('Memproses 1500 poligon geometri');

    indicator.hideManual();
    vi.advanceTimersByTime(700);

    expect(indicator.getIsVisible()).toBe(false);
  });
});
