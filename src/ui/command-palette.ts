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
        categoryLabel: '📍 Preset Pemantauan',
        title: preset.name,
        subtitle: `${preset.locationName} · ${preset.description}`,
        icon: '📍',
        keywords: [preset.name, preset.locationName, 'preset', 'location', 'study', 'area', 'wilayah', 'lokasi'],
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
        categoryLabel: '🛰️ Citra Satelit & Indeks',
        title: prod.name,
        subtitle: `${prod.resolution} · ${prod.sensor}`,
        icon: '🛰️',
        keywords: [prod.name, prod.category, prod.sensor, 'imagery', 'satellite', 'wms', 'index', 'satelit', 'citra'],
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
        categoryLabel: '🗺️ Peta Dasar',
        title: bm.name,
        subtitle: `${bm.category} · ${bm.description}`,
        icon: '🗺️',
        keywords: [bm.name, bm.category, 'basemap', 'map', 'carto', 'osm', 'esri', 'peta dasar'],
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
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Komparasi Geser (Layar Terbagi)',
        subtitle: 'Bandingkan dua lapisan satelit atau tahun akuisisi secara berdampingan',
        icon: '🪟',
        keywords: ['swipe', 'compare', 'split', 'before', 'after', 'difference', 'geser', 'bandingkan'],
        action: () => {
          this.swipeCompareManager?.activate();
          showToast('Mode komparasi geser aktif', 'info');
        }
      },
      {
        id: 'tool-tour',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Mulai Tur Panduan Interaktif (Demo 30dtk)',
        subtitle: 'Panduan interaktif fitur lapisan satelit, LST, dan elevasi 3D',
        icon: '🚀',
        keywords: ['tour', 'demo', 'guide', 'walkthrough', 'start', 'panduan', 'tur', 'mulai'],
        action: () => {
          this.guidedTourUI?.startTour();
        }
      },
      {
        id: 'tool-globe',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Ganti Proyeksi Bola 3D / Web Mercator 2D',
        subtitle: 'Beralih proyeksi peta antara Globe 3D dan Web Mercator 2D',
        icon: '🌐',
        keywords: ['globe', 'projection', '3d', 'mercator', 'earth', 'proyeksi', 'bola'],
        action: () => {
          this.mapManager.toggleProjection();
        }
      },
      {
        id: 'tool-measure-dist',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Ukur Jarak Geodesik',
        subtitle: 'Hitung panjang lintasan atau jarak antar titik dengan presisi tinggi',
        icon: '📏',
        keywords: ['measure', 'distance', 'length', 'route', 'geodesic', 'jarak', 'ukur', 'panjang'],
        action: () => {
          this.sidebarUI.setActiveTab('measure');
          this.measureTool?.setMode('distance');
          showToast('Klik pada peta untuk menambahkan titik pengukuran jarak', 'info');
        }
      },
      {
        id: 'tool-measure-area',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Ukur Luas Poligon Geodesik',
        subtitle: 'Hitung luas permukaan poligon menggunakan geometri sferis Turf.js',
        icon: '📐',
        keywords: ['measure', 'area', 'polygon', 'hectares', 'sqkm', 'luas', 'hektar', 'poligon'],
        action: () => {
          this.sidebarUI.setActiveTab('measure');
          this.measureTool?.setMode('area');
          showToast('Klik pada peta untuk menggambar poligon pengukuran luas', 'info');
        }
      },
      {
        id: 'tool-attr-table',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Buka Tabel Atribut Data',
        subtitle: 'Inspektur data vektor tabular dengan pengurutan, filter, dan zoom fitur',
        icon: '📊',
        keywords: ['table', 'attribute', 'data', 'csv', 'features', 'rows', 'geojson', 'atribut', 'tabel'],
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
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Daftar Pintasan Keyboard (?)',
        subtitle: 'Lihat daftar pintasan keyboard untuk navigasi, alat, dan kontrol peta',
        icon: '⌨️',
        keywords: ['shortcut', 'shortcuts', 'keyboard', 'hotkey', 'help', 'cheatsheet', 'pintasan', 'bantuan'],
        action: () => {
          if (this.shortcutsModalUI) {
            this.shortcutsModalUI.open();
          }
        }
      },
      {
        id: 'tool-spatial-analysis-draw',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
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
        categoryLabel: '⚡ Alat & Analisis',
        title: `Analisis Spasial: ${preset.name}`,
        subtitle: preset.description,
        icon: '📐',
        keywords: ['analisis', 'spatial', 'aoi', preset.name, preset.id, 'zonal', 'stats', 'lulc', 'wilayah'],
        action: () => {
          this.sidebarUI.setActiveTab('analysis');
          this.spatialAnalysisUI?.selectPresetRegion(preset.id);
        }
      })),
      {
        id: 'nav-tab-analysis',
        category: 'tools' as const,
        categoryLabel: '⚡ Alat & Analisis',
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
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Google Earth Engine (Suhu Permukaan LST MODIS 1km)',
        subtitle: 'Eksplorasi LST Siang & Malam MODIS 1km serta jaringan 18 stasiun pemantau',
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
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Pengaturan Medan 3D & Relief',
        subtitle: 'Atur eksagerasi elevasi 3D, bayangan bukit (hillshade), dan kemiringan kamera',
        icon: '🏔️',
        keywords: ['terrain', '3d', 'elevation', 'hillshade', 'relief', 'topography', 'elevasi', 'medan'],
        action: () => {
          const btn = document.getElementById('btn-toggle-terrain');
          btn?.click();
        }
      },
      {
        id: 'tool-tile-grid',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Tampilkan/Sembunyikan Grid Data Cube (1.631 Tile)',
        subtitle: 'Tampilkan atau sembunyikan batas grid Open Data Cube nasional',
        icon: '🔲',
        keywords: ['grid', 'tile', 'data cube', 'odc', 'boundaries', 'indonesia', 'batas'],
        action: () => {
          const btn = document.getElementById('btn-toggle-grid');
          btn?.click();
        }
      },
      {
        id: 'tool-sublayers-popover',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Kustomisasi Sublapisan Peta Dasar',
        subtitle: 'Atur visibilitas jalan, label, batas administrasi, dan kontur',
        icon: '📑',
        keywords: ['sublayer', 'layer', 'roads', 'labels', 'boundaries', 'contours', 'jalan', 'label', 'batas'],
        action: () => {
          const btn = document.getElementById('btn-toggle-sublayers');
          btn?.click();
        }
      },
      {
        id: 'tool-reset',
        category: 'tools',
        categoryLabel: '⚡ Alat & Analisis',
        title: 'Atur Ulang Tampilan Peta',
        subtitle: 'Kembalikan kamera, peta dasar, dan proyeksi ke kondisi awal',
        icon: '↺',
        keywords: ['reset', 'home', 'camera', 'default', 'projection', 'ulang', 'kamera'],
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
          <p>Tidak ada hasil untuk "<strong>${this.searchQuery}</strong>"</p>
          <span style="font-size: 11px; color: var(--text-muted);">Coba cari: Bromo, Sentinel, RBI, Ukur, Geser, atau 3D</span>
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
            placeholder="Cari perintah, lapisan satelit, peta dasar, atau lokasi... (Ketik atau pilih)" 
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
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigasi</span>
            <span><kbd>↵</kbd> Pilih</span>
            <span><kbd>ESC</kbd> Tutup</span>
          </div>
          <span class="cmd-stats">${filtered.length} perintah</span>
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
