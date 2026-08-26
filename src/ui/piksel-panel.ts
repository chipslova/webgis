import { PikselLoader, PIKSEL_PRODUCTS, PIKSEL_PRESETS, PIKSEL_YEARS, PikselHealthStatus } from '../tools/piksel-loader';

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

    // Listen to health status updates
    this.pikselLoader.onHealthChange((status) => {
      this.updateHealthUI(status);
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
    const currentYear = this.pikselLoader.getSelectedYear();
    const serviceType = this.pikselLoader.getServiceType();

    // Render Master Controls Header (Health Pill, Protocol Switch, Year Filter, Opacity, Grid)
    const controlsHtml = `
      <!-- OGC Endpoint Health Status -->
      <div class="piksel-health-card" id="piksel-health-card">
        <div class="piksel-health-left">
          <span class="piksel-status-dot checking" id="piksel-status-dot"></span>
          <div class="piksel-health-text">
            <span class="piksel-health-title" id="piksel-health-title">Memeriksa Endpoint OGC Piksel...</span>
            <span class="piksel-health-subtitle" id="piksel-health-subtitle">ows.staging.piksel.big.go.id</span>
          </div>
        </div>
        <button class="piksel-ping-btn" id="btn-check-piksel-health" title="Periksa Ulang Status Koneksi OGC">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span id="piksel-ping-label">Uji OGC</span>
        </button>
      </div>

      <!-- Time Dimension & Protocol Control -->
      <div class="piksel-meta-bar">
        <div class="piksel-meta-item">
          <label for="piksel-year-select">📅 Tahun Citra (GeoMAD):</label>
          <select id="piksel-year-select" class="piksel-select">
            ${PIKSEL_YEARS.map(
              (yr) => `<option value="${yr}" ${yr === currentYear ? 'selected' : ''}>${yr} ${yr === '2025' ? '(Terbaru)' : ''}</option>`
            ).join('')}
          </select>
        </div>

        <div class="piksel-meta-item">
          <label for="piksel-proto-select">📡 Protokol OGC:</label>
          <select id="piksel-proto-select" class="piksel-select">
            <option value="WMTS" ${serviceType === 'WMTS' ? 'selected' : ''}>WMTS 1.0.0 (Tile)</option>
            <option value="WMS" ${serviceType === 'WMS' ? 'selected' : ''}>WMS 1.3.0 (BBox)</option>
          </select>
        </div>
      </div>

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
            <strong>📦 Tampilkan Grid Orbit BIG Piksel</strong>
            <small>Garis tile akuisisi Data Cube nasional (klik tile untuk detail scene)</small>
          </span>
        </label>
      </div>

      <div class="piksel-section-subtitle">KATALOG PRODUK EARTH OBSERVATION:</div>
      <div id="piksel-products-inner-list" class="piksel-products-list"></div>
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

      let legendHtml = '';
      if (product.legendType === 'nir') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Air/Lahan Buka</span>
            <div class="legend-gradient nir"></div>
            <span class="legend-scale-label">Kanopi Merah Pekat</span>
          </div>
        `;
      } else if (product.legendType === 'ndvi') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Gersang (&lt;0.1)</span>
            <div class="legend-gradient ndvi"></div>
            <span class="legend-scale-label">Hutan Lebat (&gt;0.7)</span>
          </div>
        `;
      } else if (product.legendType === 'ndwi') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Daratan</span>
            <div class="legend-gradient ndwi"></div>
            <span class="legend-scale-label">Badan Air Jernih</span>
          </div>
        `;
      } else if (product.legendType === 'bsi') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Bervegetasi</span>
            <div class="legend-gradient bsi"></div>
            <span class="legend-scale-label">Tanah Terbuka/Tambang</span>
          </div>
        `;
      } else if (product.legendType === 'flood') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Aman</span>
            <div class="legend-gradient flood"></div>
            <span class="legend-scale-label">Bahaya Tinggi (Merah)</span>
          </div>
        `;
      } else if (product.legendType === 'stats') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Rendah (&lt;5)</span>
            <div class="legend-gradient stats"></div>
            <span class="legend-scale-label">Sangat Kaya (&gt;30)</span>
          </div>
        `;
      } else if (product.legendType === 'falsecolor') {
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Stres Rendah</span>
            <div class="legend-gradient falsecolor"></div>
            <span class="legend-scale-label">Klorofil Tinggi</span>
          </div>
        `;
      } else {
        // Natural RGB
        legendHtml = `
          <div class="piksel-legend-bar">
            <span class="legend-scale-label">Perairan</span>
            <div class="legend-gradient natural"></div>
            <span class="legend-scale-label">Vegetasi Hijau Alami</span>
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
            <span><strong>OGC:</strong> ${product.layerName}</span>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
  }

  private updateHealthUI(health: PikselHealthStatus) {
    const dot = document.getElementById('piksel-status-dot');
    const title = document.getElementById('piksel-health-title');
    const subtitle = document.getElementById('piksel-health-subtitle');
    const pingLabel = document.getElementById('piksel-ping-label');

    if (!dot || !title || !subtitle) return;

    dot.className = `piksel-status-dot ${health.status}`;

    if (health.status === 'online') {
      title.innerText = `OGC Piksel: Online (${health.latencyMs}ms)`;
      subtitle.innerText = `Layanan OGC aktif • ${health.details || 'WMTS 1.0.0'}`;
    } else if (health.status === 'degraded') {
      title.innerText = `OGC Piksel: Respons Lambat (${health.latencyMs}ms)`;
      subtitle.innerText = health.details || 'Layanan merespons dengan latensi tinggi';
    } else if (health.status === 'offline') {
      title.innerText = `OGC Piksel: Offline / Tidak Terhubung`;
      subtitle.innerText = health.details || 'Koneksi gagal ke server OGC';
    } else {
      title.innerText = `Memeriksa Endpoint OGC Piksel...`;
      subtitle.innerText = 'Menguji konektivitas WMTS & WMS';
    }

    if (pingLabel) {
      pingLabel.innerText = health.status === 'checking' ? 'Menguji...' : 'Uji OGC';
    }
  }

  private bindEvents() {
    if (this.isEventsBound) return;

    const container = document.getElementById('piksel-products-container');
    if (container) {
      // Delegate product card clicks
      container.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.piksel-product-card') as HTMLElement;
        if (card && card.dataset.productId) {
          const productId = card.dataset.productId;
          const currentActive = this.pikselLoader.getActiveProductId();

          // Toggle off if already active, otherwise activate selected
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

      // Year / Time Dimension Change
      container.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        if (target.id === 'piksel-year-select') {
          this.pikselLoader.setSelectedYear(target.value);
        } else if (target.id === 'piksel-proto-select') {
          this.pikselLoader.setServiceType(target.value as 'WMTS' | 'WMS');
        } else if (target.id === 'toggle-piksel-grid') {
          this.pikselLoader.setGridVisible((target as HTMLInputElement).checked);
        }
      });

      // Health Ping Button
      container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('#btn-check-piksel-health');
        if (btn) {
          e.stopPropagation();
          this.pikselLoader.checkEndpointHealth();
        }
      });
    }

    this.isEventsBound = true;
  }

  public syncUIStates() {
    const activeId = this.pikselLoader.getActiveProductId();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();
    const currentYear = this.pikselLoader.getSelectedYear();
    const serviceType = this.pikselLoader.getServiceType();

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

    // Update year select
    const yearSelect = document.getElementById('piksel-year-select') as HTMLSelectElement;
    if (yearSelect) yearSelect.value = currentYear;

    // Update proto select
    const protoSelect = document.getElementById('piksel-proto-select') as HTMLSelectElement;
    if (protoSelect) protoSelect.value = serviceType;
  }
}

