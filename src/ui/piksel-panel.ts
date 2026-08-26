import { PikselLoader, PIKSEL_PRODUCTS, PIKSEL_PRESETS } from '../tools/piksel-loader';

export class PikselPanelUI {
  private pikselLoader: PikselLoader;
  private isEventsBound: boolean = false;

  constructor(pikselLoader: PikselLoader) {
    this.pikselLoader = pikselLoader;
  }

  public init() {
    this.renderPresets();
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

        // Automatically select the recommended product for this zone
        if (preset.recommendedProduct) {
          this.pikselLoader.setActiveProduct(preset.recommendedProduct);
          this.syncUIStates();
        }
      });

      container.appendChild(btn);
    });
  }

  private renderProducts() {
    const container = document.getElementById('piksel-products-container');
    if (!container) return;

    const activeId = this.pikselLoader.getActiveProductId();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();

    let html = `
      <!-- Master Opacity Slider -->
      <div class="piksel-master-control">
        <div class="piksel-control-header">
          <span class="control-title">🎚️ Transparansi Layer Satelit</span>
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
          <span>0% (Basemap Saja)</span>
          <span>50%</span>
          <span>100% (Satelit Penuh)</span>
        </div>
      </div>

      <!-- Orbit Grid Toggle -->
      <div class="piksel-grid-toggle-box">
        <label class="piksel-toggle-label">
          <input type="checkbox" id="toggle-piksel-grid" ${isGridOn ? 'checked' : ''} />
          <span class="toggle-text">
            <strong>📦 Tampilkan Grid Orbit BIG Piksel</strong>
            <small>Garis batas tile akuisisi data satelit (klik tile di peta untuk metadata)</small>
          </span>
        </label>
      </div>

      <div class="piksel-section-subtitle">PILIH PRODUK SATELIT:</div>
      <div class="piksel-products-list">
    `;

    PIKSEL_PRODUCTS.forEach((product) => {
      const isSelected = product.id === activeId;

      let legendHtml = '';
      if (product.legendType === 'thermal') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Sejuk (15°C)</span>
            <div class="legend-gradient thermal"></div>
            <span class="legend-scale-label">Panas (42°C+)</span>
          </div>
        `;
      } else if (product.legendType === 'falsecolor') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Tanah Terbuka</span>
            <div class="legend-gradient falsecolor"></div>
            <span class="legend-scale-label">Hutan Lebat</span>
          </div>
        `;
      } else if (product.legendType === 'radar') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Air/Genangan (Gelap)</span>
            <div class="legend-gradient radar"></div>
            <span class="legend-scale-label">Daratan (Terang)</span>
          </div>
        `;
      } else {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Perairan</span>
            <div class="legend-gradient natural"></div>
            <span class="legend-scale-label">Kanopi Hijau</span>
          </div>
        `;
      }

      html += `
        <div class="piksel-product-card ${isSelected ? 'active' : ''}" data-product-id="${product.id}">
          <div class="piksel-card-header">
            <div class="piksel-radio-wrap">
              <input type="radio" name="piksel-product-radio" id="radio-${product.id}" value="${product.id}" ${isSelected ? 'checked' : ''} />
              <label for="radio-${product.id}" class="piksel-product-title">${product.name}</label>
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
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  private bindEvents() {
    if (this.isEventsBound) return;

    // Delegate product selection clicks
    const container = document.getElementById('piksel-products-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.piksel-product-card') as HTMLElement;
        if (card && card.dataset.productId) {
          const productId = card.dataset.productId;
          const currentActive = this.pikselLoader.getActiveProductId();

          // If clicked already active, turn it off; otherwise activate it
          const nextProduct = currentActive === productId ? null : productId;
          this.pikselLoader.setActiveProduct(nextProduct);
          this.syncUIStates();
        }
      });

      // Opacity Slider
      container.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'piksel-master-opacity') {
          const val = Number(target.value);
          const label = document.getElementById('piksel-master-opacity-val');
          if (label) label.innerText = `${val}%`;
          this.pikselLoader.setOpacity(val / 100);
        }
      });

      // Grid Checkbox Toggle
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

    // Update radio inputs and active card classes
    document.querySelectorAll<HTMLElement>('.piksel-product-card').forEach((card) => {
      const pId = card.dataset.productId;
      const isSelected = pId === activeId;
      card.classList.toggle('active', isSelected);

      const radio = card.querySelector<HTMLInputElement>(`#radio-${pId}`);
      if (radio) radio.checked = isSelected;
    });

    // Update master opacity slider & label
    const slider = document.getElementById('piksel-master-opacity') as HTMLInputElement;
    if (slider) slider.value = String(opacityPct);
    const valLabel = document.getElementById('piksel-master-opacity-val');
    if (valLabel) valLabel.innerText = `${opacityPct}%`;

    // Update grid toggle
    const gridToggle = document.getElementById('toggle-piksel-grid') as HTMLInputElement;
    if (gridToggle) gridToggle.checked = isGridOn;
  }
}
