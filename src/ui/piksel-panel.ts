import { PikselLoader, PikselLoadingState } from '../tools/piksel-loader';
import { PIKSEL_PRODUCTS, PIKSEL_PRESETS, PIKSEL_CATEGORIES, PikselProduct } from '../config/piksel';

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

    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();

    const controlsHtml = `
      <!-- Loading & Status Banner Container in Sidebar -->
      <div id="piksel-loading-banner-wrap"></div>

      <!-- Master Opacity Slider -->
      <div class="piksel-master-control">
        <div class="piksel-control-header">
          <span class="control-title">🎚️ Transparansi Layer Citra OGC</span>
          <span class="control-val" id="piksel-master-opacity-val">${opacityPct}%</span>
        </div>
        <input 
          type="range" 
          id="piksel-master-opacity" 
          min="0" 
          max="100" 
          value="${opacityPct}" 
          class="piksel-slider" 
        />
        <div class="slider-ticks">
          <span>0% (Basemap)</span>
          <span>50%</span>
          <span>100% (Penuh)</span>
        </div>
      </div>

      <!-- Data Cube Grid Toggle -->
      <div class="piksel-grid-toggle-box">
        <label class="piksel-toggle-label">
          <input type="checkbox" id="toggle-piksel-grid" ${isGridOn ? 'checked' : ''} />
          <span class="toggle-text">
            <strong>📦 Tampilkan Grid Tile Data Cube (BIG Piksel)</strong>
            <small>Garis 1.631 tile Open Data Cube nasional (klik tile untuk metadata)</small>
          </span>
        </label>
      </div>

      <div class="piksel-section-subtitle">KATALOG PRODUK OGC BIG PIKSEL:</div>
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
        titleEl.innerHTML = `🛰️ Memuat Layer WMS: ${state.productName}`;
        subEl.innerHTML = state.isComputeHeavy 
          ? `⚡ Pemrosesan spektral on-the-fly di cloud BIG Piksel...`
          : `Mengunduh tile resolusi tinggi dari server OGC BIG...`;
      } else {
        hud.classList.add('ready');
        titleEl.innerHTML = `✅ Layer Aktif: ${state.productName}`;
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

            <div class="piksel-product-meta">
              <span><strong>Sensor:</strong> ${product.sensor}</span>
              <span><strong>Resolusi:</strong> ${product.resolution}</span>
              <span><strong>OGC Layer:</strong> <code>${product.layer}</code></span>
              <span><strong>Style:</strong> <code>${product.style}</code></span>
              ${product.time ? `<span><strong>Waktu:</strong> ${product.time}</span>` : ''}
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
        }
      });
    }

    this.isEventsBound = true;
  }

  public syncUIStates() {
    const activeId = this.pikselLoader.getActiveProductId();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();

    document.querySelectorAll<HTMLElement>('.piksel-product-card').forEach((card) => {
      const pId = card.dataset.productId;
      const isSelected = pId === activeId;
      card.classList.toggle('active', isSelected);

      const radio = card.querySelector<HTMLInputElement>(`#radio-${pId}`);
      if (radio) radio.checked = isSelected;
    });

    const slider = document.getElementById('piksel-master-opacity') as HTMLInputElement;
    if (slider) slider.value = String(opacityPct);
    const valLabel = document.getElementById('piksel-master-opacity-val');
    if (valLabel) valLabel.innerText = `${opacityPct}%`;

    const gridToggle = document.getElementById('toggle-piksel-grid') as HTMLInputElement;
    if (gridToggle) gridToggle.checked = isGridOn;
  }
}
