import { PikselLoader, PikselLoadingState } from '../tools/piksel-loader';
import {
  PIKSEL_PRODUCTS,
  PIKSEL_PRESETS,
  PikselPreset,
  S2_YEARS
} from '../config/piksel';
import { showToast } from './toast';

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
            <span class="swatch-color-box" style="background:${sw.color};"></span>
            <span class="swatch-text">${sw.label}</span>
          </div>
        `).join('');

        if (activeProduct.legend.type === 'continuous' || activeProduct.legend.type === 'natural') {
          legendHtml = `
            <div class="active-legend-block">
              <div class="legend-section-title">Legenda Warna</div>
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
              <div class="legend-section-title">Klasifikasi</div>
              <div class="legend-swatches-grid">
                ${(activeProduct.legend.items || []).map(it => `
                  <div class="swatch-pill">
                    <span class="swatch-color-box" style="background:${it.color};"></span>
                    <span class="swatch-text">${it.label}</span>
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
                <label>Tahun</label>
                <select id="piksel-year-select" class="clean-select">
                  ${yearOptionsHtml}
                </select>
              </div>
            ` : ''}
            <div class="control-field">
              <label>Resolusi</label>
              <div class="static-val">${activeProduct.resolution} &middot; ${activeProduct.sensor.split(' ')[0]} ${activeProduct.sensor.split(' ')[1] || ''}</div>
            </div>
          </div>

          <!-- Dedicated Direct Zoom to Level 6 Button -->
          <button class="btn-zoom-product-action full-width" id="btn-zoom-to-product" title="Perbesar peta ke Zoom Level ${activeProduct.minZoom ?? 6} agar citra satelit muncul">
            <span style="font-size: 14px;">🔍</span>
            <span>Perbesar ke Level ${activeProduct.minZoom ?? 6} (Skala Pulau)</span>
            <span style="font-size: 13px; font-weight: 800;">→</span>
          </button>

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

          <!-- Collapsible Telemetry & Grid Options -->
          <details class="clean-accordion" style="margin-top: 10px;">
            <summary>
              <span>📊 Telemetri Layanan OGC WMS & Grid</span>
              <span class="diag-status-pill ${diagnostics?.status || 'idle'}">${(diagnostics?.status || 'idle').toUpperCase()}</span>
            </summary>
            <div class="accordion-body">
              <div class="diagnostics-content">
                <div class="diag-row"><span>Tile Selesai:</span><strong>${diagnostics?.tilesLoaded || 0} / ${Math.max(diagnostics?.tilesRequested || 1, 1)}</strong></div>
                <div class="diag-row"><span>Tile Gagal:</span><strong class="${(diagnostics?.tilesFailed || 0) > 0 ? 'text-danger' : ''}">${diagnostics?.tilesFailed || 0}</strong></div>
                <div class="diag-row"><span>Latensi Server:</span><strong>${diagnostics?.latencyMs ? (diagnostics.latencyMs / 1000).toFixed(2) + ' detik' : 'Menunggu...'}</strong></div>
                <div class="diag-row"><span>Protokol:</span><strong>OGC WMS 1.3.0 (EPSG:3857)</strong></div>
              </div>
              <div style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                <label class="toggle-checkbox-label">
                  <input type="checkbox" id="toggle-piksel-grid" ${isGridOn ? 'checked' : ''} />
                  <span>Tampilkan Grid Indeks Data Cube (1.631 Tile)</span>
                </label>
              </div>
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
      { id: 'indices', label: '📊 Indeks' },
      { id: 'hazard', label: '🌊 Banjir' },
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
      const isDisabled = prod.isDisabled === true;
      const years = prod.availableYears;
      const yearRange = years && years.length > 1
        ? `${years[years.length - 1]}–${years[0]}`
        : (years?.[0] ?? '');

      if (isDisabled) {
        return `
          <div class="clean-product-card is-disabled" data-id="${prod.id}" title="${prod.statusNotice || 'Produk tidak tersedia'}">
            <div class="card-main-info">
              <div class="card-title-line">
                <span class="card-color-dot" style="background:#475569;"></span>
                <strong class="card-name" style="color:#64748b;">${prod.name}</strong>
              </div>
              <div class="card-tags-line">
                <span class="card-tag" style="color:#475569;">${prod.resolution}</span>
                <span class="card-tag card-tag-unavailable">Tidak Tersedia</span>
              </div>
            </div>
            <div class="btn-disabled-product">Tidak Tersedia</div>
          </div>
        `;
      }

      return `
        <div class="clean-product-card ${isActive ? 'is-active' : ''}" data-id="${prod.id}" title="${prod.description}">
          <div class="card-main-info">
            <div class="card-title-line">
              <span class="card-color-dot" style="background:${prod.color};"></span>
              <strong class="card-name">${prod.name}</strong>
            </div>
            <div class="card-tags-line">
              <span class="card-tag">${prod.resolution}</span>
              <span class="card-tag" title="Perbesar ke Zoom Level ${prod.minZoom ?? 6}+">Z${prod.minZoom ?? 6}+</span>
              ${prod.timeEnabled && yearRange ? `<span class="card-tag multi-year">${yearRange}</span>` : ''}
              <span class="card-badge" style="color:${prod.color};">${prod.badge}</span>
            </div>
          </div>
          <button class="btn-select-product ${isActive ? 'btn-active-state' : ''}" data-id="${prod.id}">
            ${isActive ? '✓ Aktif' : 'Aktifkan'}
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
      <div class="clean-section" style="margin-top: 12px;">
        ${activeControlHtml}
      </div>

      <!-- Catalog Section -->
      <div class="clean-section" style="margin-top: 12px;">
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

      <!-- Collapsible Official Links -->
      <details class="clean-accordion" style="margin-top: 14px;">
        <summary>
          <span>🌐 Dokumentasi & Portal Resmi BIG Piksel</span>
        </summary>
        <div class="accordion-body">
          <p style="margin-bottom: 10px; color: var(--text-muted);">
            Layanan OGC WMS didukung oleh Open Data Cube BIG & Geoscience Australia.
          </p>
          <div class="clean-footer-links" style="display: flex; flex-direction: column; gap: 6px;">
            <a href="https://piksel.big.go.id" target="_blank" rel="noopener noreferrer" class="link-btn full-width">
              Buka Portal Piksel BIG ↗
            </a>
            <a href="https://explorer.piksel.big.go.id" target="_blank" rel="noopener noreferrer" class="link-btn secondary full-width">
              Data Cube Explorer ↗
            </a>
          </div>
        </div>
      </details>
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
          <div class="alert-icon-title">
            <span style="font-size: 16px;">🔍</span>
            <strong>Peta Masih Terlalu Jauh (Zoom ${curZ})</strong>
          </div>
          <p class="alert-desc">
            Citra satelit resolusi 10m membutuhkan jarak pandang minimal <strong>Zoom Level ${minZoom} (Skala Pulau/Provinsi)</strong> agar server Open Data Cube dapat merender data.
          </p>
          <div class="alert-actions-row">
            <button class="btn-alert-action" id="btn-auto-zoom-min">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              Perbesar Otomatis (Level ${minZoom}+)
            </button>
            <button class="btn-alert-secondary" id="btn-jump-bromo-preset">
              📍 Contoh: Bromo
            </button>
          </div>
        </div>
      `;
    }

    if (status === 'requesting' || status === 'loading') {
      return `
        <div class="clean-alert alert-loading">
          <div class="mini-spinner"></div>
          <div>
            <strong>Menghubungkan ke Open Data Cube BIG...</strong>
            <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 2px;">Mengambil ubin citra satelit OGC WMS</span>
          </div>
        </div>
      `;
    }

    if (status === 'partial') {
      return `
        <div class="clean-alert alert-partial">
          <div>
            <strong>✓ Sebagian besar citra berhasil ditampilkan</strong>
            <span style="font-size: 11px; color: #cbd5e1; display: block; margin-top: 2px;">Beberapa ubin luar sedang diproses bertahap oleh server.</span>
          </div>
        </div>
      `;
    }

    if (status === 'error') {
      return `
        <div class="clean-alert alert-error">
          <div class="alert-icon-title">
            <span style="font-size: 16px;">⚠️</span>
            <strong>Layanan OGC WMS Tidak Merespons</strong>
          </div>
          <p class="alert-desc">
            Server Badan Informasi Geospasial (BIG) mengalami galat atau timeout saat memproses produk ini. Anda dapat mencoba memuat ulang atau memilih visualisasi alternatif seperti Sentinel-2 True Color.
          </p>
          <div class="alert-actions-row">
            <button class="btn-alert-retry" id="btn-retry-piksel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              Coba Muat Ulang (Retry)
            </button>
          </div>
        </div>
      `;
    }

    if (status === 'ready') {
      return `
        <div class="clean-alert alert-success">
          <div>
            <strong>✓ Citra Satelit Siap Ditampilkan</strong>
            <span style="font-size: 11px; color: #cbd5e1; display: block; margin-top: 2px;">Resolusi 10m • OGC WMS Open Data Cube</span>
          </div>
        </div>
      `;
    }

    return '';
  }

  private updateActiveCardStatus(state: PikselLoadingState) {
    const slot = document.getElementById('piksel-status-alert-slot');
    if (slot) {
      slot.innerHTML = this.getStatusBadgeHtml(state);
      
      const autoZoomBtn = slot.querySelector('#btn-auto-zoom-min');
      if (autoZoomBtn) {
        autoZoomBtn.addEventListener('click', () => {
          this.pikselLoader.zoomToMinZoom();
        });
      }

      const retryBtn = slot.querySelector('#btn-retry-piksel');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.pikselLoader.retryCurrentProduct();
          showToast('Mencoba memuat ulang ubin citra dari server OGC...', 'info');
        });
      }

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
      const curZ = state.diagnostics?.currentZoom ? `Zoom ${state.diagnostics.currentZoom}` : '';
      hudTitle.innerText = `🔍 Perbesar Peta (Min. Level ${activeProduct.minZoom ?? 6}) untuk Memuat Citra`;
      hudSubtitle.innerText = `${curZ} • Klik di sini atau scroll untuk memperbesar ke skala pulau`;
      
      hud.onclick = () => {
        this.pikselLoader.zoomToMinZoom();
      };
      return;
    } else {
      hud.onclick = null;
    }

    if (state.status === 'requesting' || state.status === 'loading') {
      spinner.style.display = 'block';
      hudTitle.innerText = `Memuat ${activeProduct.name}...`;
      hudSubtitle.innerText = `Open Data Cube BIG • Mengambil ubin citra`;
      return;
    }

    if (state.status === 'error') {
      spinner.style.display = 'none';
      hudTitle.innerText = `⚠️ Gangguan Server OGC WMS`;
      hudSubtitle.innerText = `Server BIG timeout. Klik di panel untuk memuat ulang.`;
      return;
    }

    if (state.status === 'ready' || state.status === 'partial') {
      spinner.style.display = 'none';
      hudTitle.innerText = `${activeProduct.name} Siap`;
      hudSubtitle.innerText = `Citra Satelit Resolusi ${activeProduct.resolution} • OGC WMS`;
      setTimeout(() => {
        if (this.currentLoadingState.status === 'ready' || this.currentLoadingState.status === 'partial') {
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
        if (preset) {
          this.pikselLoader.flyToPreset(preset);
          const prod = PIKSEL_PRODUCTS.find(p => p.id === preset.recommendedProduct);
          showToast(`Menampilkan lokasi ${preset.name} (${prod?.name || 'Citra Satelit'})`, 'info');
        }
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

      // 4. Zoom to product / Auto Zoom to minZoom
      if (target.closest('#btn-zoom-to-product') || target.closest('#btn-auto-zoom-min')) {
        this.pikselLoader.zoomToMinZoom();
        return;
      }

      // 5. Retry Piksel product
      if (target.closest('#btn-retry-piksel')) {
        this.pikselLoader.retryCurrentProduct();
        showToast('Mencoba memuat ulang ubin citra dari server OGC...', 'info');
        return;
      }

      // 6. Jump to Bromo preset from alert
      if (target.closest('#btn-jump-bromo-preset')) {
        const bromo = PIKSEL_PRESETS.find(p => p.id === 'bromo');
        if (bromo) this.pikselLoader.flyToPreset(bromo);
        return;
      }

      // 7. Deactivate layer button
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
