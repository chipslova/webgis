import { PikselLoader, PikselLoadingState } from '../tools/piksel-loader';
import {
  PIKSEL_PRODUCTS,
  PIKSEL_PRESETS,
  PikselPreset,
  S2_YEARS
} from '../config/piksel';

export class PikselPanelUI {
  private pikselLoader: PikselLoader;
  private currentLoadingState: PikselLoadingState = {
    status: 'idle',
    isLoading: false,
    productId: null
  };
  private selectedCategory: string = 'all';
  private isEventsBound: boolean = false;

  constructor(pikselLoader: PikselLoader) {
    this.pikselLoader = pikselLoader;
    this.init();
  }

  public init() {
    this.render();
    this.bindEvents();

    this.pikselLoader.onLayersChange(() => {
      this.render();
    });

    this.pikselLoader.onLoadingStateChange((state) => {
      this.currentLoadingState = state;
      this.updateLoadingHUD(state);
      this.updateActiveCardStatus(state);
    });
  }

  public render() {
    const container = document.getElementById('panel-piksel');
    if (!container) return;

    const activeProduct = this.pikselLoader.getActiveProduct();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();
    const currentYear = this.pikselLoader.getSelectedYear();
    const diagnostics = this.pikselLoader.getDiagnostics();

    // 1. Presets HTML
    const presetsHtml = PIKSEL_PRESETS.map((preset: PikselPreset) => `
      <button class="piksel-preset-chip" data-id="${preset.id}" title="${preset.description}">
        <span class="preset-chip-title">${preset.name}</span>
        <span class="preset-chip-sub">${preset.locationName}</span>
      </button>
    `).join('');

    // 2. Active Layer Control Box (Prominent & Clear)
    let activeControlHtml = '';
    if (activeProduct) {
      const yearOptionsHtml = (activeProduct.availableYears || S2_YEARS).map(
        (y) => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
      ).join('');

      let legendHtml = '';
      if (activeProduct.legend) {
        const swatchesHtml = (activeProduct.legend.swatches || []).map(sw => `
          <div class="swatch-pill">
            <span class="swatch-color-box" style="background:${sw.color}; box-shadow: 0 0 6px ${sw.color}88;"></span>
            <span class="swatch-text"><strong>${sw.icon ? sw.icon + ' ' : ''}</strong>${sw.label}</span>
          </div>
        `).join('');

        if (activeProduct.legend.type === 'continuous' || activeProduct.legend.type === 'natural') {
          legendHtml = `
            <div class="active-legend-block">
              <div class="legend-section-title">🎨 Panduan Interpretasi Warna Satelit</div>
              <div class="active-legend-bar legend-gradient ${activeProduct.legend.gradientClass}"></div>
              <div class="active-legend-labels">
                <span>${activeProduct.legend.leftLabel}</span>
                ${activeProduct.legend.middleLabel ? `<span>${activeProduct.legend.middleLabel}</span>` : ''}
                <span>${activeProduct.legend.rightLabel}</span>
              </div>
              ${swatchesHtml ? `
                <div class="legend-swatches-grid">
                  ${swatchesHtml}
                </div>
              ` : ''}
            </div>
          `;
        } else if (activeProduct.legend.type === 'categorical') {
          legendHtml = `
            <div class="active-legend-block">
              <div class="legend-section-title">🎨 Klasifikasi Bahaya Spasial</div>
              <div class="legend-swatches-grid">
                ${(activeProduct.legend.items || []).map(it => `
                  <div class="swatch-pill">
                    <span class="swatch-color-box" style="background:${it.color}; box-shadow: 0 0 6px ${it.color}88;"></span>
                    <span class="swatch-text"><strong>${it.icon ? it.icon + ' ' : ''}</strong>${it.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      activeControlHtml = `
        <div class="piksel-active-box">
          <div class="active-box-header">
            <div class="active-box-title-wrap">
              <span class="active-live-dot ${this.currentLoadingState.status}"></span>
              <div>
                <h4 class="active-box-title">${activeProduct.name}</h4>
                <span class="active-box-badge" style="border-color:${activeProduct.color}66; color:${activeProduct.color};">${activeProduct.badge}</span>
              </div>
            </div>
            <button id="btn-clear-piksel-layer" class="btn-deactivate-chip" title="Nonaktifkan layer ini">
              ✕ Lepas Layer
            </button>
          </div>

          <!-- Status Indicator Alert -->
          <div id="piksel-status-alert-slot" class="status-alert-slot">
            ${this.getStatusBadgeHtml(this.currentLoadingState)}
          </div>

          <!-- Controls: Year & Opacity -->
          <div class="active-controls-grid">
            ${activeProduct.timeEnabled ? `
              <div class="control-field">
                <label>📅 Tahun Citra</label>
                <select id="piksel-year-select" class="clean-select">
                  ${yearOptionsHtml}
                </select>
              </div>
            ` : `
              <div class="control-field">
                <label>📐 Resolusi</label>
                <div class="static-val">${activeProduct.resolution}</div>
              </div>
            `}
            <div class="control-field">
              <label>🔍 Jarak Pandang (Zoom)</label>
              <div class="static-val">Zoom Level ${activeProduct.minZoom ?? 6}+ (Skala Pulau/Provinsi)</div>
            </div>
          </div>

          <!-- Opacity Slider -->
          <div class="active-slider-field">
            <div class="slider-label-row">
              <span>Transparansi Layer</span>
              <strong id="piksel-opacity-text">${opacityPct}%</strong>
            </div>
            <input type="range" id="piksel-master-opacity" min="0" max="100" value="${opacityPct}" class="clean-range-slider" />
          </div>

          <!-- Active Product Legend & Swatches -->
          ${legendHtml}

          <!-- Collapsible Diagnostics -->
          <details class="diagnostics-details" style="margin-top: 10px;">
            <summary class="diagnostics-summary">
              <span>📊 Telemetri Layanan OGC WMS</span>
              <span class="diag-status-pill ${diagnostics?.status || 'idle'}">${(diagnostics?.status || 'idle').toUpperCase()}</span>
            </summary>
            <div class="diagnostics-content">
              <div class="diag-row"><span>Tile Selesai:</span><strong>${diagnostics?.tilesLoaded || 0} / ${Math.max(diagnostics?.tilesRequested || 1, 1)}</strong></div>
              <div class="diag-row"><span>Tile Gagal:</span><strong class="${(diagnostics?.tilesFailed || 0) > 0 ? 'text-danger' : ''}">${diagnostics?.tilesFailed || 0}</strong></div>
              <div class="diag-row"><span>Latensi Server:</span><strong>${diagnostics?.latencyMs ? (diagnostics.latencyMs / 1000).toFixed(2) + ' detik' : 'Menunggu...'}</strong></div>
              <div class="diag-row"><span>Protokol:</span><strong>OGC WMS 1.3.0</strong></div>
            </div>
          </details>
        </div>
      `;
    } else {
      activeControlHtml = `
        <div class="piksel-empty-prompt">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
          <div>
            <strong>Belum ada layer citra yang aktif</strong>
            <p>Pilih salah satu produk di katalog bawah untuk menampilkan citra di atas peta.</p>
          </div>
        </div>
      `;
    }

    // 3. Filtered Products Catalog
    const categories = [
      { id: 'all', label: 'Semua' },
      { id: 'geomad', label: '🌈 Citra & Warna' },
      { id: 'indices', label: '📊 Indeks (NDVI/Air)' },
      { id: 'hazard', label: '🌊 Bahaya Banjir' },
      { id: 'landsat', label: '🛰️ Landsat 9' }
    ];

    const categoryChipsHtml = categories.map(c => `
      <button class="cat-filter-btn ${this.selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        ${c.label}
      </button>
    `).join('');

    const filteredProducts = this.selectedCategory === 'all' 
      ? PIKSEL_PRODUCTS 
      : PIKSEL_PRODUCTS.filter(p => p.category === this.selectedCategory);

    const productCardsHtml = filteredProducts.map(prod => {
      const isActive = activeProduct?.id === prod.id;
      const swatchesPreviewHtml = (prod.legend?.swatches || []).map(sw => `
        <span class="card-swatch-chip" title="${sw.label}">
          <span class="card-swatch-dot" style="background:${sw.color};"></span>
          <span class="card-swatch-label">${sw.label}</span>
        </span>
      `).join('');

      return `
        <div class="clean-product-card ${isActive ? 'is-active' : ''}" data-id="${prod.id}">
          <div class="card-main-info">
            <div class="card-title-line">
              <span class="card-color-dot" style="background:${prod.color};"></span>
              <strong class="card-name">${prod.name}</strong>
            </div>
            <p class="card-description">${prod.description}</p>
            
            ${swatchesPreviewHtml ? `
              <div class="card-swatches-preview">
                ${swatchesPreviewHtml}
              </div>
            ` : ''}

            <div class="card-tags-line">
              <span class="card-tag">${prod.resolution}</span>
              <span class="card-tag" title="Perlu perbesar peta minimal ke Zoom Level ${prod.minZoom ?? 6} (skala pulau/provinsi) agar citra satelit muncul">Zoom Min. Level ${prod.minZoom ?? 6} (Skala Pulau)</span>
              ${prod.timeEnabled ? `<span class="card-tag multi-year">2019–2025</span>` : ''}
              <span class="card-badge" style="color:${prod.color};">${prod.badge}</span>
            </div>
          </div>
          <button class="btn-select-product ${isActive ? 'btn-active-state' : ''}" data-id="${prod.id}">
            ${isActive ? '✓ Aktif' : 'Pilih Layer'}
          </button>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="panel-header">
        <h2>🛰️ Piksel Earth Observation</h2>
        <p>Layanan OGC WMS resmi Badan Informasi Geospasial (BIG) berbasis Open Data Cube.</p>
      </div>

      <!-- Quick Preset Navigation -->
      <div class="clean-section">
        <div class="clean-section-header">
          <span>Kawasan Pantauan Cepat</span>
        </div>
        <div id="piksel-presets-container" class="presets-chip-grid">
          ${presetsHtml}
        </div>
      </div>

      <!-- Active Layer Box -->
      <div class="clean-section" style="margin-top: 14px;">
        ${activeControlHtml}
      </div>

      <!-- Data Cube Grid Toggle -->
      <div class="grid-toggle-bar">
        <label class="toggle-checkbox-label">
          <input type="checkbox" id="toggle-piksel-grid" ${isGridOn ? 'checked' : ''} />
          <span>Tampilkan Grid Indeks Data Cube 10m (1.631 Tile)</span>
        </label>
      </div>

      <!-- Catalog Section -->
      <div class="clean-section" style="margin-top: 14px;">
        <div class="clean-section-header">
          <span>Katalog Produk Citra Satelit</span>
          <span class="count-tag">${filteredProducts.length} Produk</span>
        </div>

        <!-- Category Filter Tabs -->
        <div class="cat-filter-tabs">
          ${categoryChipsHtml}
        </div>

        <!-- Product Cards Grid -->
        <div class="clean-products-container">
          ${productCardsHtml}
        </div>
      </div>

      <!-- Official Links Footer -->
      <div class="clean-footer-links">
        <a href="https://piksel.big.go.id" target="_blank" rel="noopener noreferrer" class="link-btn">
          Portal Resmi Piksel BIG ↗
        </a>
        <a href="https://explorer.piksel.big.go.id" target="_blank" rel="noopener noreferrer" class="link-btn secondary">
          Data Cube Explorer ↗
        </a>
      </div>
    `;
  }

  private getStatusBadgeHtml(state: PikselLoadingState): string {
    const status = state.status;
    const activeProduct = this.pikselLoader.getActiveProduct();
    const minZoom = activeProduct?.minZoom ?? 6;

    if (status === 'zoom_too_low') {
      const curZ = state.diagnostics?.currentZoom ? `Level ${state.diagnostics.currentZoom}` : 'Terlalu Jauh';
      return `
        <div class="clean-alert alert-warning">
          <div>
            <strong>Peta Masih Terlalu Jauh (Zoom ${curZ})</strong>
            <span>Citra satelit 10m membutuhkan jarak pandang lebih dekat. Silakan <strong>perbesar peta (scroll ke depan) hingga minimal Zoom Level ${minZoom}</strong> (tampilan per pulau/provinsi) agar citra dapat dimuat.</span>
          </div>
          <button class="btn-quick-zoom" id="btn-jump-bromo-preset">🔍 Contoh Cepat: Bromo (Zoom Level 11)</button>
        </div>
      `;
    }

    if (status === 'requesting' || status === 'loading') {
      return `
        <div class="clean-alert alert-loading">
          <div class="mini-spinner"></div>
          <div>
            <strong>Sedang memproses raster di server BIG...</strong>
            <span>Tile: ${state.diagnostics?.tilesLoaded || 0}/${Math.max(state.diagnostics?.tilesRequested || 1, 1)}</span>
          </div>
        </div>
      `;
    }

    if (status === 'partial') {
      return `
        <div class="clean-alert alert-partial">
          <div>
            <strong>Sebagian tile berhasil dimuat</strong>
            <span>${state.diagnostics?.tilesLoaded || 0}/${state.diagnostics?.tilesRequested || 1} tile selesai.</span>
          </div>
        </div>
      `;
    }

    if (status === 'error') {
      return `
        <div class="clean-alert alert-error">
          <strong>Server Timeout (HTTP 500)</strong>
          <span>Coba perbesar ke kawasan pantauan atau pilih tahun lain.</span>
        </div>
      `;
    }

    if (status === 'ready') {
      return `
        <div class="clean-alert alert-success">
          <strong>✓ Layer siap ditampilkan</strong>
          <span>Tile 10m berhasil dimuat (${state.diagnostics?.latencyMs || 0}ms).</span>
        </div>
      `;
    }

    return '';
  }

  private updateActiveCardStatus(state: PikselLoadingState) {
    const slot = document.getElementById('piksel-status-alert-slot');
    if (slot) {
      slot.innerHTML = this.getStatusBadgeHtml(state);
      const jumpBtn = slot.querySelector('#btn-jump-bromo-preset');
      if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
          const bromo = PIKSEL_PRESETS.find(p => p.id === 'bromo');
          if (bromo) this.pikselLoader.flyToPreset(bromo);
        });
      }
    }
  }

  private updateLoadingHUD(state: PikselLoadingState) {
    const hud = document.getElementById('piksel-map-hud');
    const hudTitle = document.getElementById('hud-title');
    const hudSubtitle = document.getElementById('hud-subtitle');
    const spinner = document.getElementById('hud-spinner');

    if (!hud || !hudTitle || !hudSubtitle || !spinner) return;

    const activeProduct = this.pikselLoader.getActiveProduct();

    if (state.status === 'idle' || !activeProduct) {
      hud.style.display = 'none';
      return;
    }

    hud.style.display = 'flex';
    hud.className = `piksel-map-hud ${state.status}`;

    if (state.status === 'zoom_too_low') {
      spinner.style.display = 'none';
      const curZ = state.diagnostics?.currentZoom ? `Level ${state.diagnostics.currentZoom}` : '';
      hudTitle.innerText = `🔍 Perbesar Peta (Minimal Zoom Level ${activeProduct.minZoom ?? 6}) untuk Memuat Citra`;
      hudSubtitle.innerText = `Zoom saat ini: ${curZ} • Dekatkan peta ke wilayah pulau/kota yang ingin diamati`;
      return;
    }

    if (state.status === 'requesting' || state.status === 'loading') {
      spinner.style.display = 'block';
      hudTitle.innerText = `Memuat ${activeProduct.name}...`;
      hudSubtitle.innerText = `Open Data Cube • ${state.diagnostics?.tilesLoaded || 0}/${Math.max(state.diagnostics?.tilesRequested || 1, 1)} tile`;
      return;
    }

    if (state.status === 'ready') {
      spinner.style.display = 'none';
      hudTitle.innerText = `${activeProduct.name} Siap`;
      hudSubtitle.innerText = `Citra 10m Sentinel-2 GeoMAD (${state.diagnostics?.latencyMs || 0}ms)`;
      setTimeout(() => {
        if (this.currentLoadingState.status === 'ready') {
          hud.style.display = 'none';
        }
      }, 3500);
      return;
    }
  }

  private bindEvents() {
    if (this.isEventsBound) return;

    const container = document.getElementById('panel-piksel');
    if (!container) return;

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // 1. Preset chip click
      const presetBtn = target.closest('.piksel-preset-chip') as HTMLElement;
      if (presetBtn && presetBtn.dataset.id) {
        const preset = PIKSEL_PRESETS.find(p => p.id === presetBtn.dataset.id);
        if (preset) this.pikselLoader.flyToPreset(preset);
        return;
      }

      // 2. Category filter click
      const catBtn = target.closest('.cat-filter-btn') as HTMLElement;
      if (catBtn && catBtn.dataset.cat) {
        this.selectedCategory = catBtn.dataset.cat;
        this.render();
        return;
      }

      // 3. Product select click
      const selectBtn = target.closest('.btn-select-product') as HTMLElement;
      const productCard = target.closest('.clean-product-card') as HTMLElement;
      const clickedId = selectBtn?.dataset.id || productCard?.dataset.id;

      if (clickedId && !target.closest('select') && !target.closest('input')) {
        const current = this.pikselLoader.getActiveProduct();
        if (current?.id === clickedId) {
          this.pikselLoader.setActiveProduct(null);
        } else {
          this.pikselLoader.setActiveProduct(clickedId);
        }
        this.render();
        return;
      }

      // 4. Deactivate layer button
      if (target.closest('#btn-clear-piksel-layer')) {
        this.pikselLoader.setActiveProduct(null);
        this.render();
        return;
      }
    });

    container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === 'piksel-master-opacity') {
        const val = Number(target.value);
        const text = document.getElementById('piksel-opacity-text');
        if (text) text.innerText = `${val}%`;
        this.pikselLoader.setOpacity(val / 100);
      }
    });

    container.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === 'piksel-year-select') {
        this.pikselLoader.setSelectedYear(target.value);
      } else if (target.id === 'toggle-piksel-grid') {
        this.pikselLoader.setGridVisible(target.checked);
      }
    });

    this.isEventsBound = true;
  }

  public syncUIStates() {
    this.render();
  }
}
