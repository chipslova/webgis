import { SwipeCompareManager, SWIPE_PRESETS } from '../tools/swipe-compare';
import { PIKSEL_PRODUCTS, ALL_COMPARE_PRODUCTS, GEE_COMPARE_PRODUCTS, S2_YEARS, GEE_YEARS } from '../config/piksel';
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
          showToast('Mode komparasi swipe ditutup (ESC)', 'info');
        }
      }
    });
  }

  public render() {
    const isActive = this.manager.isActive();
    let uiRoot = document.getElementById('swipe-ui-root');

    if (!isActive) {
      if (uiRoot) uiRoot.remove();
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

    const leftProd = ALL_COMPARE_PRODUCTS.find((p) => p.id === leftConfig.productId);
    const rightProd = ALL_COMPARE_PRODUCTS.find((p) => p.id === rightConfig.productId);

    const renderOptionsHtml = (selectedId: string | null) => {
      const pikselOpts = PIKSEL_PRODUCTS.filter((p) => !p.isDisabled).map(
        (p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`
      ).join('');
      const geeOpts = GEE_COMPARE_PRODUCTS.filter((p) => !p.isDisabled).map(
        (p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`
      ).join('');
      return `
        <optgroup label="🛰️ Satelit BIG Piksel (Sentinel-2)">
          ${pikselOpts}
        </optgroup>
        <optgroup label="🌍 Google Earth Engine (Suhu, Hujan & LULC)">
          ${geeOpts}
        </optgroup>
      `;
    };

    const leftOptionsHtml = renderOptionsHtml(leftConfig.productId);
    const rightOptionsHtml = renderOptionsHtml(rightConfig.productId);

    const leftYears = leftProd?.availableYears ?? (leftProd?.category === 'gee' ? GEE_YEARS : (leftProd?.timeEnabled !== false ? S2_YEARS : []));
    const rightYears = rightProd?.availableYears ?? (rightProd?.category === 'gee' ? GEE_YEARS : (rightProd?.timeEnabled !== false ? S2_YEARS : []));

    const leftTimeOptions = leftProd?.timeOptions ?? leftYears.map((y) => ({ value: y, label: y }));
    const rightTimeOptions = rightProd?.timeOptions ?? rightYears.map((y) => ({ value: y, label: y }));

    const showLeftYear = (leftProd?.timeEnabled !== false) && leftTimeOptions.length > 0;
    const showRightYear = (rightProd?.timeEnabled !== false) && rightTimeOptions.length > 0;

    const activeLeftVal = leftTimeOptions.some((o) => o.value === leftConfig.year)
      ? leftConfig.year
      : (leftTimeOptions.find((o) => leftConfig.year && o.value.startsWith(leftConfig.year))?.value ?? leftTimeOptions[0]?.value ?? '');

    const activeRightVal = rightTimeOptions.some((o) => o.value === rightConfig.year)
      ? rightConfig.year
      : (rightTimeOptions.find((o) => rightConfig.year && o.value.startsWith(rightConfig.year))?.value ?? rightTimeOptions[0]?.value ?? '');

    const leftYearHtml = showLeftYear
      ? `<select id="swipe-left-year" class="sc-year-select" aria-label="Pilih periode atau tahun lapisan sisi kiri">
          ${leftTimeOptions.map((opt) => `<option value="${opt.value}" ${opt.value === activeLeftVal ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>`
      : '';

    const rightYearHtml = showRightYear
      ? `<select id="swipe-right-year" class="sc-year-select" aria-label="Pilih periode atau tahun sisi kanan">
          ${rightTimeOptions.map((opt) => `<option value="${opt.value}" ${opt.value === activeRightVal ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>`
      : '';

    const findTimeLabel = (prod: any, val: string) => {
      if (!val) return '';
      const match = prod?.timeOptions?.find((o: any) => o.value === val)
        || prod?.timeOptions?.find((o: any) => o.value.startsWith(val));
      return match ? match.label : val;
    };

    const leftName = leftProd?.name || 'Lapisan Kiri';
    const rightName = rightProd?.name || 'Lapisan Kanan';
    const leftYear = showLeftYear ? findTimeLabel(leftProd, activeLeftVal) : '';
    const rightYear = showRightYear ? findTimeLabel(rightProd, activeRightVal) : '';

    const presetEmojis: Record<string, string> = {
      'ikn-dev': '🏙️', 'bromo-spectral': '🌋', 'jakarta-urban': '🌆',
      'danau-toba': '💧', 'jakarta-ndbi': '🏗️', 'sebangau-moisture': '🌿',
      'jakarta-uhi-thermal': '🌡️', 'java-thermal-contrast': '🌳',
      'elnino-vs-lanina-thermal': '🔥'
    };

    const presetsHtml = SWIPE_PRESETS.map((preset) => `
      <button class="sc-preset-chip" data-id="${preset.id}" title="${preset.description}" type="button">
        <span class="sc-preset-emoji">${presetEmojis[preset.id] || '📍'}</span>
        <span>${preset.name}</span>
      </button>
    `).join('');

    const cardContentHtml = this.isCardCollapsed
      ? `
        <div class="sc-mini-pill" role="toolbar" aria-label="Status Komparasi Citra">
          <span class="sc-mini-dot"></span>
          <span class="sc-mini-text"><strong>${leftName}</strong> <span class="sc-vs-tiny">vs</span> <strong>${rightName}</strong></span>
          <div class="sc-mini-actions">
            <button id="btn-toggle-swipe-card" class="sc-btn-expand" title="Buka Pengaturan" aria-label="Buka Pengaturan" type="button">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Pengaturan
            </button>
            <button id="btn-close-swipe" class="sc-btn-exit" title="Keluar Mode Komparasi" aria-label="Keluar" type="button">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Selesai
            </button>
          </div>
        </div>
      `
      : `
        <!-- Expanded Control Card — anchored at bottom-center -->
        <div class="sc-control-card" role="toolbar" aria-label="Kontrol Komparasi Citra Satelit">

          <!-- Title Bar -->
          <div class="sc-title-bar">
            <div class="sc-brand">
              <div class="sc-brand-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2.5"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>
              </div>
              <span class="sc-brand-label">BANDINGKAN CITRA</span>
              <span class="sc-brand-hint">Geser garis tengah ◀▶</span>
            </div>
            <div class="sc-title-actions">
              <button id="btn-toggle-swipe-card" class="sc-btn-minimize" title="Perkecil panel" aria-label="Perkecil" type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button id="btn-close-swipe" class="sc-btn-close" title="Keluar mode komparasi" aria-label="Tutup" type="button">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Selesai
              </button>
            </div>
          </div>

          <!-- Layer Selector Row -->
          <div class="sc-layers-row">
            <!-- LEFT -->
            <div class="sc-side left">
              <div class="sc-side-header left">
                <span class="sc-side-dot left"></span>
                <span class="sc-side-tag">KIRI</span>
              </div>
              <div class="sc-selects">
                <select id="swipe-left-prod" class="sc-prod-select" aria-label="Lapisan kiri">
                  ${leftOptionsHtml}
                </select>
                ${leftYearHtml}
              </div>
            </div>

            <!-- VS -->
            <div class="sc-vs-col" aria-hidden="true">
              <div class="sc-vs-glyph">VS</div>
            </div>

            <!-- RIGHT -->
            <div class="sc-side right">
              <div class="sc-side-header right">
                <span class="sc-side-tag">KANAN</span>
                <span class="sc-side-dot right"></span>
              </div>
              <div class="sc-selects">
                <select id="swipe-right-prod" class="sc-prod-select" aria-label="Lapisan kanan">
                  ${rightOptionsHtml}
                </select>
                ${rightYearHtml}
              </div>
            </div>
          </div>

          <!-- Preset Chips -->
          <div class="sc-presets-bar">
            <span class="sc-presets-label">⚡ Studi Kasus:</span>
            <div class="sc-presets-scroll">
              ${presetsHtml}
            </div>
          </div>

          ${this.manager.getPrimaryMapZoom() < 8 ? `
            <div class="sc-zoom-alert">
              <span>💡 Zoom terlalu rendah (${this.manager.getPrimaryMapZoom().toFixed(1)}). Citra satelit butuh Zoom ≥ 8.</span>
              <button id="btn-swipe-autozoom" class="sc-btn-autozoom" type="button">Zoom → 9.5</button>
            </div>
          ` : ''}
        </div>
      `;

    // Floating edge labels at bottom corners of the map
    const edgeLabelsHtml = this.isCardCollapsed ? '' : `
      <div class="sc-map-badge sc-map-badge-left" aria-hidden="true">
        <span class="sc-badge-dot left"></span>
        <div>
          <div class="sc-badge-name">${leftName}</div>
          ${leftYear ? `<div class="sc-badge-year">${leftYear}</div>` : ''}
        </div>
      </div>
      <div class="sc-map-badge sc-map-badge-right" aria-hidden="true">
        <div style="text-align:right">
          <div class="sc-badge-name">${rightName}</div>
          ${rightYear ? `<div class="sc-badge-year">${rightYear}</div>` : ''}
        </div>
        <span class="sc-badge-dot right"></span>
      </div>
    `;

    uiRoot.innerHTML = `
      ${edgeLabelsHtml}
      ${cardContentHtml}

      <!-- Draggable Split Divider -->
      <div id="swipe-divider-handle" class="sc-divider" style="left:${sliderPos}%;"
           role="separator" aria-valuenow="${sliderPos}" aria-valuemin="0" aria-valuemax="100"
           tabindex="0" aria-label="Geser pemisah untuk membandingkan citra">
        <div class="sc-div-line"></div>
        <div class="sc-div-knob">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          <div class="sc-div-grips"><span></span><span></span><span></span></div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="sc-div-ripple"></div>
      </div>
    `;

    this.bindEvents(uiRoot);
  }

  private bindEvents(root: HTMLElement) {
    root.querySelector('#btn-toggle-swipe-card')?.addEventListener('click', () => {
      this.isCardCollapsed = !this.isCardCollapsed;
      this.render();
    });

    const leftProd = root.querySelector('#swipe-left-prod') as HTMLSelectElement;
    leftProd?.addEventListener('change', () => {
      const prod = ALL_COMPARE_PRODUCTS.find((p) => p.id === leftProd.value);
      const timeOpts = prod?.timeOptions ?? (prod?.availableYears ?? (prod?.category === 'gee' ? GEE_YEARS : (prod?.timeEnabled !== false ? S2_YEARS : []))).map((y) => ({ value: y, label: y }));
      const currentYear = this.manager.getLeftConfig().year;
      const hasCurrent = timeOpts.some((o) => o.value === currentYear);
      const nextYear = timeOpts.length > 0 ? (hasCurrent ? currentYear : timeOpts[0].value) : '';
      this.manager.setLeftConfig({ productId: leftProd.value, year: nextYear });
    });

    const leftYear = root.querySelector('#swipe-left-year') as HTMLSelectElement;
    leftYear?.addEventListener('change', () => {
      this.manager.setLeftConfig({ year: leftYear.value });
    });

    const rightProd = root.querySelector('#swipe-right-prod') as HTMLSelectElement;
    rightProd?.addEventListener('change', () => {
      const prod = ALL_COMPARE_PRODUCTS.find((p) => p.id === rightProd.value);
      const timeOpts = prod?.timeOptions ?? (prod?.availableYears ?? (prod?.category === 'gee' ? GEE_YEARS : (prod?.timeEnabled !== false ? S2_YEARS : []))).map((y) => ({ value: y, label: y }));
      const currentYear = this.manager.getRightConfig().year;
      const hasCurrent = timeOpts.some((o) => o.value === currentYear);
      const nextYear = timeOpts.length > 0 ? (hasCurrent ? currentYear : timeOpts[0].value) : '';
      this.manager.setRightConfig({ productId: rightProd.value, year: nextYear });
    });

    const rightYear = root.querySelector('#swipe-right-year') as HTMLSelectElement;
    rightYear?.addEventListener('change', () => {
      this.manager.setRightConfig({ year: rightYear.value });
    });

    root.querySelectorAll('.sc-preset-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const preset = SWIPE_PRESETS.find((p) => p.id === id);
        if (preset) {
          this.manager.applyPreset(preset);
          showToast(`📍 Komparasi: ${preset.name}`, 'info');
        }
      });
    });

    root.querySelectorAll('#btn-close-swipe').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.manager.deactivate();
        showToast('Mode komparasi swipe ditutup', 'info');
      });
    });

    root.querySelector('#btn-swipe-autozoom')?.addEventListener('click', () => {
      this.manager.autoZoomIfLow(9.5);
      showToast('Mengarahkan peta ke Zoom Level 9.5...', 'info');
    });

    const handle = root.querySelector('#swipe-divider-handle') as HTMLElement;
    if (!handle) return;

    const onPointerMove = (clientX: number) => {
      const mapEl = document.getElementById('map');
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      this.manager.setSliderPosition(pct);
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (e.cancelable && 'touches' in e) e.preventDefault();
      this.isDragging = true;
      handle.classList.add('sc-dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      const moveHandler = (ev: MouseEvent | TouchEvent) => {
        if (!this.isDragging) return;
        onPointerMove('touches' in ev ? ev.touches[0].clientX : ev.clientX);
      };
      const upHandler = () => {
        this.isDragging = false;
        handle.classList.remove('sc-dragging');
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

    handle.addEventListener('keydown', (e) => {
      const cur = this.manager.getSliderPosition();
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.manager.setSliderPosition(cur - 5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.manager.setSliderPosition(cur + 5); }
    });
  }
}
