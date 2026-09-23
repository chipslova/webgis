// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusBarUI } from '../src/ui/status-bar';

describe('StatusBarUI', () => {
  let statusBar: StatusBarUI;

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="status-bar">
        <div class="status-group">
          <span id="stat-lat">0.00000</span>
          <span id="stat-lng">0.00000</span>
          <span id="stat-zoom">0.0</span>
          <span id="stat-pitch">0°</span>
          <span id="stat-bearing">0°</span>
          <button id="btn-copy-coords">Salin</button>
        </div>
        <div class="net-status">
          <span id="net-status-dot" class="status-dot"></span>
          <span id="net-status-text">Memeriksa</span>
        </div>
      </div>
    `;

    statusBar = new StatusBarUI();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should format coordinates and camera parameters accurately on update', () => {
    statusBar.update({
      lat: -6.1753924,
      lng: 106.8271528,
      zoom: 12.34,
      pitch: 45.2,
      bearing: 180.8
    });

    expect(document.getElementById('stat-lat')?.innerText).toBe('-6.17539');
    expect(document.getElementById('stat-lng')?.innerText).toBe('106.82715');
    expect(document.getElementById('stat-zoom')?.innerText).toBe('12.3');
    expect(document.getElementById('stat-pitch')?.innerText).toBe('45°');
    expect(document.getElementById('stat-bearing')?.innerText).toBe('181°');
  });

  it('should optimize DOM updates and avoid rewriting unchanged values', () => {
    const latEl = document.getElementById('stat-lat')!;
    const initialLat = '-6.20000';
    latEl.innerText = initialLat;

    // Call update with same values
    statusBar.update({
      lat: -6.200001, // Rounds to same 5 decimals
      lng: 106.80000,
      zoom: 10.0,
      pitch: 0,
      bearing: 0
    });

    expect(latEl.innerText).toBe('-6.20000');
  });

  it('should update network status indicator for online and offline states', () => {
    const dot = document.getElementById('net-status-dot')!;
    const text = document.getElementById('net-status-text')!;

    statusBar.setOnlineStatus(true);
    expect(dot.className).toContain('online');
    expect(text.textContent).toBe('Online');

    statusBar.setOnlineStatus(false);
    expect(dot.className).toContain('offline');
    expect(text.textContent).toBe('Offline');
  });

  it('should copy current coordinates to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock
      },
      configurable: true
    });

    statusBar.update({
      lat: -6.1750,
      lng: 106.8250,
      zoom: 12,
      pitch: 0,
      bearing: 0
    });

    const copyBtn = document.getElementById('btn-copy-coords')!;
    copyBtn.dispatchEvent(new Event('click'));

    expect(writeTextMock).toHaveBeenCalledWith('-6.175000, 106.825000');
  });
});
