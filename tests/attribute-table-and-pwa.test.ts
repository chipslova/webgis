// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttributeTableUI } from '../src/ui/attribute-table-panel';
import { ShortcutsModalUI, GIS_SHORTCUTS } from '../src/ui/shortcuts-modal';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import * as fs from 'fs';
import * as path from 'path';

// Mock MapLibre Map
const mockMap: any = {
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  getSource: vi.fn(),
  addSource: vi.fn(),
  getLayer: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  removeSource: vi.fn(),
  setPaintProperty: vi.fn(),
  setLayoutProperty: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  loaded: vi.fn().mockReturnValue(true),
  isMoving: vi.fn().mockReturnValue(false),
  transform: { latRange: [-90, 90] },
  _camera: { transform: { latRange: [-90, 90] } },
  getStyle: vi.fn().mockReturnValue({}),
  getCanvasContainer: vi.fn().mockReturnValue(document.createElement('div'))
};

describe('Spatial Attribute Table UI & PWA Suite', () => {
  let geojsonLoader: GeoJsonLoader;
  let attributeTableUI: AttributeTableUI;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="attribute-table-container" class="attribute-table-container hidden"></div>
      <div id="shortcuts-cheat-modal" class="shortcuts-modal-overlay hidden"></div>
    `;

    geojsonLoader = new GeoJsonLoader(mockMap);
    geojsonLoader.loadSampleData();
    attributeTableUI = new AttributeTableUI(mockMap, geojsonLoader);
  });

  describe('AttributeTableUI Operations', () => {
    it('should initialize hidden and open when requested', () => {
      expect(attributeTableUI.isVisible()).toBe(false);
      attributeTableUI.open();
      expect(attributeTableUI.isVisible()).toBe(true);

      const container = document.getElementById('attribute-table-container');
      expect(container?.classList.contains('hidden')).toBe(false);
      expect(container?.innerHTML).toContain('Tabel Atribut Spasial');
      expect(container?.innerHTML).toContain('Jakarta');
      expect(container?.innerHTML).toContain('Surabaya');
      expect(container?.innerHTML).toContain('Bandung');
    });

    it('should filter features when search input is typed', () => {
      attributeTableUI.open();
      const searchInput = document.getElementById('attr-table-search') as HTMLInputElement;
      expect(searchInput).toBeTruthy();

      // Search for "Jakarta"
      searchInput.value = 'Jakarta';
      searchInput.dispatchEvent(new Event('input'));

      const container = document.getElementById('attribute-table-container');
      expect(container?.innerHTML).toContain('Jakarta');
      expect(container?.innerHTML).not.toContain('Surabaya');
    });

    it('should toggle table visibility', () => {
      expect(attributeTableUI.isVisible()).toBe(false);
      attributeTableUI.toggle();
      expect(attributeTableUI.isVisible()).toBe(true);
      attributeTableUI.toggle();
      expect(attributeTableUI.isVisible()).toBe(false);
    });

    it('should sort columns when clicked', () => {
      attributeTableUI.open();
      const sortableHeader = document.querySelector<HTMLElement>('.sortable-th[data-col="name"]');
      expect(sortableHeader).toBeTruthy();

      // Click to sort
      sortableHeader?.click();
      const rows = document.querySelectorAll('.attr-table tbody tr');
      expect(rows.length).toBeGreaterThan(0);
      // Sorted alphabetically: Balikpapan should be first
      expect(rows[0].textContent).toContain('Balikpapan');
    });

    it('should zoom to feature when zoom button is clicked', () => {
      attributeTableUI.open();
      const zoomBtn = document.querySelector<HTMLButtonElement>('.btn-zoom-feature');
      expect(zoomBtn).toBeTruthy();

      zoomBtn?.click();
      expect(mockMap.flyTo).toHaveBeenCalled();
    });
  });

  describe('ShortcutsModalUI', () => {
    it('should contain full GIS shortcuts list and toggle modal', () => {
      const shortcutsUI = new ShortcutsModalUI();
      expect(GIS_SHORTCUTS.length).toBeGreaterThanOrEqual(3);

      shortcutsUI.open();
      const modal = document.getElementById('shortcuts-cheat-modal');
      expect(modal?.classList.contains('hidden')).toBe(false);
      expect(modal?.innerHTML).toContain('Buku Pintar Pintasan Keyboard');
      expect(modal?.innerHTML).toContain('Measure Tool');

      shortcutsUI.close();
      expect(modal?.classList.contains('hidden')).toBe(true);
    });
  });

  describe('PWA Manifest & Service Worker Integrity', () => {
    it('should have a valid manifest.webmanifest with essential PWA fields', () => {
      const manifestPath = path.resolve(__dirname, '../public/manifest.webmanifest');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(content.name).toContain('Digital Earth Indonesia');
      expect(content.short_name).toBeTruthy();
      expect(content.display).toBe('standalone');
      expect(content.start_url).toBe('/');
      expect(content.icons.length).toBeGreaterThan(0);
    });

    it('should have a valid service worker script with cache logic', () => {
      const swPath = path.resolve(__dirname, '../public/sw.js');
      expect(fs.existsSync(swPath)).toBe(true);

      const content = fs.readFileSync(swPath, 'utf8');
      expect(content).toContain('CACHE_NAME');
      expect(content).toContain('addEventListener');
      expect(content).toContain('install');
      expect(content).toContain('fetch');
    });
  });
});
