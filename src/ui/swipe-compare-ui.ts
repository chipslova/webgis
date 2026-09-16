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
          showToast('Comparison mode closed (ESC)', 'info');
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

    const leftYears = leftProd?.availableYears ?? (leftProd?.timeEnabled !== false ? S2_YEARS : []);
    const rightYears = rightProd?.availableYears ?? (rightProd?.timeEnabled !== false ? S2_YEARS : []);

    const showLeftYear = (leftProd?.timeEnabled !== false) && leftYears.length > 0;
    const showRightYear = (rightProd?.timeEnabled !== false) && rightYears.length > 0;

    const leftYearHtml = showLeftYear
      ? `<select id="swipe-left-year" class="swipe-select year" aria-label="Select left side year">
          ${leftYears.map((y) => `<option value="${y}" ${y === leftConfig.year ? 'selected' : ''}>${y}</option>`).join('')}
        </select>`
      : '';

    const rightYearHtml = showRightYear
      ? `<select id="swipe-right-year" class="swipe-select year" aria-label="Select right side year">
          ${rightYears.map((y) => `<option value="${y}" ${y === rightConfig.year ? 'selected' : ''}>${y}</option>`).join('')}
        </select>`
      : '';

    const presetsHtml = SWIPE_PRESETS.map(
      (preset) => `
      <button class="swipe-preset-chip" data-id="${preset.id}" title="${preset.description}" type="button">
        ${preset.name}
      </button>
    `
    ).join('');

    const leftLabelText = `${leftProd?.name || 'Left'}${showLeftYear && leftConfig.year ? ` (${leftConfig.year})` : ''}`;
    const rightLabelText = `${rightProd?.name || 'Right'}${showRightYear && rightConfig.year ? ` (${rightConfig.year})` : ''}`;

    const cardContentHtml = this.isCardCollapsed
      ? `
        <!-- Collapsed Mini Pill Toolbar (Maximum Map Visibility) -->
        <div class="swipe-mini-pill glass-panel" role="toolbar" aria-label="Image Comparison Status">
          <div class="mini-pill-info">
            <span class="mini-pill-dot"></span>
            <span>Comparison: <strong>${leftLabelText}</strong> vs <strong>${rightLabelText}</strong></span>
          </div>
          <div class="mini-pill-actions">
            <button id="btn-toggle-swipe-card" class="btn-micro" title="Open Comparison Layer Settings" aria-label="Open Settings">
              ⚙️ Settings
            </button>
            <button id="btn-close-swipe" class="btn-micro btn-micro-danger" title="Exit Comparison Mode" aria-label="Exit Comparison Mode">
              ✕ Done
            </button>
          </div>
        </div>
      `
      : `
        <!-- Expanded Full Control Card -->
        <div class="swipe-unified-card glass-panel" role="toolbar" aria-label="Satellite Imagery Comparison Controls">
          <div class="swipe-header-row">
            <!-- Left Layer Selector -->
            <div class="swipe-side-box left">
              <div class="swipe-side-tag left">
                <span class="swipe-tag-dot left"></span>
                <span>LEFT SIDE</span>
              </div>
              <div class="swipe-select-group">
                <select id="swipe-left-prod" class="swipe-select" aria-label="Select left side layer">
                  ${leftOptionsHtml}
                </select>
                ${leftYearHtml}
              </div>
            </div>

            <!-- VS Badge -->
            <div class="swipe-vs-badge" aria-hidden="true">VS</div>

            <!-- Right Layer Selector -->
            <div class="swipe-side-box right">
              <div class="swipe-select-group">
                <select id="swipe-right-prod" class="swipe-select" aria-label="Select right side layer">
                  ${rightOptionsHtml}
                </select>
                ${rightYearHtml}
              </div>
              <div class="swipe-side-tag right">
                <span>RIGHT SIDE</span>
                <span class="swipe-tag-dot right"></span>
              </div>
            </div>

            <!-- Action Buttons: Minimize & Close -->
            <div class="swipe-card-actions">
              <button id="btn-toggle-swipe-card" class="btn-icon-swipe" title="Hide Menu (Full Map View)" aria-label="Collapse Comparison Menu" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button id="btn-close-swipe" class="btn-close-swipe" title="Exit comparison mode" aria-label="Close comparison mode" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>Done</span>
              </button>
            </div>
          </div>

          <!-- Integrated Preset Chips Row -->
          <div class="swipe-presets-row">
            <span class="presets-row-label">⚡ Studies:</span>
            <div class="presets-chips-scroll">
              ${presetsHtml}
            </div>
          </div>

          ${this.manager.getPrimaryMapZoom() < 8 ? `
            <div class="swipe-zoom-alert" id="swipe-zoom-alert">
              <div class="swipe-zoom-alert-text">
                <span class="alert-icon" aria-hidden="true">💡</span>
                <span>Current zoom (${this.manager.getPrimaryMapZoom().toFixed(1)}). Satellite imagery requires Zoom ≥ 8 to appear.</span>
              </div>
              <button id="btn-swipe-autozoom" class="btn-swipe-autozoom" type="button" aria-label="Auto zoom to level 9.5">
                Auto Zoom (9.5) →
              </button>
            </div>
          ` : ''}
        </div>
      `;

    uiRoot.innerHTML = `
      ${cardContentHtml}

      <!-- Draggable Split Divider Line & Handle Knob -->
      <div id="swipe-divider-handle" class="swipe-divider-line" style="left: ${sliderPos}%;" role="separator" aria-valuenow="${sliderPos}" aria-valuemin="0" aria-valuemax="100" tabindex="0" aria-label="Drag to compare left and right imagery">
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
      const prod = PIKSEL_PRODUCTS.find((p) => p.id === leftProd.value);
      const years = prod?.availableYears ?? (prod?.timeEnabled !== false ? S2_YEARS : []);
      const currentYear = this.manager.getLeftConfig().year;
      const nextYear = years.length > 0 ? (years.includes(currentYear) ? currentYear : years[0]) : '';
      this.manager.setLeftConfig({ productId: leftProd.value, year: nextYear });
    });

    const leftYear = root.querySelector('#swipe-left-year') as HTMLSelectElement;
    leftYear?.addEventListener('change', () => {
      this.manager.setLeftConfig({ year: leftYear.value });
    });

    const rightProd = root.querySelector('#swipe-right-prod') as HTMLSelectElement;
    rightProd?.addEventListener('change', () => {
      const prod = PIKSEL_PRODUCTS.find((p) => p.id === rightProd.value);
      const years = prod?.availableYears ?? (prod?.timeEnabled !== false ? S2_YEARS : []);
      const currentYear = this.manager.getRightConfig().year;
      const nextYear = years.length > 0 ? (years.includes(currentYear) ? currentYear : years[0]) : '';
      this.manager.setRightConfig({ productId: rightProd.value, year: nextYear });
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
          showToast(`Comparison: ${preset.name}`, 'info');
        }
      });
    });

    // 3. Close button
    root.querySelectorAll('#btn-close-swipe').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.manager.deactivate();
        showToast('Comparison mode closed', 'info');
      });
    });

    // 4. Auto-zoom button if zoom < 8
    root.querySelector('#btn-swipe-autozoom')?.addEventListener('click', () => {
      this.manager.autoZoomIfLow(9.5);
      showToast('Zooming map to Zoom Level 9.5...', 'info');
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
