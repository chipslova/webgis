import { PikselLoader, PikselLoadingState, PikselDiagnostics } from '../tools/piksel-loader';
import {
  PIKSEL_PRODUCTS,
  PIKSEL_PRESETS,
  PikselProduct,
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
  private isEventsBound: boolean = false;

  constructor(pikselLoader: PikselLoader) {
    this.pikselLoader = pikselLoader;
    this.init();
  }

  public init() {
    this.renderPresets();
    this.renderControls();
    this.renderProducts();
    this.bindEvents();

    // Listen to layer and telemetry state changes
    this.pikselLoader.onLayersChange(() => {
      this.syncUIStates();
    });

    this.pikselLoader.onLoadingStateChange((state) => {
      this.currentLoadingState = state;
      this.updateLoadingHUD(state);
      this.updateActiveCardDiagnostics(state.diagnostics);
    });
  }

  private renderPresets() {
    const container = document.getElementById('piksel-presets-container');
    if (!container) return;

    container.innerHTML = PIKSEL_PRESETS.map((preset: PikselPreset) => `
      <button class="piksel-preset-btn" data-id="${preset.id}" title="${preset.description}">
        <span class="preset-name">${preset.name}</span>
        <span class="preset-desc">${preset.description}</span>
      </button>
    `).join('');
  }

  private renderControls() {
    const container = document.getElementById('piksel-products-container');
    if (!container) return;

    const activeProduct = this.pikselLoader.getActiveProduct();
    const opacityPct = Math.round(this.pikselLoader.getOpacity() * 100);
    const isGridOn = this.pikselLoader.isGridVisible();
    const currentYear = this.pikselLoader.getSelectedYear();
    const diagnostics = this.pikselLoader.getDiagnostics();

    let activeSummaryHtml = '';
    if (activeProduct) {
      const yearOptionsHtml = (activeProduct.availableYears || S2_YEARS).map(
        (y) => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
      ).join('');

      activeSummaryHtml = `
        <div class="piksel-active-summary-card">
          <div class="piksel-active-header">
            <div class="piksel-active-title-group">
              <span class="active-pulse-indicator ${this.currentLoadingState.status}"></span>
              <div>
                <h4 class="active-product-heading">${activeProduct.name}</h4>
                <span class="active-tag-badge">${activeProduct.badge}</span>
              </div>
            </div>
          </div>

          <!-- Dynamic Status / Zoom Alert inside card -->
          <div id="piksel-active-status-bar" class="piksel-active-status-bar ${this.currentLoadingState.status}">
            ${this.getStatusBadgeHtml(this.currentLoadingState)}
          </div>

          <div class="piksel-active-meta-grid">
            <div class="meta-field">
              <span class="meta-field-label">Year:</span>
              ${activeProduct.timeEnabled ? `
                <select id="piksel-year-select" class="piksel-select-sm">
                  ${yearOptionsHtml}
                </select>
              ` : `<span class="meta-field-val">Static</span>`}
            </div>
            <div class="meta-field">
              <span class="meta-field-label">Resolution:</span>
              <span class="meta-field-val">${activeProduct.resolution}</span>
            </div>
            <div class="meta-field">
              <span class="meta-field-label">Provider:</span>
              <span class="meta-field-val">BIG Piksel</span>
            </div>
            <div class="meta-field">
              <span class="meta-field-label">Protocol:</span>
              <span class="meta-field-val">OGC WMS 1.3.0</span>
            </div>
          </div>

          <div class="piksel-active-slider-wrap">
            <div class="slider-header-row">
              <span>Layer Opacity:</span>
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

          <!-- Live Tile Diagnostics Panel (Collapsible) -->
          <div class="piksel-diagnostics-box" id="piksel-diagnostics-box">
            ${this.renderDiagnosticsHtml(diagnostics)}
          </div>

          <button id="btn-clear-piksel-layer" class="btn btn-danger-outline full-width" style="margin-top: 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Deactivate Layer
          </button>
        </div>
      `;
    } else {
      activeSummaryHtml = `
        <div class="piksel-inactive-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Select a satellite imagery or spectral index product below to activate layer.</span>
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
          <span class="piksel-toggle-custom"></span>
          <span class="piksel-toggle-text">
            <strong>National Data Cube Grid (10m)</strong>
            <small>Overlay 1,631 Open Data Cube index boundaries</small>
          </span>
        </label>
      </div>

      <!-- Catalog Header -->
      <div class="piksel-catalog-header">
        <h4>Satellite Imagery & Analysis Catalog</h4>
        <span class="catalog-count">${PIKSEL_PRODUCTS.length} Products</span>
      </div>

      <!-- Products Grid -->
      <div id="piksel-products-list-items" class="piksel-products-grid"></div>
    `;

    container.innerHTML = controlsHtml;
  }

  private getStatusBadgeHtml(state: PikselLoadingState): string {
    const status = state.status;
    const activeProduct = this.pikselLoader.getActiveProduct();
    const minZoom = activeProduct?.minZoom ?? 6;

    if (status === 'zoom_too_low') {
      return `
        <div class="status-alert zoom-warning">
          <div class="status-alert-text">
            <strong>Zoom Level Too Low</strong>
            <span>Zoom in to <strong>Z${minZoom}+</strong> to render 10m raster tiles (Current: Z${state.diagnostics?.currentZoom || '?'}).</span>
          </div>
          <button class="btn btn-xs btn-primary-outline" id="btn-jump-bromo-preset" style="margin-top: 6px;">
            Jump to Bromo (Z11)
          </button>
        </div>
      `;
    }

    if (status === 'requesting' || status === 'loading') {
      return `
        <div class="status-alert loading">
          <div class="hud-spinner-inline"></div>
          <div class="status-alert-text">
            <strong>Processing in Open Data Cube...</strong>
            <span>Tiles: ${state.diagnostics?.tilesLoaded || 0}/${Math.max(state.diagnostics?.tilesRequested || 1, 1)}</span>
          </div>
        </div>
      `;
    }

    if (status === 'partial') {
      return `
        <div class="status-alert partial">
          <div class="status-alert-text">
            <strong>Partial Tile Coverage</strong>
            <span>${state.diagnostics?.tilesLoaded || 0}/${state.diagnostics?.tilesRequested || 1} tiles loaded. Server processing remaining extent.</span>
          </div>
        </div>
      `;
    }

    if (status === 'error') {
      return `
        <div class="status-alert error">
          <div class="status-alert-text">
            <strong>Server Timeout (HTTP 500)</strong>
            <span>Zoom into a study area or select another product/year.</span>
          </div>
        </div>
      `;
    }

    if (status === 'ready') {
      return `
        <div class="status-alert ready">
          <div class="status-alert-text">
            <strong>Raster Ready</strong>
            <span>10m resolution tiles loaded (${state.diagnostics?.latencyMs || 0}ms)</span>
          </div>
        </div>
      `;
    }

    return '';
  }

  private renderDiagnosticsHtml(diag?: PikselDiagnostics): string {
    if (!diag || !diag.productId) return '';

    const statusBadgeClass = diag.status === 'ready' ? 'ready' : (diag.status === 'loading' ? 'loading' : (diag.status === 'zoom_too_low' ? 'warning' : 'info'));

    return `
      <details class="diagnostics-details">
        <summary class="diagnostics-summary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style="flex:1;">Technical Diagnostics</span>
          <span class="diag-status-pill ${statusBadgeClass}">${diag.status.toUpperCase()}</span>
        </summary>
        <div class="diagnostics-content">
          <div class="diag-metric">
            <span class="diag-label">Tiles Loaded:</span>
            <strong class="diag-val">${diag.tilesLoaded} / ${Math.max(diag.tilesRequested, 1)}</strong>
          </div>
          <div class="diag-metric">
            <span class="diag-label">Tiles Aborted / Failed:</span>
            <strong class="diag-val ${diag.tilesFailed > 0 ? 'text-danger' : ''}">${diag.tilesFailed}</strong>
          </div>
          <div class="diag-metric">
            <span class="diag-label">Server Latency:</span>
            <strong class="diag-val">${diag.latencyMs > 0 ? (diag.latencyMs / 1000).toFixed(2) + ' s' : 'Waiting...'}</strong>
          </div>
          <div class="diag-metric">
            <span class="diag-label">Zoom Threshold:</span>
            <strong class="diag-val">Min. Z${diag.minZoom} (Current: Z${diag.currentZoom})</strong>
          </div>
          <div class="diag-metric">
            <span class="diag-label">Service Protocol:</span>
            <strong class="diag-val">OGC WMS 1.3.0</strong>
          </div>
        </div>
      </details>
    `;
  }

  private updateActiveCardDiagnostics(diag?: PikselDiagnostics) {
    const diagBox = document.getElementById('piksel-diagnostics-box');
    if (diagBox && diag) {
      diagBox.innerHTML = this.renderDiagnosticsHtml(diag);
    }

    const statusBar = document.getElementById('piksel-active-status-bar');
    if (statusBar) {
      statusBar.className = `piksel-active-status-bar ${this.currentLoadingState.status}`;
      statusBar.innerHTML = this.getStatusBadgeHtml(this.currentLoadingState);

      const jumpBtn = statusBar.querySelector('#btn-jump-bromo-preset');
      if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
          const bromo = PIKSEL_PRESETS.find(p => p.id === 'bromo');
          if (bromo) this.pikselLoader.flyToPreset(bromo);
        });
      }
    }
  }

  public renderProducts() {
    const container = document.getElementById('piksel-products-list-items');
    if (!container) return;

    const activeProduct = this.pikselLoader.getActiveProduct();

    const categories: { [key: string]: PikselProduct[] } = {
      'True & False Color Composites': PIKSEL_PRODUCTS.filter(p => p.category === 'geomad'),
      'Spectral Indices (ODC Compute)': PIKSEL_PRODUCTS.filter(p => p.category === 'indices'),
      'Hazards & Physical Models': PIKSEL_PRODUCTS.filter(p => p.category === 'hazard'),
      'Landsat 9 Analysis': PIKSEL_PRODUCTS.filter(p => p.category === 'landsat'),
      'Data Quality & Density': PIKSEL_PRODUCTS.filter(p => p.category === 'quality')
    };

    let html = '';

    for (const [categoryName, products] of Object.entries(categories)) {
      if (products.length === 0) continue;

      let subtitle = '';
      if (categoryName.includes('Composite')) subtitle = 'Sentinel-2 GeoMAD Median Absolute Deviation Mosaic';
      else if (categoryName.includes('Indices')) subtitle = 'On-the-fly server-side band math via Open Data Cube';
      else if (categoryName.includes('Hazards')) subtitle = 'National hydrological hazard classifications';
      else if (categoryName.includes('Landsat')) subtitle = 'USGS Landsat 9 Collection 2 Level 2 Surface Reflectance';
      else if (categoryName.includes('Quality')) subtitle = 'Pixel observation availability & statistical metrics';

      html += `
        <div class="piksel-category-group">
          <div class="piksel-category-title">
            <span>${categoryName}</span>
            <small class="group-subtitle">${subtitle}</small>
          </div>
          <div class="piksel-category-items">
      `;

      products.forEach((prod) => {
        const isActive = activeProduct?.id === prod.id;
        const isBsiWarning = prod.id === 's2-bsi';

        let legendHtml = '';
        if (prod.legend) {
          if (prod.legend.type === 'continuous' || prod.legend.type === 'natural') {
            legendHtml = `
              <div class="product-legend-preview">
                <div class="legend-bar-mini ${prod.legend.gradientClass}"></div>
                <div class="legend-labels-mini">
                  <span>${prod.legend.leftLabel}</span>
                  ${prod.legend.middleLabel ? `<span>${prod.legend.middleLabel}</span>` : ''}
                  <span>${prod.legend.rightLabel}</span>
                </div>
              </div>
            `;
          } else if (prod.legend.type === 'categorical') {
            legendHtml = `
              <div class="product-legend-preview-cat">
                ${prod.legend.items.slice(0, 4).map(it => `
                  <span class="legend-cat-chip" style="border-left: 3px solid ${it.color};">${it.label}</span>
                `).join('')}
              </div>
            `;
          }
        }

        html += `
          <div class="piksel-product-card ${isActive ? 'active' : ''}" data-id="${prod.id}">
            <div class="product-card-top">
              <div class="product-title-row">
                <span class="product-bullet" style="background-color: ${prod.color};"></span>
                <span class="product-name">${prod.name}</span>
              </div>
              <span class="product-badge" style="border-color: ${prod.color}66; color: ${prod.color};">${prod.badge}</span>
            </div>

            <p class="product-desc">${prod.description}</p>

            ${prod.statusNotice ? `
              <div class="product-provenance-box" style="margin: 4px 0 8px; font-size: 10px; color: #94a3b8; background: rgba(15, 23, 42, 0.5); padding: 4px 8px; border-radius: 4px; border-left: 2px solid ${prod.color};">
                ${prod.statusNotice}
              </div>
            ` : ''}

            ${isBsiWarning ? `
              <div class="product-warning-box">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>Server notice: BIG BSI endpoint returns HTTP 500 in certain regions.</span>
              </div>
            ` : ''}

            <div class="product-meta-row">
              <span class="meta-tag">Res: ${prod.resolution}</span>
              <span class="meta-tag">Min Zoom: Z${prod.minZoom ?? 6}</span>
              ${prod.timeEnabled ? `<span class="meta-tag time-tag">Multi-Year</span>` : ''}
            </div>

            ${legendHtml}

            <button class="btn btn-sm ${isActive ? 'btn-danger-outline' : 'btn-primary-outline'} full-width btn-toggle-product" data-id="${prod.id}" style="margin-top: 8px;">
              ${isActive ? 'Deactivate Layer' : 'Activate Layer'}
            </button>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
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
      hudTitle.innerText = `Zoom in to Z${activeProduct.minZoom ?? 6}+ to load ${activeProduct.name}`;
      hudSubtitle.innerText = `Current Zoom: Z${state.diagnostics?.currentZoom || '?'}`;
      return;
    }

    if (state.status === 'requesting' || state.status === 'loading') {
      spinner.style.display = 'block';
      hudTitle.innerText = `Loading ${activeProduct.name}...`;
      hudSubtitle.innerText = `Open Data Cube • ${state.diagnostics?.tilesLoaded || 0}/${Math.max(state.diagnostics?.tilesRequested || 1, 1)} tiles`;
      return;
    }

    if (state.status === 'partial') {
      spinner.style.display = 'none';
      hudTitle.innerText = `Partial Coverage: ${activeProduct.name}`;
      hudSubtitle.innerText = `${state.diagnostics?.tilesLoaded || 0}/${state.diagnostics?.tilesRequested || 1} tiles loaded (${state.diagnostics?.latencyMs || 0}ms)`;
      return;
    }

    if (state.status === 'error') {
      spinner.style.display = 'none';
      hudTitle.innerText = `WMS Service Timeout (HTTP 500)`;
      hudSubtitle.innerText = `Try zooming into a study preset`;
      return;
    }

    if (state.status === 'ready') {
      spinner.style.display = 'none';
      hudTitle.innerText = `${activeProduct.name} Ready`;
      hudSubtitle.innerText = `10m Sentinel-2 GeoMAD (${state.diagnostics?.latencyMs || 0}ms)`;
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

    const presetsContainer = document.getElementById('piksel-presets-container');
    if (presetsContainer) {
      presetsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest('.piksel-preset-btn') as HTMLElement;
        if (btn && btn.dataset.id) {
          const preset = PIKSEL_PRESETS.find(p => p.id === btn.dataset.id);
          if (preset) {
            this.pikselLoader.flyToPreset(preset);
          }
        }
      });
    }

    const container = document.getElementById('panel-piksel');
    if (container) {
      container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        const toggleBtn = target.closest('.btn-toggle-product') as HTMLElement;
        if (toggleBtn && toggleBtn.dataset.id) {
          const prodId = toggleBtn.dataset.id;
          const current = this.pikselLoader.getActiveProduct();
          if (current?.id === prodId) {
            this.pikselLoader.setActiveProduct(null);
          } else {
            this.pikselLoader.setActiveProduct(prodId);
          }
          this.syncUIStates();
          return;
        }

        const card = target.closest('.piksel-product-card') as HTMLElement;
        if (card && card.dataset.id && !target.closest('button')) {
          const prodId = card.dataset.id;
          const current = this.pikselLoader.getActiveProduct();
          if (current?.id !== prodId) {
            this.pikselLoader.setActiveProduct(prodId);
            this.syncUIStates();
          }
          return;
        }

        if (target.closest('#btn-clear-piksel-layer')) {
          this.pikselLoader.setActiveProduct(null);
          this.syncUIStates();
          return;
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
    this.renderControls();
    this.renderProducts();
  }
}
