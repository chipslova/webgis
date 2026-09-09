import { BASEMAPS } from '../config/basemaps';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../config/piksel';
import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { MeasureTool } from '../tools/measure';
import { SidebarUI } from './sidebar';
import { SwipeCompareManager } from '../tools/swipe-compare';
import { GuidedTourUI } from './guided-tour';
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

  private isOpen: boolean = false;
  private selectedIndex: number = 0;
  private searchQuery: string = '';
  private modalEl: HTMLElement | null = null;

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

  public open() {
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
        categoryLabel: '📍 Kawasan Pantauan',
        title: preset.name,
        subtitle: `${preset.locationName} · ${preset.description}`,
        icon: '📍',
        keywords: [preset.name, preset.locationName, 'kawasan', 'lokasi', 'studi'],
        action: () => {
          this.pikselLoader?.flyToPreset(preset);
          this.sidebarUI.setActiveTab('piksel');
          showToast(`Terbang ke ${preset.name}`, 'info');
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
        keywords: [prod.name, prod.category, prod.sensor, 'citra', 'satelit', 'wms'],
        action: () => {
          this.pikselLoader?.setActiveProduct(prod.id);
          this.pikselLoader?.autoFlyToOptimalView(prod.id);
          this.sidebarUI.setActiveTab('piksel');
          showToast(`Layer ${prod.name} aktif`, 'info');
        }
      });
    });

    // 3. 16 Basemaps
    BASEMAPS.forEach((bm) => {
      commands.push({
        id: `bm-${bm.id}`,
        category: 'basemaps',
        categoryLabel: '🗺️ Peta Dasar (Basemaps)',
        title: bm.name,
        subtitle: `${bm.category} · ${bm.description}`,
        icon: '🗺️',
        keywords: [bm.name, bm.category, 'basemap', 'peta'],
        action: () => {
          this.mapManager.setBasemap(bm.id);
          showToast(`Basemap diubah ke ${bm.name}`, 'info');
        }
      });
    });

    // 4. Tools & Actions
    commands.push(
      {
        id: 'tool-swipe',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Komparasi Citra (Swipe Split-Screen)',
        subtitle: 'Bandingkan dua citra satelit atau tahun secara berdampingan',
        icon: '🪟',
        keywords: ['swipe', 'compare', 'komparasi', 'split', 'sebelum', 'sesudah', 'before', 'after'],
        action: () => {
          this.swipeCompareManager?.activate();
          showToast('Mode komparasi swipe aktif', 'info');
        }
      },
      {
        id: 'tool-tour',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Mulai Tur Jelajah (Demo 30 Detik)',
        subtitle: 'Tur terpadu menjelajah citra satelit, analisis suhu, dan 3D terrain',
        icon: '🚀',
        keywords: ['tour', 'demo', 'jelajah', 'panduan', 'mulai'],
        action: () => {
          this.guidedTourUI?.startTour();
        }
      },
      {
        id: 'tool-globe',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Beralih Proyeksi 3D Bola Dunia / 2D Mercator',
        subtitle: 'Ganti proyeksi visualisasi peta antara bola dunia 3D dan mercator',
        icon: '🌐',
        keywords: ['globe', 'proyeksi', 'bola dunia', '3d', 'mercator'],
        action: () => {
          this.mapManager.toggleProjection();
        }
      },
      {
        id: 'tool-measure-dist',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Ukur Jarak Lintasan Geodesik',
        subtitle: 'Hitung panjang rute atau jarak antarlokasi secara presisi',
        icon: '📏',
        keywords: ['ukur', 'jarak', 'distance', 'panjang', 'measure'],
        action: () => {
          this.sidebarUI.setActiveTab('measure');
          this.measureTool?.setMode('distance');
          showToast('Klik pada peta untuk menambah titik ukur jarak', 'info');
        }
      },
      {
        id: 'tool-measure-area',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Ukur Luas Area Poligon Geodesik',
        subtitle: 'Hitung luas wilayah poligon dengan perhitungan sferikal Turf.js',
        icon: '📐',
        keywords: ['luas', 'area', 'poligon', 'hektar', 'measure'],
        action: () => {
          this.sidebarUI.setActiveTab('measure');
          this.measureTool?.setMode('area');
          showToast('Klik pada peta untuk membuat poligon pengukuran luas', 'info');
        }
      },
      {
        id: 'tool-gee-uhi',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Studi Kasus Suhu Termal GEE (Jabodetabek)',
        subtitle: 'Lihat peta pulau bahang MODIS LST dan grafik deret waktu',
        icon: '🌡️',
        keywords: ['suhu', 'termal', 'gee', 'lst', 'uhi', 'panas', 'grafik'],
        action: () => {
          this.sidebarUI.setActiveTab('gee');
          this.geeLoader?.loadGEEDatasets();
          showToast('Analisis Spasial & Termal GEE diaktifkan', 'info');
        }
      },
      {
        id: 'tool-reset',
        category: 'tools',
        categoryLabel: '⚡ Fitur & Analisis',
        title: 'Reset Tampilan Peta',
        subtitle: 'Kembalikan kamera ke skala nusantara Indonesia dan bersihkan layer aktif',
        icon: '↺',
        keywords: ['reset', 'kembali', 'awal', 'bersihkan', 'clear'],
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
          <span style="font-size: 11px; color: var(--text-muted);">Coba cari kata kunci seperti: Bromo, Sentinel, RBI, Ukur, Swipe, atau 3D</span>
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
            placeholder="Cari perintah, layer satelit, basemap, atau kawasan... (Ketik atau pilih)" 
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
            <span><kbd>↵</kbd> Jalankan</span>
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
