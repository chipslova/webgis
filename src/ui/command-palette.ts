import { BASEMAPS } from '../config/basemaps';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../config/piksel';
import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { MeasureTool } from '../tools/measure';
import { SidebarUI } from './sidebar';
import { SwipeCompareManager } from '../tools/swipe-compare';
import { GuidedTourUI } from './guided-tour';
import { SpatialAnalysisUI } from './spatial-analysis-ui';
import { PRESET_REGIONS } from '../tools/spatial-analysis';
import { showToast } from './toast';

export interface CommandItem {
  id: string;
  category: 'presets' | 'satellite' | 'basemaps' | 'tools' | 'navigation';
  categoryLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  keywords: string[];
  action: () => void;
}

export class CommandPaletteUI {
  private mapManager: MapManager;
  private pikselLoader: PikselLoader | null;
  private geeLoader: GEELoader | null;
  private measureTool: MeasureTool | null;
  private sidebarUI: SidebarUI;
  private swipeCompareManager: SwipeCompareManager | null;
  private guidedTourUI: GuidedTourUI | null;
  private attributeTableUI: any = null;
  private shortcutsModalUI: any = null;
  private spatialAnalysisUI: SpatialAnalysisUI | null = null;

  private isOpen: boolean = false;
  private selectedIndex: number = 0;
  private searchQuery: string = '';
  private modalEl: HTMLElement | null = null;
  private previousActiveElement: HTMLElement | null = null;

  public setSpatialAnalysisUI(ui: SpatialAnalysisUI | null) {
    this.spatialAnalysisUI = ui;
  }

  constructor(
    mapManager: MapManager,
    pikselLoader: PikselLoader | null,
    geeLoader: GEELoader | null,
    measureTool: MeasureTool | null,
    sidebarUI: SidebarUI,
    swipeCompareManager: SwipeCompareManager | null,
    guidedTourUI: GuidedTourUI | null
  ) {
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.measureTool = measureTool;
    this.sidebarUI = sidebarUI;
    this.swipeCompareManager = swipeCompareManager;
    this.guidedTourUI = guidedTourUI;

    this.bindGlobalShortcuts();
  }

  public setAttributeTableUI(ui: any) {
    this.attributeTableUI = ui;
  }

  public setShortcutsModalUI(ui: any) {
    this.shortcutsModalUI = ui;
  }

  public open() {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    this.isOpen = true;
    this.searchQuery = '';
    this.selectedIndex = 0;
    this.render();

    setTimeout(() => {
      const input = document.getElementById('cmd-palette-input') as HTMLInputElement;
      input?.focus();
    }, 50);
  }

