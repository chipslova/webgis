// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SidebarUI } from '../src/ui/sidebar';
import { AttributeTableUI } from '../src/ui/attribute-table-panel';

describe('Compact Mobile UI View & Responsive Ergonomics Suite (< 400px)', () => {
  let mockMap: any;
  let mockGeojsonLoader: any;

  beforeEach(() => {
    mockMap = {
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
      getZoom: vi.fn(() => 10),
      getCenter: vi.fn(() => ({ lng: 106.8, lat: -6.2 })),
      getSource: vi.fn(),
      getLayer: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      setPaintProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };

    mockGeojsonLoader = {
      getLayers: vi.fn(() => [
        {
          id: 'test-layer-1',
          name: 'Ibukota Provinsi',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [106.8, -6.2] },
                properties: { nama: 'Jakarta', populasi: 10500000, tipe: 'DKI' }
              },
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [107.6, -6.9] },
                properties: { nama: 'Bandung', populasi: 2500000, tipe: 'Kota' }
              }
            ]
          }
        }
      ]),
      onLayersChange: vi.fn()
    };

    document.body.innerHTML = `
      <div id="app">
        <header class="app-header">
          <div class="header-brand">
            <div class="brand-logo"><svg></svg></div>
            <div class="brand-text"><h1>Digital Earth</h1></div>
          </div>
          <div class="header-search">
            <input type="text" placeholder="Cari lokasi..." />
            <span class="search-cmd-pill">Ctrl+K</span>
          </div>
        </header>

        <aside id="sidebar" class="sidebar" aria-expanded="true">
          <nav class="sidebar-nav">
            <button class="sidebar-tab-btn active" data-tab="map">Lapisan</button>
            <button class="sidebar-tab-btn" data-tab="piksel">Satelit</button>
          </nav>
          <div id="panel-map" class="sidebar-panel active"></div>
          <div id="panel-piksel" class="sidebar-panel"></div>
        </aside>
        <button id="sidebar-toggle-btn"></button>
        <div id="mobile-sidebar-backdrop"></div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('1. should automatically collapse sidebar on mobile viewport upon global event', () => {
    // Set innerWidth to simulate mobile phone (375px)
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });

    const sidebar = new SidebarUI();
    sidebar.setOpen(true);
    expect(sidebar.getIsOpen()).toBe(true);

    // Dispatch mobile collapse event
    window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-if-mobile'));
    expect(sidebar.getIsOpen()).toBe(false);
  });

  it('2. should keep sidebar open on desktop viewport when mobile collapse event is fired', () => {
    // Set innerWidth to simulate desktop (1280px)
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });

    const sidebar = new SidebarUI();
    sidebar.setOpen(true);
    expect(sidebar.getIsOpen()).toBe(true);

    // Dispatch mobile collapse event — should ignore on desktop
    window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-if-mobile'));
    expect(sidebar.getIsOpen()).toBe(true);
  });

  it('3. should render mobile horizontal scroll hint in Attribute Table for touch ergonomics', () => {
    const tableUI = new AttributeTableUI(mockMap, mockGeojsonLoader);
    tableUI.open('test-layer-1');

    const scrollHint = document.querySelector('.mobile-table-scroll-hint');
    expect(scrollHint).not.toBeNull();
    expect(scrollHint?.textContent).toContain('Geser tabel ke kanan');
  });

  it('4. should close Attribute Table cleanly via close button on mobile drawer', () => {
    const tableUI = new AttributeTableUI(mockMap, mockGeojsonLoader);
    tableUI.open('test-layer-1');
    expect(tableUI.isVisible()).toBe(true);

    const closeBtn = document.getElementById('btn-close-attr-table') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    closeBtn?.click();

    expect(tableUI.isVisible()).toBe(false);
  });

  it('5. should have viewport-fit=cover in document head meta tag', () => {
    const metaViewport = document.createElement('meta');
    metaViewport.name = 'viewport';
    metaViewport.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    document.head.appendChild(metaViewport);

    const meta = document.querySelector('meta[name="viewport"]');
    expect(meta?.getAttribute('content')).toContain('viewport-fit=cover');
  });
});
