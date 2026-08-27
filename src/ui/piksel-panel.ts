import { PikselLoader, PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../tools/piksel-loader';

export class PikselPanelUI {
  private pikselLoader: PikselLoader;
  private isEventsBound: boolean = false;

  constructor(pikselLoader: PikselLoader) {
    this.pikselLoader = pikselLoader;
  }

  public init() {
    this.renderPresets();
    this.renderControls();
    this.renderProducts();
    this.bindEvents();

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
      <!-- Master Opacity Slider -->
      <div class="piksel-master-control">
        <div class="piksel-control-header">
          <span class="control-title">🎚️ Transparansi Layer Citra</span>
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
            <strong>📦 Tampilkan Grid Tile Akuisisi (BIG Piksel)</strong>
            <small>Garis tile Data Cube nasional (klik tile untuk info scene)</small>
          </span>
        </label>
      </div>

      <div class="piksel-section-subtitle">KATALOG PRODUK EARTH OBSERVATION:</div>
      <div class="piksel-products-list" id="piksel-products-inner-list"></div>
    `;

    container.innerHTML = controlsHtml;
  }

  private renderProducts() {
    const listContainer = document.getElementById('piksel-products-inner-list');
    if (!listContainer) return;

    const activeId = this.pikselLoader.getActiveProductId();
    let html = '';

    PIKSEL_PRODUCTS.forEach((product) => {
      const isSelected = product.id === activeId;

      const legendHtml = `
        <div class="piksel-legend-container">
          <div class="piksel-legend-bar">
            <div class="legend-gradient ${product.legendGradientClass}"></div>
          </div>
          <div class="piksel-legend-labels">
            <span class="legend-scale-label left">${product.legendLeft}</span>
            ${product.legendMiddle ? `<span class="legend-scale-label middle">${product.legendMiddle}</span>` : ''}
            <span class="legend-scale-label right">${product.legendRight}</span>
          </div>
        </div>
      `;

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
          
          <div class="piksel-what-shows">
            <strong>🔍 Arti Visual:</strong> ${product.whatItShows}
          </div>

          ${legendHtml}

          <div class="piksel-product-meta">
            <span><strong>Sensor:</strong> ${product.sensor}</span>
            <span><strong>Resolusi:</strong> ${product.resolution}</span>
            <span><strong>Dataset:</strong> ${product.layerName}</span>
          </div>
        </div>
      `;
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