  public close() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      const el = this.previousActiveElement;
      setTimeout(() => el.focus(), 20);
      this.previousActiveElement = null;
    }
  }

  public isPaletteOpen(): boolean {
    return this.isOpen;
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // 1. Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
        return;
      }

      // 2. Pressing '?' when not typing in an input
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (!isInput && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        this.open();
        return;
      }

      // 3. Escape to close
      if (this.isOpen && e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  private getAllCommands(): CommandItem[] {
    const commands: CommandItem[] = [];

    // 1. Kawasan Pantauan Presets
    PIKSEL_PRESETS.forEach((preset) => {
      commands.push({
        id: `preset-${preset.id}`,
        category: 'presets',
        categoryLabel: '📍 Monitoring Presets',
        title: preset.name,
        subtitle: `${preset.locationName} · ${preset.description}`,
        icon: '📍',
        keywords: [preset.name, preset.locationName, 'preset', 'location', 'study', 'area'],
        action: () => {
          this.pikselLoader?.flyToPreset(preset);
          this.sidebarUI.setActiveTab('piksel');
          showToast(`Mengarahkan ke ${preset.name}`, 'info');
        }
      });
    });

    // 2. Satelit & Indeks Spektral
    PIKSEL_PRODUCTS.filter((p) => !p.isDisabled).forEach((prod) => {
      commands.push({
        id: `prod-${prod.id}`,
        category: 'satellite',
        categoryLabel: '🛰️ Satellite Imagery & Indices',
        title: prod.name,
        subtitle: `${prod.resolution} · ${prod.sensor}`,
        icon: '🛰️',
        keywords: [prod.name, prod.category, prod.sensor, 'imagery', 'satellite', 'wms', 'index'],
        action: () => {
          this.pikselLoader?.setActiveProduct(prod.id);
          this.pikselLoader?.autoFlyToOptimalView(prod.id);
          this.sidebarUI.setActiveTab('piksel');
          showToast(`Lapisan ${prod.name} diaktifkan`, 'info');
        }
      });
    });

    // 3. 16 Basemaps
    BASEMAPS.forEach((bm) => {
      commands.push({
        id: `bm-${bm.id}`,
        category: 'basemaps',
        categoryLabel: '🗺️ Basemaps',
        title: bm.name,
        subtitle: `${bm.category} · ${bm.description}`,
        icon: '🗺️',
        keywords: [bm.name, bm.category, 'basemap', 'map', 'carto', 'osm', 'esri'],
        action: () => {
          this.mapManager.setBasemap(bm.id);
          showToast(`Peta dasar diubah ke ${bm.name}`, 'info');
        }
      });
    });

    // 4. Tools & Actions
    commands.push(
      {
        id: 'tool-swipe',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Swipe Compare (Split-Screen)',
        subtitle: 'Compare two satellite layers or acquisition years side-by-side',
        icon: '🪟',
        keywords: ['swipe', 'compare', 'split', 'before', 'after', 'difference'],
        action: () => {
          this.swipeCompareManager?.activate();
          showToast('Swipe comparison mode active', 'info');
        }
      },
      {
        id: 'tool-tour',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Start Guided Tour (30s Demo)',
        subtitle: 'Interactive onboarding walkthrough of satellite layers, LST, and 3D terrain',
        icon: '🚀',
        keywords: ['tour', 'demo', 'guide', 'walkthrough', 'start'],
        action: () => {
          this.guidedTourUI?.startTour();
        }
      },
      {
        id: 'tool-globe',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Toggle 3D Globe / 2D Mercator Projection',
        subtitle: 'Switch map projection between 3D Globe and 2D Web Mercator',
        icon: '🌐',
        keywords: ['globe', 'projection', '3d', 'mercator', 'earth'],
        action: () => {
          this.mapManager.toggleProjection();
        }
      },
      {
        id: 'tool-measure-dist',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Measure Geodesic Distance',
        subtitle: 'Calculate route length or distance between points with high precision',
        icon: '📏',
        keywords: ['measure', 'distance', 'length', 'route', 'geodesic'],
        action: () => {
          this.sidebarUI.setActiveTab('measure');
          this.measureTool?.setMode('distance');
          showToast('Klik pada peta untuk menambahkan titik pengukuran jarak', 'info');
        }
      },
      {
        id: 'tool-measure-area',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Measure Geodesic Polygon Area',
        subtitle: 'Calculate polygon surface area using spherical Turf.js geometry',
        icon: '📐',
        keywords: ['measure', 'area', 'polygon', 'hectares', 'sqkm'],
        action: () => {
          this.sidebarUI.setActiveTab('measure');
          this.measureTool?.setMode('area');
          showToast('Klik pada peta untuk menggambar poligon pengukuran luas', 'info');
        }
      },
      {
        id: 'tool-attr-table',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Open Attribute Table',
        subtitle: 'Tabular vector inspector with sorting, filtering, and feature zoom',
        icon: '📊',
        keywords: ['table', 'attribute', 'data', 'csv', 'features', 'rows', 'geojson'],
        action: () => {
          if (this.attributeTableUI) {
            this.attributeTableUI.open();
          } else {
            showToast('Tabel Atribut belum siap', 'info');
          }
        }
      },
      {
        id: 'tool-shortcuts-help',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Keyboard Shortcuts Cheatsheet (?)',
        subtitle: 'View keybindings for navigation, tools, and geospatial controls',
        icon: '⌨️',
        keywords: ['shortcut', 'shortcuts', 'keyboard', 'hotkey', 'help', 'cheatsheet'],
        action: () => {
          if (this.shortcutsModalUI) {
            this.shortcutsModalUI.open();
          }
        }
      },
      {
        id: 'tool-spatial-analysis-draw',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Mulai Gambar AOI Analisis Spasial Wilayah',
        subtitle: 'Gambar poligon bebas untuk menghitung komposisi tutupan lahan & suhu LST',
        icon: '📊',
        keywords: ['analisis', 'spatial', 'analysis', 'aoi', 'zonal', 'stats', 'statistik', 'tutupan lahan', 'lulc', 'suhu', 'gambar'],
        action: () => {
          this.sidebarUI.setActiveTab('analysis');
          this.spatialAnalysisUI?.startDrawing();
        }
      },
      ...PRESET_REGIONS.map((preset) => ({
        id: `tool-analysis-${preset.id}`,
        category: 'tools' as const,
        categoryLabel: '⚡ Tools & Analysis',
        title: `Analisis Spasial: ${preset.name}`,
        subtitle: preset.description,
        icon: '📐',
        keywords: ['analisis', 'spatial', 'aoi', preset.name, preset.id, 'zonal', 'stats', 'lulc'],
        action: () => {
          this.sidebarUI.setActiveTab('analysis');
          this.spatialAnalysisUI?.selectPresetRegion(preset.id);
        }
      })),
      {
        id: 'nav-tab-analysis',
        category: 'tools' as const,
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Buka Tab Analisis Spasial & Buffer',
        subtitle: 'Statistik zonal AOI, estimasi tutupan lahan, dan analisis zona penyangga buffer',
        icon: '📊',
        keywords: ['analisis', 'analysis', 'buffer', 'zonal', 'stats', 'tab', 'spasial'],
        action: () => {
          this.sidebarUI.setActiveTab('analysis');
          showToast('Tab Analisis Spasial aktif', 'info');
        }
      },
      {
        id: 'tool-gee-cfsv2',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Real Google Earth Engine (MODIS 1km Land Surface Temp)',
        subtitle: 'Explore 1km MODIS Terra+Aqua Daytime LST, Nighttime LST, and 18-station network',
        icon: '🌡️',
        keywords: ['gee', 'earth engine', 'climate', 'temperature', 'lst', 'modis', 'terra', 'aqua', 'live', 'suhu', 'chart'],
        action: () => {
          this.sidebarUI.setActiveTab('gee');
          this.geeLoader?.loadGEEDatasets();
          showToast('MODIS 1km LST NASA diaktifkan', 'info');
        }
      },
      {
        id: 'tool-terrain-3d',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: '3D Terrain & Relief Settings',
        subtitle: 'Configure 3D elevation exaggeration, hillshade, and pitch (Bottom Dock)',
        icon: '🏔️',
        keywords: ['terrain', '3d', 'elevation', 'hillshade', 'relief', 'topography'],
        action: () => {
          const btn = document.getElementById('btn-toggle-terrain');
          btn?.click();
        }
      },
      {
        id: 'tool-tile-grid',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Toggle Data Cube Grid (1,631 Tiles)',
        subtitle: 'Show / hide national Open Data Cube tile grid boundaries (Bottom Dock)',
        icon: '🔲',
        keywords: ['grid', 'tile', 'data cube', 'odc', 'boundaries', 'indonesia'],
        action: () => {
          const btn = document.getElementById('btn-toggle-grid');
          btn?.click();
        }
      },
      {
        id: 'tool-sublayers-popover',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Customize Basemap Sublayers',
        subtitle: 'Toggle visibility of roads, labels, admin boundaries, and contours (Bottom Dock)',
        icon: '📑',
        keywords: ['sublayer', 'layer', 'roads', 'labels', 'boundaries', 'contours'],
        action: () => {
          const btn = document.getElementById('btn-toggle-sublayers');
          btn?.click();
        }
      },
      {
        id: 'tool-reset',
        category: 'tools',
        categoryLabel: '⚡ Tools & Analysis',
        title: 'Reset Map View',
        subtitle: 'Reset camera, basemap, and projection to default state',
        icon: '↺',
        keywords: ['reset', 'home', 'camera', 'default', 'projection'],
        action: () => {
          const resetBtn = document.getElementById('btn-reset-map');
          resetBtn?.click();
        }
      }
    );

    return commands;
  }

  private filterCommands(): CommandItem[] {
    const q = this.searchQuery.trim().toLowerCase();
    const all = this.getAllCommands();

    if (!q) {
      return all;
    }

    return all.filter((cmd) => {
      const matchTitle = cmd.title.toLowerCase().includes(q);
      const matchSub = cmd.subtitle.toLowerCase().includes(q);
      const matchKw = cmd.keywords.some((kw) => kw.toLowerCase().includes(q));
      const matchCat = cmd.categoryLabel.toLowerCase().includes(q);
      return matchTitle || matchSub || matchKw || matchCat;
    });
  }

  private render() {
    if (!this.isOpen) return;

    if (!this.modalEl) {
      this.modalEl = document.createElement('div');
      this.modalEl.id = 'cmd-palette-backdrop';
      this.modalEl.className = 'cmd-palette-backdrop';
      document.body.appendChild(this.modalEl);
    }

    const filtered = this.filterCommands();
    if (this.selectedIndex >= filtered.length) {
      this.selectedIndex = Math.max(0, filtered.length - 1);
    }

    let listHtml = '';
    if (filtered.length === 0) {
      listHtml = `
        <div class="cmd-empty-state">
          <span>🔍</span>
          <p>No results found for "<strong>${this.searchQuery}</strong>"</p>
          <span style="font-size: 11px; color: var(--text-muted);">Try searching for: Bromo, Sentinel, RBI, Measure, Swipe, or 3D</span>
        </div>
      `;
    } else {
      listHtml = filtered
        .map((cmd, idx) => {
          const isSelected = idx === this.selectedIndex;
          return `
          <div class="cmd-item ${isSelected ? 'active' : ''}" data-index="${idx}" role="option" aria-selected="${isSelected}">
            <div class="cmd-item-icon">${cmd.icon}</div>
            <div class="cmd-item-text">
              <div class="cmd-item-title-row">
                <span class="cmd-item-title">${cmd.title}</span>
                <span class="cmd-item-cat">${cmd.categoryLabel}</span>
              </div>
              <span class="cmd-item-sub">${cmd.subtitle}</span>
            </div>
            <span class="cmd-item-arrow">↵</span>
          </div>
        `;
        })
        .join('');
    }

    this.modalEl.innerHTML = `
      <div class="cmd-palette-card" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="cmd-search-row">
          <svg class="cmd-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input 
            type="text" 
            id="cmd-palette-input" 
            class="cmd-input" 
            placeholder="Search commands, satellite layers, basemaps, or locations... (Type or select)" 
            value="${this.searchQuery}"
            autocomplete="off"
            spellcheck="false"
          />
          <kbd class="cmd-esc-badge">ESC</kbd>
        </div>

        <div class="cmd-list-container" id="cmd-list-slot" role="listbox">
          ${listHtml}
        </div>

        <div class="cmd-footer-shortcuts">
          <div class="cmd-keys-hint">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Execute</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
          <span class="cmd-stats">${filtered.length} commands</span>
        </div>
      </div>
    `;

    this.bindModalEvents();
  }

  private bindModalEvents() {
    if (!this.modalEl) return;

    // Focus trap inside modal
    this.modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const focusable = this.modalEl?.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Backdrop click to close
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    const input = this.modalEl.querySelector('#cmd-palette-input') as HTMLInputElement;
    if (input) {
      input.addEventListener('input', () => {
        this.searchQuery = input.value;
        this.selectedIndex = 0;
        this.render();
        // Restore focus to input after rerender
        const reInput = document.getElementById('cmd-palette-input') as HTMLInputElement;
        if (reInput) {
          reInput.focus();
          reInput.setSelectionRange(reInput.value.length, reInput.value.length);
        }
      });

      input.addEventListener('keydown', (e) => {
        const filtered = this.filterCommands();

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex + 1) % Math.max(1, filtered.length);
          this.render();
          this.scrollToSelected();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex - 1 + filtered.length) % Math.max(1, filtered.length);
          this.render();
          this.scrollToSelected();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const targetCmd = filtered[this.selectedIndex];
          if (targetCmd) {
            this.executeCommand(targetCmd);
          }
        }
      });
    }

    // Click item to execute
    this.modalEl.querySelectorAll('.cmd-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number((el as HTMLElement).dataset.index);
        const filtered = this.filterCommands();
        const targetCmd = filtered[idx];
        if (targetCmd) {
          this.executeCommand(targetCmd);
        }
      });
    });
  }

  private executeCommand(cmd: CommandItem) {
    this.close();
    if (cmd.id !== 'tool-swipe' && this.swipeCompareManager?.isActive()) {
      this.swipeCompareManager.deactivate();
    }
    cmd.action();
  }

  private scrollToSelected() {
    const activeEl = this.modalEl?.querySelector('.cmd-item.active') as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }
}
