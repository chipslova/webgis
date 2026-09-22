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
    const filters = this.pikselLoader.getFilters();
    const brightnessPct = Math.round(filters.brightness * 100);
    const contrastPct = Math.round(filters.contrast * 100);
    const saturationPct = Math.round(filters.saturation * 100);
    const isGridOn = this.pikselLoader.isGridVisible();
    const currentYear = this.pikselLoader.getSelectedYear();
    const diagnostics = this.pikselLoader.getDiagnostics();

    // 1. Presets HTML
    const presetsHtml = PIKSEL_PRESETS.map((preset: PikselPreset) => `
      <button class="piksel-preset-chip" data-id="${preset.id}" aria-label="Explore ${preset.name}, ${preset.locationName}" title="${preset.description}">
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
        <div class="piksel-active-box" role="region" aria-label="Kontrol untuk ${activeProduct.name}">
          <div class="active-box-header">
            <div class="active-box-title-wrap">
              <span class="active-live-dot ${this.currentLoadingState.status}" aria-hidden="true"></span>
              <div>
                <h4 class="active-box-title">${activeProduct.name}</h4>
                <span class="active-box-badge" style="border-color:${activeProduct.color}66; color:${activeProduct.color};">${activeProduct.badge}</span>
              </div>
            </div>
            <button id="btn-clear-piksel-layer" class="btn-deactivate-chip" aria-label="Hapus lapisan ${activeProduct.name}" title="Nonaktifkan lapisan aktif ini">
              ✕ Nonaktifkan Lapisan
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
                <label for="piksel-year-select">Tahun</label>
                <select id="piksel-year-select" class="clean-select" aria-label="Pilih tahun akuisisi satelit untuk ${activeProduct.name}">
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
          <button class="btn-zoom-product-action full-width" id="btn-zoom-to-product" aria-label="Zoom peta ke Level ${activeProduct.minZoom ?? 8} untuk citra satelit" title="Zoom peta ke Level ${activeProduct.minZoom ?? 8}">
            <span style="font-size: 14px;" aria-hidden="true">🔍</span>
            <span>Zoom ke Level ${activeProduct.minZoom ?? 8} (Skala Regional)</span>
            <span style="font-size: 13px; font-weight: 800;" aria-hidden="true">→</span>
          </button>

          <!-- Opacity Slider -->
          <div class="active-slider-field">
            <div class="slider-label-row">
              <label for="piksel-master-opacity">Opasitas Lapisan</label>
              <strong id="piksel-opacity-text">${opacityPct}%</strong>
            </div>
            <input type="range" id="piksel-master-opacity" min="0" max="100" value="${opacityPct}" class="clean-range-slider" aria-label="Opasitas untuk lapisan ${activeProduct.name}" />
          </div>

          <!-- Satellite Image Adjustments (Spectral & Visual Filters) -->
          <details class="clean-accordion" style="margin-top: 8px;">
            <summary>
              <span>🎨 Penyesuaian Visual &amp; Filter Spektral</span>
              <span style="font-size: 10px; color: var(--accent-cyan); font-weight: 600;">FILTER</span>
            </summary>
            <div class="accordion-body" style="display: flex; flex-direction: column; gap: 8px; padding-top: 8px;">
              <!-- Brightness -->
              <div class="active-slider-field" style="margin-bottom: 0;">
                <div class="slider-label-row">
                  <label for="piksel-filter-brightness" style="font-size: 11px;">Kecerahan</label>
                  <strong id="piksel-brightness-val" style="font-size: 11px;">${brightnessPct > 0 ? '+' : ''}${brightnessPct}%</strong>
                </div>
                <input type="range" id="piksel-filter-brightness" min="-100" max="100" step="5" value="${brightnessPct}" class="clean-range-slider" aria-label="Penyesuaian Kecerahan Citra Satelit" />
              </div>

              <!-- Contrast -->
              <div class="active-slider-field" style="margin-bottom: 0;">
                <div class="slider-label-row">
                  <label for="piksel-filter-contrast" style="font-size: 11px;">Kontras</label>
                  <strong id="piksel-contrast-val" style="font-size: 11px;">${contrastPct > 0 ? '+' : ''}${contrastPct}%</strong>
                </div>
                <input type="range" id="piksel-filter-contrast" min="-100" max="100" step="5" value="${contrastPct}" class="clean-range-slider" aria-label="Penyesuaian Kontras Citra Satelit" />
              </div>

              <!-- Saturation -->
              <div class="active-slider-field" style="margin-bottom: 0;">
                <div class="slider-label-row">
                  <label for="piksel-filter-saturation" style="font-size: 11px;">Saturasi Warna</label>
                  <strong id="piksel-saturation-val" style="font-size: 11px;">${saturationPct > 0 ? '+' : ''}${saturationPct}%</strong>
                </div>
                <input type="range" id="piksel-filter-saturation" min="-100" max="100" step="5" value="${saturationPct}" class="clean-range-slider" aria-label="Penyesuaian Saturasi Warna Citra Satelit" />
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 2px;">
                <button type="button" id="btn-reset-piksel-filters" class="btn-micro" style="padding: 3px 8px;" title="Kembalikan filter ke nilai standar">
                  Reset Penyesuaian
                </button>
              </div>
            </div>
          </details>

          <!-- Active Product Legend & Swatches -->
          ${legendHtml}

          <!-- Collapsible Gated Telemetry & Advanced Server Options -->
          <details class="clean-accordion" style="margin-top: 10px;">
            <summary>
              <span>⚙️ Pengaturan Lanjutan &amp; Status Server</span>
              <span class="diag-status-pill ${diagnostics?.status || 'idle'}">${(diagnostics?.status || 'idle').toUpperCase()}</span>
            </summary>
            <div class="accordion-body">
              <div class="diagnostics-content">
                <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">Metrik koneksi OGC WMS (diagnostik):</p>
                <div class="diag-row"><span>Permintaan Raster:</span><strong>${diagnostics?.tilesLoaded || 0} selesai</strong></div>
                <div class="diag-row"><span>Permintaan Gagal:</span><strong class="${(diagnostics?.tilesFailed || 0) > 0 ? 'text-danger' : ''}">${diagnostics?.tilesFailed || 0}</strong></div>
                <div class="diag-row"><span>Latensi Server:</span><strong>${diagnostics?.latencyMs ? (diagnostics.latencyMs / 1000).toFixed(2) + ' detik' : 'Menunggu...'}</strong></div>
                <div class="diag-row"><span>Protokol:</span><strong>OGC WMS 1.3.0 (EPSG:3857)</strong></div>
              </div>
              <div style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                <label class="toggle-checkbox-label">
                  <input type="checkbox" id="toggle-piksel-grid" ${isGridOn ? 'checked' : ''} aria-label="Tampilkan Batas Kisi Ubin Open Data Cube (1.631 Ubin)" />
                  <span>Tampilkan Batas Kisi Ubin ODC (1.631 Ubin)</span>
                </label>
              </div>
            </div>
          </details>
        </div>
      `;
    } else {
      activeControlHtml = `
        <div class="piksel-empty-prompt">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
          <div>
            <strong>Belum ada lapisan satelit aktif</strong>
            <p>Pilih produk dari katalog di bawah untuk memuat citra satelit pada peta.</p>
          </div>
        </div>
      `;
    }

    // 3. Filtered Products Catalog
    const categories = [
      { id: 'all', label: 'Semua' },
      { id: 'geomad', label: 'Sentinel-2 GeoMAD' },
      { id: 'indices', label: 'Indeks Spektral' },
      { id: 'quality', label: 'Kualitas & Densitas' },
      { id: 'hazard', label: 'Bahaya Banjir' },
      { id: 'landsat', label: 'Landsat 9' }
    ];

    const categoryChipsHtml = categories.map(c => `
      <button class="cat-filter-btn ${this.selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}" role="tab" aria-selected="${this.selectedCategory === c.id}" aria-label="Filter kategori ${c.label}">
        ${c.label}
      </button>
    `).join('');

    const filteredProducts = this.selectedCategory === 'all' 
      ? PIKSEL_PRODUCTS 
      : PIKSEL_PRODUCTS.filter(p => p.category === this.selectedCategory);

    const availableProducts = filteredProducts.filter(p => !p.isDisabled);
    const unavailableProducts = filteredProducts.filter(p => p.isDisabled === true);

    const productCardsHtml = availableProducts.map(prod => {
      const isActive = activeProduct?.id === prod.id;
      const years = prod.availableYears;
      const yearRange = years && years.length > 1
        ? `${years[years.length - 1]}–${years[0]}`
        : (years?.[0] ?? '');

      return `
        <div class="clean-product-card ${isActive ? 'is-active' : ''}" data-id="${prod.id}">
          <div class="card-main-info">
            <div class="card-title-line">
              <span class="card-color-dot" style="background:${prod.color};" aria-hidden="true"></span>
              <strong class="card-name">${prod.name}</strong>
            </div>
            <p class="card-brief-desc" style="font-size: 11.5px; color: var(--text-muted); margin: 4px 0 6px 0; line-height: 1.35;">
              ${prod.whatItShows || prod.description}
            </p>
            <div class="card-tags-line">
              <span class="card-tag">${prod.resolution}</span>
              <span class="card-tag" title="Level Zoom Minimum Z${prod.minZoom ?? 8}+">Z${prod.minZoom ?? 8}+</span>
              ${prod.timeEnabled && yearRange ? `<span class="card-tag multi-year">${yearRange}</span>` : ''}
              <span class="card-badge" style="color:${prod.color};">${prod.badge}</span>
            </div>
            <details class="card-about-accordion" data-about="${prod.id}">
              <summary class="card-about-summary">Spesifikasi Teknis</summary>
              <div class="card-about-body">
                <div style="display:grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 10.5px; margin-bottom: 6px;">
                  <span style="color:#64748b;">Protokol:</span><span style="color:#cbd5e1; font-family:monospace;">OGC WMS 1.3.0</span>
                  <span style="color:#64748b;">Layer WMS:</span><span style="color:#cbd5e1; font-family:monospace;">${prod.layer}</span>
                  <span style="color:#64748b;">Style:</span><span style="color:#cbd5e1; font-family:monospace;">${prod.style}</span>
                  <span style="color:#64748b;">Sensor:</span><span style="color:#cbd5e1;">${prod.sensor}</span>
                </div>
                ${prod.attribution ? `<span class="card-about-attr">${prod.attribution}</span>` : ''}
              </div>
            </details>
          </div>
          <button class="btn-select-product ${isActive ? 'btn-active-state' : ''}" data-id="${prod.id}" aria-label="${isActive ? 'Lapisan ' + prod.name + ' sedang aktif' : 'Tampilkan ' + prod.name + ' di peta'}">
            ${isActive ? '✓ Aktif' : 'Tampilkan di Peta'}
          </button>
        </div>
      `;
    }).join('');

    const unavailableSectionHtml = unavailableProducts.length > 0 ? `
      <details class="clean-accordion" style="margin-top: 12px; border: 1px dashed rgba(100, 116, 139, 0.4); background: rgba(15, 23, 42, 0.4);">
        <summary style="font-size: 11.5px; color: var(--text-muted);">
          <span>⚠️ Eksperimental / Pemeliharaan Server (${unavailableProducts.length})</span>
        </summary>
        <div class="accordion-body">
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
            Produk berikut saat ini sedang dalam pemeliharaan server hulu:
          </p>
          ${unavailableProducts.map(prod => `
            <div class="clean-product-card is-disabled" data-id="${prod.id}" title="${prod.statusNotice || 'Produk tidak tersedia'}" aria-disabled="true" style="margin-bottom: 6px;">
              <div class="card-main-info">
                <div class="card-title-line">
                  <span class="card-color-dot" style="background:#475569;" aria-hidden="true"></span>
                  <strong class="card-name" style="color:#64748b;">${prod.name}</strong>
                </div>
                <p class="card-brief-desc" style="font-size: 11px; color: #64748b; margin: 3px 0;">
                  ${prod.statusNotice || 'Layanan server hulu saat ini sedang tidak tersedia.'}
                </p>
                <div class="card-tags-line">
                  <span class="card-tag" style="color:#475569;">${prod.resolution}</span>
                  <span class="card-tag card-tag-unavailable">Tidak Tersedia</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </details>
    ` : '';

    container.innerHTML = `
      <div class="panel-header">
        <h2>Observasi Bumi BIG Piksel</h2>
        <p>Data BIG Piksel · OGC WMS — Endpoint staging Open Data Cube untuk eksplorasi citra satelit.</p>
      </div>

      <!-- Staging WMS Notice -->
      <div class="clean-alert alert-info" style="margin-bottom: 10px;">
        <div class="alert-icon-title">
          <span style="font-size: 14px;">⚙️</span>
          <strong>Endpoint WMS Staging BIG</strong>
        </div>
        <p class="alert-desc" style="margin: 4px 0 0 0;">
          Citra satelit menggunakan endpoint <em>staging</em> BIG Piksel. Jika ubin tidak muncul, server mungkin sedang memperbarui data. Endpoint produksi: <code style="font-size: 10px; color: var(--accent-cyan);">piksel.big.go.id</code>
        </p>
      </div>

      <!-- Quick Preset Navigation -->
      <div class="clean-section">
        <div class="clean-section-header">
          <span>Preset Pemantauan Prioritas</span>
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
          <span>Katalog Produk Satelit</span>
          <span class="count-tag">${availableProducts.length} Tersedia</span>
        </div>

        <!-- Category Filter Tabs -->
        <div class="cat-filter-tabs">
          ${categoryChipsHtml}
        </div>

        <!-- Product Cards Grid -->
        <div class="clean-products-container">
          ${productCardsHtml}
        </div>

        <!-- Unavailable / Experimental Products Accordion -->
        ${unavailableSectionHtml}
      </div>

      <!-- Collapsible Official Links -->
      <details class="clean-accordion" style="margin-top: 14px;">
        <summary>
          <span>Portal Resmi BIG Piksel &amp; Dokumentasi</span>
        </summary>
        <div class="accordion-body">
          <p style="margin-bottom: 10px; color: var(--text-muted); font-size: 11.5px;">
            Layanan OGC Web Map Service didukung oleh Open Data Cube BIG &amp; Geoscience Australia.
          </p>
          <div class="clean-footer-links" style="display: flex; flex-direction: column; gap: 6px;">
            <a href="https://piksel.big.go.id" target="_blank" rel="noopener noreferrer" class="link-btn full-width">
              Buka Portal BIG Piksel ↗
            </a>
            <a href="https://explorer.piksel.big.go.id" target="_blank" rel="noopener noreferrer" class="link-btn secondary full-width">
              Eksplorer Data Cube ↗
            </a>
          </div>
        </div>
      </details>
    `;
  }

  private getStatusBadgeHtml(state: PikselLoadingState): string {
    const status = state.status;
    const activeProduct = this.pikselLoader.getActiveProduct();
    const minZoom = activeProduct?.minZoom ?? 8;

    if (status === 'zoom_too_low') {
      const curZ = state.diagnostics?.currentZoom ? `Level ${state.diagnostics.currentZoom}` : 'Terlalu Jauh';
      return `
        <div class="clean-alert alert-warning">
          <div class="alert-icon-title">
            <span style="font-size: 16px;">🔍</span>
            <strong>Peta Terlalu Jauh (Zoom ${curZ})</strong>
          </div>
          <p class="alert-desc">
            Citra satelit resolusi 10m membutuhkan minimal <strong>Level Zoom ${minZoom} (Skala Regional)</strong> agar ubin Open Data Cube dirender.
          </p>
          <div class="alert-actions-row">
            <button class="btn-alert-action" id="btn-auto-zoom-min">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              Zoom Otomatis Masuk (Level ${minZoom}+)
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
            <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 2px;">Memuat ubin citra satelit OGC WMS</span>
          </div>
        </div>
      `;
    }

    if (status === 'degraded' || status === 'partial') {
      return `
        <div class="clean-alert alert-partial">
          <div>
            <strong>✓ Ubin raster sebagian telah dimuat</strong>
            <span style="font-size: 11px; color: #cbd5e1; display: block; margin-top: 2px;">Beberapa ubin mengalami latensi dari server ODC hulu.</span>
          </div>
        </div>
      `;
    }

    if (status === 'error') {
      return `
        <div class="clean-alert alert-error">
          <div class="alert-icon-title">
            <span style="font-size: 16px;">⚠️</span>
            <strong>Layanan OGC WMS Tidak Tersedia</strong>
          </div>
          <p class="alert-desc">
            Server hulu mengalami timeout untuk lapisan ini. Anda dapat mencoba lagi atau memilih Sentinel-2 True Color.
          </p>
          <div class="alert-actions-row">
            <button class="btn-alert-retry" id="btn-retry-piksel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              Coba Lagi
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
          showToast('Mencoba kembali memuat ubin satelit dari server OGC...', 'info');
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
      hudTitle.innerText = `🔍 Perbesar Peta (Min. Level ${activeProduct.minZoom ?? 8}) untuk Memuat Citra`;
      hudSubtitle.innerText = `${curZ} • Klik di sini atau putar roda mouse untuk zoom ke skala regional`;
      
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
      hudSubtitle.innerText = `Open Data Cube BIG • Mengambil ubin`;
      return;
    }

    if (state.status === 'error') {
      spinner.style.display = 'none';
      hudTitle.innerText = `⚠️ Gangguan Server OGC WMS`;
      hudSubtitle.innerText = `Batas waktu habis. Klik coba lagi di bilah sisi.`;
      return;
    }

    if (state.status === 'ready' || state.status === 'degraded' || state.status === 'partial') {
      spinner.style.display = 'none';
      hudTitle.innerText = state.status === 'degraded' ? `${activeProduct.name} (Sebagian)` : `${activeProduct.name} Siap`;
      hudSubtitle.innerText = `Citra Satelit ${activeProduct.resolution} • OGC WMS`;
      setTimeout(() => {
        if (this.currentLoadingState.status === 'ready' || this.currentLoadingState.status === 'degraded' || this.currentLoadingState.status === 'partial') {
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
          showToast(`Flying to ${preset.name} (${prod?.name || 'Satellite Imagery'})`, 'info');
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-if-mobile'));
          }
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

      // 3. Product select click — ignore if clicking About accordion or disabled product
      const disabledCard = target.closest('.clean-product-card.is-disabled');
      if (disabledCard) {
        showToast('Dataset ini saat ini sedang tidak tersedia pada layanan OGC staging.', 'warning');
        return;
      }

      const selectBtn = target.closest('.btn-select-product') as HTMLElement;
      const productCard = target.closest('.clean-product-card') as HTMLElement;
      const clickedId = selectBtn?.dataset.id || productCard?.dataset.id;

      if (clickedId && !target.closest('select') && !target.closest('input') && !target.closest('.card-about-accordion')) {
        const prodObj = PIKSEL_PRODUCTS.find(p => p.id === clickedId);
        if (prodObj?.isDisabled) {
          showToast('Dataset ini saat ini sedang tidak tersedia pada layanan OGC staging.', 'warning');
          return;
        }

        const current = this.pikselLoader.getActiveProduct();
        if (current?.id === clickedId) {
          this.pikselLoader.setActiveProduct(null);
        } else {
          const map = this.pikselLoader.getMap();
          const prevCenter = map ? map.getCenter() : null;
          const prevZoom = map ? map.getZoom() : null;
          const prevPitch = map ? map.getPitch() : 0;
          const prevBearing = map ? map.getBearing() : 0;

          this.pikselLoader.setActiveProduct(clickedId);
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-if-mobile'));
          }
          const targetNav = this.pikselLoader.autoFlyToOptimalView(clickedId);
          if (targetNav) {
            showToast(
              `🔍 Citra resolusi tinggi memerlukan zoom lebih dekat — peta diarahkan ke area rekomendasi (${targetNav}).`,
              {
                type: 'info',
                durationMs: 7000,
                action: prevCenter && prevZoom !== null ? {
                  label: '↩️ Urungkan',
                  onClick: () => {
                    map?.flyTo({
                      center: prevCenter,
                      zoom: prevZoom,
                      pitch: prevPitch,
                      bearing: prevBearing,
                      duration: 1500,
                      essential: true
                    });
                    showToast('Kembali ke posisi kamera sebelumnya', 'info', 2000);
                  }
                } : undefined
              }
            );
          }
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
        showToast('Retrying satellite tile requests from OGC server...', 'info');
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

      // 8. Reset filters button
      if (target.closest('#btn-reset-piksel-filters')) {
        this.pikselLoader.resetFilters();
        this.render();
        showToast('Spectral display filters reset to default', 'info');
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
      } else if (target.id === 'piksel-filter-brightness') {
        const val = Number(target.value);
        const text = document.getElementById('piksel-brightness-val');
        if (text) text.innerText = `${val > 0 ? '+' : ''}${val}%`;
        this.pikselLoader.setBrightness(val / 100);
      } else if (target.id === 'piksel-filter-contrast') {
        const val = Number(target.value);
        const text = document.getElementById('piksel-contrast-val');
        if (text) text.innerText = `${val > 0 ? '+' : ''}${val}%`;
        this.pikselLoader.setContrast(val / 100);
      } else if (target.id === 'piksel-filter-saturation') {
        const val = Number(target.value);
        const text = document.getElementById('piksel-saturation-val');
        if (text) text.innerText = `${val > 0 ? '+' : ''}${val}%`;
        this.pikselLoader.setSaturation(val / 100);
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
