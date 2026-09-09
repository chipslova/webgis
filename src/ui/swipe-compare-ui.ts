import { SwipeCompareManager, SWIPE_PRESETS } from '../tools/swipe-compare';
import { PIKSEL_PRODUCTS, S2_YEARS } from '../config/piksel';
import { showToast } from './toast';

export class SwipeCompareUI {
  private manager: SwipeCompareManager;
  private isDragging: boolean = false;

  constructor(manager: SwipeCompareManager) {
    this.manager = manager;
    this.init();
  }

  private init() {
    this.manager.onStateChange(() => {
      this.render();
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

    if (!uiRoot) {
      uiRoot = document.createElement('div');
      uiRoot.id = 'swipe-ui-root';
      uiRoot.className = 'swipe-ui-root';
      document.body.appendChild(uiRoot);
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
      <button class="swipe-preset-chip" data-id="${preset.id}" title="${preset.description}">
        ${preset.name}
      </button>
    `
    ).join('');

    uiRoot.innerHTML = `
      <!-- Top Floating Swipe Control Bar -->
      <div class="swipe-control-bar glass-panel" role="toolbar" aria-label="Kontrol Komparasi Citra Satelit">
        <div class="swipe-side-select left">
          <span class="swipe-side-badge left">⬅ SISI KIRI</span>
          <select id="swipe-left-prod" class="swipe-select" aria-label="Pilih layer sisi kiri">
            ${leftOptionsHtml}
          </select>
          <select id="swipe-left-year" class="swipe-select year" aria-label="Pilih tahun sisi kiri">
            ${leftYearHtml}
          </select>
        </div>

        <div class="swipe-divider-badge">
          <span>VS</span>
        </div>

        <div class="swipe-side-select right">
          <span class="swipe-side-badge right">SISI KANAN ➡</span>
          <select id="swipe-right-prod" class="swipe-select" aria-label="Pilih layer sisi kanan">
            ${rightOptionsHtml}
          </select>
          <select id="swipe-right-year" class="swipe-select year" aria-label="Pilih tahun sisi kanan">
            ${rightYearHtml}
          </select>
        </div>

        <button id="btn-close-swipe" class="btn-close-swipe" title="Keluar dari mode komparasi" aria-label="Tutup mode komparasi">
          ✕ Keluar
        </button>
      </div>

      <!-- Quick Preset Selector Bar -->
      <div class="swipe-presets-bar">
        <span class="presets-label">⚡ Studi Komparasi:</span>
        ${presetsHtml}
      </div>

      <!-- Draggable Split Divider Line & Handle -->
      <div id="swipe-divider-handle" class="swipe-divider-line" style="left: ${sliderPos}%;" role="separator" aria-valuenow="${sliderPos}" aria-valuemin="0" aria-valuemax="100" tabindex="0" aria-label="Geser untuk membandingkan citra kiri dan kanan">
        <div class="swipe-handle-knob">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
            <polyline points="9 18 3 12 9 6"/>
          </svg>
          <span class="swipe-handle-bar"></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
            <polyline points="15 18 21 12 15 6"/>
          </svg>
        </div>
      </div>

      <!-- Floating Side Badges on Map -->
      <div class="swipe-map-badge left" style="left: 16px;">
        <strong>${leftProd?.name || 'Citra Kiri'}</strong>
        <span>Tahun ${leftConfig.year}</span>
      </div>

      <div class="swipe-map-badge right" style="right: 16px;">
        <strong>${rightProd?.name || 'Citra Kanan'}</strong>
        <span>Tahun ${rightConfig.year}</span>
      </div>
    `;

    this.bindEvents(uiRoot);
  }

  private bindEvents(root: HTMLElement) {
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
    root.querySelector('#btn-close-swipe')?.addEventListener('click', () => {
      this.manager.deactivate();
      showToast('Mode komparasi ditutup', 'info');
    });

    // 4. Draggable Handle Events (Mouse & Touch)
    const handle = root.querySelector('#swipe-divider-handle') as HTMLElement;
    if (!handle) return;

    const onPointerMove = (clientX: number) => {
      const mapEl = document.getElementById('map');
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const pct = (relativeX / rect.width) * 100;
      this.manager.setSliderPosition(pct);
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (e.cancelable && 'touches' in e) {
        // Prevent default touch scroll when starting slider drag
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
      window.addEventListener('touchmove', moveHandler, { passive: true });
      window.addEventListener('touchend', upHandler);
    };

    handle.addEventListener('mousedown', onPointerDown);
    handle.addEventListener('touchstart', onPointerDown, { passive: true });

    // Keyboard support for separator
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
