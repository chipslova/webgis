import { escapeHtml } from '../utils/sanitize';

export interface ShortcutGroup {
  category: string;
  items: { key: string; description: string }[];
}

export const GIS_SHORTCUTS: ShortcutGroup[] = [
  {
    category: 'Spatial Tools & Analysis',
    items: [
      { key: 'M', description: 'Open / Activate Measure Tool' },
      { key: 'Z', description: 'Undo last point while measuring' },
      { key: 'I', description: 'Open / Activate Point Inspector' },
      { key: 'S', description: 'Open / Activate Swipe Split-Screen Compare' },
      { key: 'T', description: 'Open / Close Spatial Attribute Table' },
      { key: 'Esc', description: 'Cancel active tool or close modal/panel' }
    ]
  },
  {
    category: 'Navigation & View',
    items: [
      { key: 'Ctrl + K / ⌘K', description: 'Open Command Palette / Quick Search' },
      { key: 'A', description: 'Open Analisis Spasial (Zonal AOI & Buffer) Tab' },
      { key: 'B', description: 'Open Basemap Gallery' },
      { key: 'L', description: 'Open Layer Stack & Satellite Imagery Tab' },
      { key: 'P', description: 'Open GEE Thermal Analysis Tab' },
      { key: '?', description: 'Open this Keyboard Shortcuts Cheatsheet' }
    ]
  },
  {
    category: 'Map Controls',
    items: [
      { key: '+ / -', description: 'Zoom in / Zoom out map scale' },
      { key: 'Shift + Drag', description: 'Box zoom to specific bounding box' },
      { key: 'Ctrl + Drag', description: 'Rotate bearing and pitch angle' }
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
              <h3 id="shortcuts-title">Keyboard Shortcuts Cheatsheet</h3>
              <p class="shortcuts-subtitle">Quick access to all GIS tools and map controls</p>
            </div>
          </div>
          <button id="btn-close-shortcuts" class="btn-close-modal" aria-label="Close Shortcuts Modal">
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
          <span>Press <kbd>Esc</kbd> to close anytime</span>
          <button id="btn-done-shortcuts" class="btn-primary-sm">Got it</button>
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
