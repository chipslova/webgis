import { PikselLoader, PikselLoadingState } from '../tools/piksel-loader';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS, PIKSEL_CATEGORIES, S2_YEARS, PikselProduct } from '../config/piksel';

export class PikselPanelUI {
  private pikselLoader: PikselLoader;
  private isEventsBound: boolean = false;
  private currentLoadingState: PikselLoadingState = { isLoading: false, productId: null };
  private hudHideTimer: any = null;

  constructor(pikselLoader: PikselLoader) {
    this.pikselLoader = pikselLoader;
  }

  public init() {
    this.renderPresets();
    this.renderControls();
    this.renderProducts();
    this.bindEvents();

    this.pikselLoader.onLoadingStateChange((state) => {
      this.currentLoadingState = state;
      this.renderLoadingBanner();
      this.updateMapHUD(state);
    });

    const map = this.pikselLoader.getMap();
    if (map) {
      map.on('style.load', () => {
        this.syncUIStates();
      });
    }
  }

  private renderPresets() {
    const container = document.getElementById('piksel-presets-container');
    if (!container) return;

    container.innerHTML = '';

    PIKSEL_PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'piksel-preset-btn';
      btn.innerHTML = `
        <div class="preset-name">${preset.name}</div>
        <div class="preset-loc">${preset.locationName}</div>
      `;
      btn.title = preset.description;

      btn.addEventListener('click', () => {
        this.pikselLoader.flyToPreset(preset);

        document.querySelectorAll('.piksel-preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Automatically activate the recommended product for this study zone
        if (preset.recommendedProduct) {
          this.pikselLoader.setActiveProduct(preset.recommendedProduct);
          this.syncUIStates();
        }
      });

      container.appendChild(btn);
    });
  }

  private renderControls() {
    const container = document.getElementById('piksel-products-container');
    if (!container) return;

    const activeProduct = this.pikselLoader.getActiveProduct();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();
    const currentYear = this.pikselLoader.getSelectedYear();

    let activeSummaryHtml = '';
    if (activeProduct) {
      const yearOptionsHtml = (activeProduct.availableYears || S2_YEARS).map(
        (y) => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
      ).join('');

      activeSummaryHtml = `
        <div class="piksel-active-summary-card">
          <div class="piksel-active-header">
            <div class="piksel-active-title-group">
              <span class="active-pulse-indicator"></span>
              <div>
                <h4 class="active-product-heading">${activeProduct.name}</h4>
                <span class="active-tag-badge">${activeProduct.badge}</span>
              </div>
            </div>
          </div>

          <div class="piksel-active-meta-grid">
            <div class="meta-field">
              <span class="meta-field-label">📅 Tahun:</span>
              ${activeProduct.timeEnabled ? `
                <select id="piksel-year-select" class="piksel-select-sm">
                  ${yearOptionsHtml}
                </select>
              ` : `<span class="meta-field-val">Statik</span>`}
            </div>
            <div class="meta-field">
              <span class="meta-field-label">📐 Resolusi:</span>
              <span class="meta-field-val">${activeProduct.resolution}</span>
            </div>
            <div class="meta-field">
              <span class="meta-field-label">🏢 Penyedia:</span>
              <span class="meta-field-val">BIG Piksel</span>
            </div>
            <div class="meta-field">
              <span class="meta-field-label">🌐 Layanan:</span>
              <span class="meta-field-val">OGC WMS 1.3.0</span>
            </div>
          </div>

          <div class="piksel-active-slider-wrap">
            <div class="slider-header-row">
              <span>Transparansi:</span>
              <strong id="piksel-master-opacity-val">${opacityPct}%</strong>
            </div>
            <input 
              type="range" 
              id="piksel-master-opacity" 
              min="0" 
              max="100" 
              value="${opacityPct}" 
              class="piksel-slider" 
            />
          </div>

          <button id="btn-clear-piksel-layer" class="btn btn-danger-outline full-width" style="margin-top: 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M18 6 6 18M6 6l12 12"/></svg>
            ✕ Nonaktifkan Layer
          </button>
        </div>
      `;
    } else {
      activeSummaryHtml = `
        <div class="piksel-inactive-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Pilih salah satu produk citra satelit atau indeks di katalog bawah untuk mengaktifkan layer.</span>
        </div>
      `;
    }

    const controlsHtml = `
      <!-- Loading & Status Banner Container in Sidebar -->
      <div id="piksel-loading-banner-wrap"></div>

      <!-- Active Layer Card / Inactive Banner -->
      <div id="piksel-active-card-container">
        ${activeSummaryHtml}
      </div>

      <!-- Data Cube Grid Toggle -->
      <div class="piksel-grid-toggle-box" style="margin-top: 12px;">
        <label class="piksel-toggle-label">
          <input type="checkbox" id="toggle-piksel-grid" ${isGridOn ? 'checked' : ''} />
          <span class="toggle-text">
            <strong>📦 Tampilkan Grid Tile Data Cube (BIG Piksel)</strong>
            <small>Garis 1.631 tile Open Data Cube nasional (klik tile untuk metadata)</small>
          </span>
        </label>
      </div>

      <div class="piksel-section-subtitle" style="margin-top: 16px; margin-bottom: 8px;">KATALOG PRODUK OGC BIG PIKSEL:</div>
      <div class="piksel-products-list" id="piksel-products-inner-list"></div>
    `;

    container.innerHTML = controlsHtml;
  }

  private updateMapHUD(state: PikselLoadingState) {
    const hud = document.getElementById('piksel-map-hud');
    const titleEl = document.getElementById('hud-title');
    const subEl = document.getElementById('hud-subtitle');
    if (!hud || !titleEl || !subEl) return;

    if (this.hudHideTimer) {
      clearTimeout(this.hudHideTimer);
      this.hudHideTimer = null;
    }

    if (state.productId) {
      hud.style.display = 'flex';

      if (state.isLoading) {
        hud.classList.remove('ready');
        hud.classList.remove('error');
        titleEl.innerHTML = `🛰️ Memuat Layer WMS: ${state.productName}`;
        subEl.innerHTML = state.isComputeHeavy 
          ? `⚡ Pemrosesan spektral on-the-fly di cloud BIG Piksel...`
          : `Mengunduh tile resolusi tinggi dari server OGC BIG...`;
      } else if (state.hasError) {
        hud.classList.remove('ready');
        hud.classList.add('error');
        titleEl.innerHTML = `🔴 Gagal Mengambil Tile WMS`;
        subEl.innerHTML = `Server BIG OGC timeout / 500. Silakan pilih produk atau tahun lain.`;
      } else {
        hud.classList.remove('error');
        hud.classList.add('ready');
        const prod = this.pikselLoader.getActiveProduct();
        const yearText = prod?.timeEnabled ? ` (${this.pikselLoader.getSelectedYear()})` : '';
        titleEl.innerHTML = `✅ Layer Aktif: ${state.productName}${yearText}`;
        subEl.innerHTML = `Sumber: OGC WMS Badan Informasi Geospasial (BIG)`;

        // Fade out floating HUD badge gracefully after 5 seconds
        this.hudHideTimer = setTimeout(() => {
          if (hud) hud.style.display = 'none';
        }, 5000);
      }
    } else {
      hud.style.display = 'none';
    }
  }

  private renderLoadingBanner() {
    const bannerWrap = document.getElementById('piksel-loading-banner-wrap');
    if (!bannerWrap) return;

    if (this.currentLoadingState.isLoading) {
      bannerWrap.innerHTML = `
        <div class="piksel-live-toast loading">
          <div class="piksel-toast-spinner"></div>
          <div class="piksel-toast-content">
            <strong>🛰️ Memuat Layer WMS Piksel...</strong>
            <span>${this.currentLoadingState.productName || 'Sedang mengambil tile dari OGC BIG'}</span>
            ${this.currentLoadingState.isComputeHeavy ? '<small style="color: #f59e0b; display: block; margin-top: 2px;">⚡ Pemrosesan spektral on-the-fly di cloud BIG...</small>' : ''}
          </div>
        </div>
      `;
    } else if (this.currentLoadingState.hasError) {
      bannerWrap.innerHTML = `
        <div class="piksel-live-toast error" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.12);">
          <div class="piksel-toast-content">
            <strong style="color: #ef4444;">⚠️ Gagal Memuat Layer WMS</strong>
            <span>Server OGC BIG mengembalikan status error / timeout. Coba pilih produk atau tahun lain.</span>
          </div>
        </div>
      `;
    } else {
      bannerWrap.innerHTML = '';
    }
  }

  private renderLegend(product: PikselProduct): string {
    if (product.legend.type === 'categorical') {
      const itemsHtml = product.legend.items
        .map(
          (item) => `
          <div class="piksel-cat-item">
            <span class="piksel-cat-swatch" style="background-color: ${item.color};"></span>
            <span class="piksel-cat-label">${item.label}</span>
          </div>
        `
        )
        .join('');

      return `
        <div class="piksel-legend-container categorical">
          <div class="piksel-categorical-list">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // Continuous or Natural legend
    const legend = product.legend;
    const rangeTextHtml = legend.type === 'continuous' && legend.rangeText 
      ? `<div class="piksel-legend-range-note">${legend.rangeText}</div>` 
      : '';

    return `
      <div class="piksel-legend-container">
        ${rangeTextHtml}
        <div class="piksel-legend-bar">
          <div class="legend-gradient ${legend.gradientClass}"></div>
        </div>
        <div class="piksel-legend-labels">
          <span class="legend-scale-label left">${legend.leftLabel}</span>
          ${legend.middleLabel ? `<span class="legend-scale-label middle">${legend.middleLabel}</span>` : ''}
          <span class="legend-scale-label right">${legend.rightLabel}</span>
        </div>
      </div>
    `;
  }

  private renderProducts() {
    const listContainer = document.getElementById('piksel-products-inner-list');
    if (!listContainer) return;

    const activeId = this.pikselLoader.getActiveProductId();
    const currentYear = this.pikselLoader.getSelectedYear();
    let html = '';

    PIKSEL_CATEGORIES.forEach((cat) => {
      const catProducts = PIKSEL_PRODUCTS.filter((p) => p.category === cat.id);
      if (catProducts.length === 0) return;

      html += `
        <div class="piksel-group-header">
          <span class="group-icon">${cat.icon}</span>
          <span class="group-title">${cat.name}</span>
        </div>
      `;

      catProducts.forEach((product) => {
        const isSelected = product.id === activeId;
        const legendHtml = this.renderLegend(product);
        const noticeHtml = product.statusNotice
          ? `<div class="piksel-product-notice">${product.statusNotice}</div>`
          : '';

        html += `
          <div class="piksel-product-card ${isSelected ? 'active' : ''}" data-product-id="${product.id}">
            <div class="piksel-card-header">
              <div class="piksel-radio-wrap">
                <input type="radio" name="piksel-product-radio" id="radio-${product.id}" value="${product.id}" ${isSelected ? 'checked' : ''} style="pointer-events: none;" tabindex="-1" />
                <span class="piksel-product-title">${product.name}</span>
              </div>
              <span class="piksel-badge" style="background-color: ${product.color}22; color: ${product.color}; border-color: ${product.color}44;">
                ${product.badge}
              </span>
            </div>
            
            <p class="piksel-product-desc">${product.description}</p>
            ${noticeHtml}
            
            <div class="piksel-what-shows">
              <strong>🔍 Arti Analitis:</strong> ${product.whatItShows}
            </div>

            ${legendHtml}

            <!-- Structured Metadata Provenance -->
            <div class="piksel-provenance-box">
              <table class="piksel-provenance-table">
                <tr><td><strong>Sumber Data:</strong></td><td>BIG Piksel / Open Data Cube</td></tr>
                <tr><td><strong>Sensor Satelit:</strong></td><td>${product.sensor}</td></tr>
                <tr><td><strong>Resolusi Spasial:</strong></td><td>${product.resolution}</td></tr>
                <tr><td><strong>OGC Layer / Style:</strong></td><td><code>${product.layer}</code> (<code>${product.style}</code>)</td></tr>
                ${product.timeEnabled ? `<tr><td><strong>Periode Waktu:</strong></td><td>${currentYear} (Tahunan)</td></tr>` : ''}
              </table>
            </div>
          </div>
        `;
      });
    });

    listContainer.innerHTML = html;
  }

  private bindEvents() {
    if (this.isEventsBound) return;

    const container = document.getElementById('piksel-products-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (target.closest('#btn-clear-piksel-layer')) {
          this.pikselLoader.setActiveProduct(null);
          this.syncUIStates();
          return;
        }

        const card = target.closest('.piksel-product-card') as HTMLElement;
        if (card && card.dataset.productId) {
          const productId = card.dataset.productId;
          const currentActive = this.pikselLoader.getActiveProductId();

          const nextProduct = currentActive === productId ? null : productId;
          this.pikselLoader.setActiveProduct(nextProduct);
          this.syncUIStates();
        }
      });

      container.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'piksel-master-opacity') {
          const val = Number(target.value);
          const label = document.getElementById('piksel-master-opacity-val');
          if (label) label.innerText = `${val}%`;
          this.pikselLoader.setOpacity(val / 100);
        }
      });

      container.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'toggle-piksel-grid') {
          this.pikselLoader.setGridVisible(target.checked);
        } else if (target.id === 'piksel-year-select') {
          this.pikselLoader.setSelectedYear(target.value);
          this.renderProducts();
        }
      });
    }

    this.isEventsBound = true;
  }

  public syncUIStates() {
    const activeId = this.pikselLoader.getActiveProductId();
    const activeProduct = this.pikselLoader.getActiveProduct();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();
    const currentYear = this.pikselLoader.getSelectedYear();

    const cardContainer = document.getElementById('piksel-active-card-container');
    if (cardContainer) {
      if (activeProduct) {
        const yearOptionsHtml = (activeProduct.availableYears || S2_YEARS).map(
          (y) => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
        ).join('');

        cardContainer.innerHTML = `
          <div class="piksel-active-summary-card">
            <div class="piksel-active-header">
              <div class="piksel-active-title-group">
                <span class="active-pulse-indicator"></span>
                <div>
                  <h4 class="active-product-heading">${activeProduct.name}</h4>
                  <span class="active-tag-badge">${activeProduct.badge}</span>
                </div>
              </div>
            </div>

            <div class="piksel-active-meta-grid">
              <div class="meta-field">
                <span class="meta-field-label">📅 Tahun:</span>
                ${activeProduct.timeEnabled ? `
                  <select id="piksel-year-select" class="piksel-select-sm">
                    ${yearOptionsHtml}
                  </select>
                ` : `<span class="meta-field-val">Statik</span>`}
              </div>
              <div class="meta-field">
                <span class="meta-field-label">📐 Resolusi:</span>
                <span class="meta-field-val">${activeProduct.resolution}</span>
              </div>
              <div class="meta-field">
                <span class="meta-field-label">🏢 Penyedia:</span>
                <span class="meta-field-val">BIG Piksel</span>
              </div>
              <div class="meta-field">
                <span class="meta-field-label">🌐 Layanan:</span>
                <span class="meta-field-val">OGC WMS 1.3.0</span>
              </div>
            </div>

            <div class="piksel-active-slider-wrap">
              <div class="slider-header-row">
                <span>Transparansi:</span>
                <strong id="piksel-master-opacity-val">${opacityPct}%</strong>
              </div>
              <input 
                type="range" 
                id="piksel-master-opacity" 
                min="0" 
                max="100" 
                value="${opacityPct}" 
                class="piksel-slider" 
              />
            </div>

            <button id="btn-clear-piksel-layer" class="btn btn-danger-outline full-width" style="margin-top: 10px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M18 6 6 18M6 6l12 12"/></svg>
              ✕ Nonaktifkan Layer
            </button>
          </div>
        `;
      } else {
        cardContainer.innerHTML = `
          <div class="piksel-inactive-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Pilih salah satu produk citra satelit atau indeks di katalog bawah untuk mengaktifkan layer.</span>
          </div>
        `;
      }
    }

    document.querySelectorAll<HTMLElement>('.piksel-product-card').forEach((card) => {
      const pId = card.dataset.productId;
      const isSelected = pId === activeId;
      card.classList.toggle('active', isSelected);

      const radio = card.querySelector<HTMLInputElement>(`#radio-${pId}`);
      if (radio) radio.checked = isSelected;
    });

    const gridToggle = document.getElementById('toggle-piksel-grid') as HTMLInputElement;
    if (gridToggle) gridToggle.checked = isGridOn;
  }
}
