import { SwipeCompareManager, SWIPE_PRESETS } from '../tools/swipe-compare';
import { PIKSEL_PRODUCTS, S2_YEARS } from '../config/piksel';
import { showToast } from './toast';

export class SwipeCompareUI {
  private manager: SwipeCompareManager;
  private isDragging: boolean = false;
  private isCardCollapsed: boolean = false;

  constructor(manager: SwipeCompareManager) {
    this.manager = manager;
    this.init();
    this.bindGlobalShortcuts();
  }

  public init() {
    this.manager.onStateChange(() => {
      // Avoid destroying and rebuilding DOM while actively dragging
      if (!this.isDragging) {
        this.render();
      }
    });
  }

  private bindGlobalShortcuts() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.manager.isActive()) {
        const cmdModal = document.getElementById('cmd-palette-backdrop');
        if (!cmdModal) {
          e.preventDefault();
          this.manager.deactivate();
          showToast('Mode komparasi ditutup (ESC)', 'info');
        }
      }
    });
  }

  public render() {
    const isActive = this.manager.isActive();
    let uiRoot = document.getElementById('swipe-ui-root');

    if (!isActive) {
      if (uiRoot) {
        uiRoot.remove();
      }
      return;
    }

    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    if (!uiRoot) {
      uiRoot = document.createElement('div');
      uiRoot.id = 'swipe-ui-root';
      uiRoot.className = 'swipe-ui-root';
      mapContainer.appendChild(uiRoot);
    } else if (!mapContainer.contains(uiRoot)) {
      mapContainer.appendChild(uiRoot);
    }

    const leftConfig = this.manager.getLeftConfig();
    const rightConfig = this.manager.getRightConfig();
    const sliderPos = this.manager.getSliderPosition();

    const leftProd = PIKSEL_PRODUCTS.find((p) => p.id === leftConfig.productId);
    const rightProd = PIKSEL_PRODUCTS.find((p) => p.id === rightConfig.productId);

    const leftOptionsHtml = PIKSEL_PRODUCTS.filter((p) => !p.isDisabled).map(
      (p) => `<option value="${p.id}" ${p.id === leftConfig.productId ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const rightOptionsHtml = PIKSEL_PRODUCTS.filter((p) => !p.isDisabled).map(
      (p) => `<option value="${p.id}" ${p.id === rightConfig.productId ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const leftYearHtml = S2_YEARS.map(
      (y) => `<option value="${y}" ${y === leftConfig.year ? 'selected' : ''}>${y}</option>`
    ).join('');

    const rightYearHtml = S2_YEARS.map(
      (y) => `<option value="${y}" ${y === rightConfig.year ? 'selected' : ''}>${y}</option>`
    ).join('');

    const presetsHtml = SWIPE_PRESETS.map(
      (preset) => `
      <button class="swipe-preset-chip" data-id="${preset.id}" title="${preset.description}" type="button">
        ${preset.name}
      </button>
    `
    ).join('');

    const cardContentHtml = this.isCardCollapsed
      ? `
        <!-- Collapsed Mini Pill Toolbar (Maximum Map Visibility) -->
        <div class="swipe-mini-pill glass-panel" role="toolbar" aria-label="Status Komparasi Citra">
          <div class="mini-pill-info">
            <span class="mini-pill-dot"></span>
            <span>Komparasi: <strong>${leftProd?.name || 'Kiri'} (${leftConfig.year})</strong> vs <strong>${rightProd?.name || 'Kanan'} (${rightConfig.year})</strong></span>
          </div>
          <div class="mini-pill-actions">
            <button id="btn-toggle-swipe-card" class="btn-micro" title="Buka Menu Pengaturan Layer Komparasi" aria-label="Buka Pengaturan">
              ⚙️ Pengaturan
            </button>
            <button id="btn-close-swipe" class="btn-micro btn-micro-danger" title="Keluar Mode Komparasi" aria-label="Keluar Mode Komparasi">
              ✕ Selesai
            </button>
          </div>
        </div>
      `
      : `
        <!-- Expanded Full Control Card -->
        <div class="swipe-unified-card glass-panel" role="toolbar" aria-label="Kontrol Komparasi Citra Satelit">
          <div class="swipe-header-row">
            <!-- Left Layer Selector -->
            <div class="swipe-side-box left">
              <div class="swipe-side-tag left">
                <span class="swipe-tag-dot left"></span>
                <span>SISI KIRI</span>
              </div>
              <div class="swipe-select-group">
                <select id="swipe-left-prod" class="swipe-select" aria-label="Pilih layer sisi kiri">
                  ${leftOptionsHtml}
                </select>
                <select id="swipe-left-year" class="swipe-select year" aria-label="Pilih tahun sisi kiri">
                  ${leftYearHtml}
                </select>
              </div>
            </div>

            <!-- VS Badge -->
            <div class="swipe-vs-badge" aria-hidden="true">VS</div>

            <!-- Right Layer Selector -->
            <div class="swipe-side-box right">
              <div class="swipe-select-group">
                <select id="swipe-right-prod" class="swipe-select" aria-label="Pilih layer sisi kanan">
                  ${rightOptionsHtml}
                </select>
                <select id="swipe-right-year" class="swipe-select year" aria-label="Pilih tahun sisi kanan">
                  ${rightYearHtml}
                </select>
              </div>
              <div class="swipe-side-tag right">
                <span>SISI KANAN</span>
                <span class="swipe-tag-dot right"></span>
              </div>
            </div>

            <!-- Action Buttons: Minimize & Close -->
            <div class="swipe-card-actions">
              <button id="btn-toggle-swipe-card" class="btn-icon-swipe" title="Sembunyikan Menu (Lihat Peta Penuh)" aria-label="Ciutkan Menu Komparasi" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button id="btn-close-swipe" class="btn-close-swipe" title="Keluar dari mode komparasi" aria-label="Tutup mode komparasi" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>Selesai</span>
              </button>
            </div>
          </div>

          <!-- Integrated Preset Chips Row -->
          <div class="swipe-presets-row">
            <span class="presets-row-label">⚡ Studi:</span>
            <div class="presets-chips-scroll">
              ${presetsHtml}
            </div>
          </div>

          ${this.manager.getPrimaryMapZoom() < 8 ? `
            <div class="swipe-zoom-alert" id="swipe-zoom-alert">
              <div class="swipe-zoom-alert-text">
                <span class="alert-icon" aria-hidden="true">💡</span>
                <span>Zoom saat ini (${this.manager.getPrimaryMapZoom().toFixed(1)}). Citra satelit memerlukan Zoom ≥ 8 agar muncul.</span>
              </div>
              <button id="btn-swipe-autozoom" class="btn-swipe-autozoom" type="button" aria-label="Perbesar otomatis ke zoom 9.5">
                Perbesar Otomatis (9.5) →
              </button>
            </div>
          ` : ''}
        </div>
      `;

    uiRoot.innerHTML = `
      ${cardContentHtml}

      <!-- Draggable Split Divider Line & Handle Knob -->
      <div id="swipe-divider-handle" class="swipe-divider-line" style="left: ${sliderPos}%;" role="separator" aria-valuenow="${sliderPos}" aria-valuemin="0" aria-valuemax="100" tabindex="0" aria-label="Geser untuk membandingkan citra kiri dan kanan">
        <div class="swipe-handle-knob">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span class="swipe-handle-bar"></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
    `;

    this.bindEvents(uiRoot);
  }

  private bindEvents(root: HTMLElement) {
    // 0. Toggle Collapse/Expand Toolbar
    root.querySelector('#btn-toggle-swipe-card')?.addEventListener('click', () => {
      this.isCardCollapsed = !this.isCardCollapsed;
      this.render();
    });

    // 1. Select changes
    const leftProd = root.querySelector('#swipe-left-prod') as HTMLSelectElement;
    leftProd?.addEventListener('change', () => {
      this.manager.setLeftConfig({ productId: leftProd.value });
    });

    const leftYear = root.querySelector('#swipe-left-year') as HTMLSelectElement;
    leftYear?.addEventListener('change', () => {
      this.manager.setLeftConfig({ year: leftYear.value });
    });

    const rightProd = root.querySelector('#swipe-right-prod') as HTMLSelectElement;
    rightProd?.addEventListener('change', () => {
      this.manager.setRightConfig({ productId: rightProd.value });
    });

    const rightYear = root.querySelector('#swipe-right-year') as HTMLSelectElement;
    rightYear?.addEventListener('change', () => {
      this.manager.setRightConfig({ year: rightYear.value });
    });

    // 2. Preset buttons
    root.querySelectorAll('.swipe-preset-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const preset = SWIPE_PRESETS.find((p) => p.id === id);
        if (preset) {
          this.manager.applyPreset(preset);
          showToast(`Komparasi: ${preset.name}`, 'info');
        }
      });
    });

    // 3. Close button
    root.querySelectorAll('#btn-close-swipe').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.manager.deactivate();
        showToast('Mode komparasi ditutup', 'info');
      });
    });

    // 4. Auto-zoom button if zoom < 8
    root.querySelector('#btn-swipe-autozoom')?.addEventListener('click', () => {
      this.manager.autoZoomIfLow(9.5);
      showToast('Memperbesar peta ke Zoom Level 9.5...', 'info');
    });

    // 5. Draggable Divider Handle Events (Mouse & Touch)
    const handle = root.querySelector('#swipe-divider-handle') as HTMLElement;
    if (!handle) return;

    const onPointerMove = (clientX: number) => {
      const mapEl = document.getElementById('map');
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
      this.manager.setSliderPosition(pct);
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (e.cancelable && 'touches' in e) {
        e.preventDefault();
      }
      this.isDragging = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      const moveHandler = (moveEvent: MouseEvent | TouchEvent) => {
        if (!this.isDragging) return;
        const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
        onPointerMove(clientX);
      };

      const upHandler = () => {
        this.isDragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
        window.removeEventListener('touchmove', moveHandler);
        window.removeEventListener('touchend', upHandler);
      };

      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', upHandler);
      window.addEventListener('touchmove', moveHandler, { passive: false });
      window.addEventListener('touchend', upHandler);
    };

    handle.addEventListener('mousedown', onPointerDown);
    handle.addEventListener('touchstart', onPointerDown, { passive: false });

    // Keyboard navigation for accessibility
    handle.addEventListener('keydown', (e) => {
      const cur = this.manager.getSliderPosition();
      if (e.key === 'ArrowLeft') {
        this.manager.setSliderPosition(cur - 5);
      } else if (e.key === 'ArrowRight') {
        this.manager.setSliderPosition(cur + 5);
      }
    });
  }
}
