import { escapeHtml } from '../utils/sanitize';

export interface ShortcutGroup {
  category: string;
  items: { key: string; description: string }[];
}

export const GIS_SHORTCUTS: ShortcutGroup[] = [
  {
    category: 'Alat & Analisis Spasial',
    items: [
      { key: 'M', description: 'Buka / Aktifkan Alat Pengukuran (Measure Tool)' },
      { key: 'Z', description: 'Batalkan / hapus titik terakhir saat mengukur (Undo)' },
      { key: 'I', description: 'Buka / Aktifkan Inspeksi Titik (Point Inspector)' },
      { key: 'S', description: 'Buka / Aktifkan Komparasi Tirai (Swipe / Split-Screen)' },
      { key: 'T', description: 'Buka / Tutup Tabel Atribut Spasial (Attribute Table)' },
      { key: 'Esc', description: 'Batalkan alat aktif atau tutup modal/panel' }
    ]
  },
  {
    category: 'Navigasi & Tampilan',
    items: [
      { key: 'Ctrl + K / ⌘K', description: 'Buka Command Palette / Pencarian Cepat' },
      { key: 'B', description: 'Buka Galeri Basemap' },
      { key: 'L', description: 'Buka Tab Manajemen Layer & Citra Satelit' },
      { key: 'P', description: 'Buka Analisis Studi Kasus Termal GEE' },
      { key: '?', description: 'Buka Buku Pintar Pintasan Keyboard ini' }
    ]
  },
  {
    category: 'Navigasi Peta (Map Controls)',
    items: [
      { key: '+ / -', description: 'Perbesar / Perkecil skala peta' },
      { key: 'Shift + Drag', description: 'Zoom kotak ke area tertentu (Box Zoom)' },
      { key: 'Ctrl + Drag', description: 'Putar / Rotasi dan kemiringan sudut (Pitch/Bearing)' }
    ]
  }
];

export class ShortcutsModalUI {
  private modalEl: HTMLElement | null = null;
  private isOpen: boolean = false;

  constructor() {
    this.initDOM();
    this.bindGlobalShortcuts();
  }

  private initDOM() {
    let modal = document.getElementById('shortcuts-cheat-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'shortcuts-cheat-modal';
      modal.className = 'shortcuts-modal-overlay hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'shortcuts-title');
      document.body.appendChild(modal);
    }
    this.modalEl = modal;
  }

  public open() {
    this.isOpen = true;
    this.render();
    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }
  }

  public close() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private render() {
    if (!this.modalEl) return;

    const groupsHtml = GIS_SHORTCUTS.map(
      (group) => `
      <div class="shortcut-group">
        <h4 class="shortcut-group-title">${escapeHtml(group.category)}</h4>
        <div class="shortcut-list">
          ${group.items
            .map(
              (item) => `
            <div class="shortcut-item">
              <span class="shortcut-desc">${escapeHtml(item.description)}</span>
              <kbd class="shortcut-key">${escapeHtml(item.key)}</kbd>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
    ).join('');

    this.modalEl.innerHTML = `
      <div class="shortcuts-modal-card">
        <div class="shortcuts-header">
          <div class="shortcuts-title-wrap">
            <span class="shortcuts-icon">⌨️</span>
            <div>
              <h3 id="shortcuts-title">Buku Pintar Pintasan Keyboard (Shortcuts)</h3>
              <p class="shortcuts-subtitle">Akses cepat seluruh alat GIS dan navigasi peta</p>
            </div>
          </div>
          <button id="btn-close-shortcuts" class="btn-close-modal" aria-label="Tutup Modal Pintasan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="shortcuts-body">
          ${groupsHtml}
        </div>

        <div class="shortcuts-footer">
          <span>Tekan <kbd>Esc</kbd> untuk menutup kapan saja</span>
          <button id="btn-done-shortcuts" class="btn-primary-sm">Mengerti</button>
        </div>
      </div>
    `;

    this.modalEl.querySelector('#btn-close-shortcuts')?.addEventListener('click', () => this.close());
    this.modalEl.querySelector('#btn-done-shortcuts')?.addEventListener('click', () => this.close());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });
  }

  private bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing inside an input/textarea/select
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || (document.activeElement as HTMLElement)?.isContentEditable) {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }
}
