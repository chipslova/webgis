import { BasemapCustomizer, VectorSublayerKey } from '../tools/basemap-customizer';
import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config/basemaps';
import { showToast } from './toast';

export class BasemapCustomizerUI {
  private customizer: BasemapCustomizer;
  private mapManager?: MapManager;
  private pikselLoader?: PikselLoader;

  // Popover IDs
  private basemapPopoverId = 'basemap-popover';
  private sublayersPopoverId = 'sublayers-popover';
  private terrainPopoverId = 'terrain-popover';

  constructor(customizer: BasemapCustomizer, mapManager?: MapManager, pikselLoader?: PikselLoader) {
    this.customizer = customizer;
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.init();
  }

  public init() {
    this.renderBasemapPopoverGallery();
    this.bindDockEvents();
    this.bindPopoverEvents();
    this.bindOutsideClickEvents();

    this.customizer.onChange(() => {
      this.syncUI();
    });

    if (this.mapManager) {
      this.mapManager.onStyleReady(() => {
        this.syncUI();
      });
      this.mapManager.onBasemapOpacityChange(() => {
        this.syncUI();
      });
    }

    if (this.pikselLoader) {
      this.pikselLoader.onLayersChange(() => {
        this.syncUI();
      });
    }

    this.syncUI();
  }

  /**
   * Renders the basemap choices into the floating Basemap Popover gallery
   */
  private renderBasemapPopoverGallery() {
    const recContainer = document.getElementById('popover-basemap-rec-list');
    const thematicContainer = document.getElementById('popover-basemap-thematic-list');
    const canvasContainer = document.getElementById('popover-basemap-canvas-list');

    if (!recContainer || !thematicContainer || !canvasContainer) return;

    recContainer.innerHTML = '';
    thematicContainer.innerHTML = '';
    canvasContainer.innerHTML = '';

    const currentId = this.mapManager?.getCurrentBasemapId() || DEFAULT_BASEMAP_ID;

    const createItem = (bm: typeof BASEMAPS[0]) => {
      const item = document.createElement('div');
      item.className = `basemap-popover-item ${bm.id === currentId ? 'active' : ''}`;
      item.dataset.id = bm.id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Pilih basemap ${bm.name} format ${bm.format} kategori ${bm.category}`);

      const formatBadge = bm.format === 'vector'
        ? `<span class="bm-tag-badge vector" title="Basemap Vektor: Mendukung kustomisasi sublayer (jalan, batas admin, label)">🔷 Vektor</span>`
        : `<span class="bm-tag-badge raster" title="Basemap Raster: Citra/Peta komposit piksel">🖼️ Raster</span>`;
      
      const maxZoomBadge = bm.maxZoom
        ? `<span class="bm-tag-badge maxzoom" title="Maksimal zoom level ${bm.maxZoom} (Batimetri Kedalaman Laut)">⚠️ Maks Z${bm.maxZoom}</span>`
        : '';

      item.innerHTML = `
        <div class="popover-item-left">
          <div class="popover-basemap-dot" style="background-color: ${bm.previewColor};" aria-hidden="true"></div>
          <div class="popover-basemap-text">
            <div class="popover-basemap-title-row">
              <span class="popover-basemap-title">${bm.name}</span>
              ${formatBadge}
              ${maxZoomBadge}
            </div>
            <span class="popover-basemap-cat">${bm.category} &bull; ${bm.description}</span>
          </div>
        </div>
        <div class="popover-check-indicator" aria-hidden="true">✓</div>
      `;

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });

      item.addEventListener('click', () => {
        document.querySelectorAll('.basemap-popover-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        // Also sync sidebar basemap grid if present
        document.querySelectorAll('.basemap-card').forEach(el => {
          el.classList.toggle('active', (el as HTMLElement).dataset.id === bm.id);
        });

        if (this.mapManager) {
          this.mapManager.setBasemap(bm.id);
        }
        this.customizer.setBasemapId(bm.id);
        showToast(`Basemap diubah ke "${bm.name}"`, 'info');
        this.syncUI();
      });

      return item;
    };

    BASEMAPS.forEach(bm => {
      const group = bm.group || 'recommended';
      const item = createItem(bm);
      if (group === 'recommended') {
        recContainer.appendChild(item);
      } else if (group === 'thematic') {
        thematicContainer.appendChild(item);
      } else if (group === 'canvas') {
        canvasContainer.appendChild(item);
      }
    });
  }

  /**
   * Binds floating bottom tools dock buttons
   */
  private bindDockEvents() {
    const btnBasemap = document.getElementById('btn-toggle-basemap');
    const btnSublayers = document.getElementById('btn-toggle-sublayers');
    const btnTerrain = document.getElementById('btn-toggle-terrain');
    const btnGrid = document.getElementById('btn-toggle-grid');

    const btnSidebarBasemaps = document.getElementById('btn-sidebar-open-basemaps');
    const btnSidebarSublayers = document.getElementById('btn-sidebar-open-sublayers');

    btnBasemap?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.basemapPopoverId, btnBasemap);
    });

    btnSidebarBasemaps?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.basemapPopoverId, btnBasemap ?? undefined);
    });

    btnSublayers?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.sublayersPopoverId, btnSublayers);
    });

    btnSidebarSublayers?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.sublayersPopoverId, btnSublayers ?? undefined);
    });

    btnTerrain?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.terrainPopoverId, btnTerrain);
    });

    btnGrid?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.pikselLoader) {
        const next = !this.pikselLoader.isGridVisible();
        this.pikselLoader.setGridVisible(next);
        showToast(next ? 'Tile Grid 10m Piksel ditampilkan' : 'Tile Grid disembunyikan', 'info');
        this.syncUI();
      }
    });
  }

  /**
   * Toggles visibility of a glass popover while closing others
   */
  public togglePopover(popoverId: string, triggerBtn?: HTMLElement) {
    const target = document.getElementById(popoverId);
    if (!target) return;

    const isVisible = target.style.display === 'block';

    this.closeAllPopovers();

    if (!isVisible) {
      target.style.display = 'block';
      if (triggerBtn) {
        triggerBtn.classList.add('popover-open');
      }
    }
  }

  public closeAllPopovers() {
    [this.basemapPopoverId, this.sublayersPopoverId, this.terrainPopoverId].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.classList.remove('popover-open');
    });
  }

  /**
   * Binds popover close buttons and interaction controls
   */
  private bindPopoverEvents() {
    // Close buttons
    document.getElementById('btn-close-basemap-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllPopovers();
    });
    document.getElementById('btn-close-sublayers-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllPopovers();
    });
    document.getElementById('btn-close-terrain-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllPopovers();
    });

    // --- Basemap Popover Controls ---
    const basemapOpacitySlider = document.getElementById('popover-basemap-opacity-slider') as HTMLInputElement;
    basemapOpacitySlider?.addEventListener('input', () => {
      const val = parseInt(basemapOpacitySlider.value, 10);
      const opacity = isNaN(val) ? 1.0 : val / 100;
      if (this.mapManager) {
        this.mapManager.setBasemapOpacity(opacity);
      }
      const valEl = document.getElementById('popover-basemap-opacity-val');
      if (valEl) valEl.innerText = `${val}%`;
    });

    document.getElementById('btn-reset-basemap-opacity')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.mapManager) {
        this.mapManager.setBasemapOpacity(1.0);
      }
      if (basemapOpacitySlider) basemapOpacitySlider.value = '100';
      const valEl = document.getElementById('popover-basemap-opacity-val');
      if (valEl) valEl.innerText = '100%';
    });

    // --- Sublayers Popover Controls ---
    const checkHillshade = document.getElementById('popover-check-hillshade') as HTMLInputElement;
    checkHillshade?.addEventListener('change', () => {
      this.customizer.toggleTerrainHillshade(checkHillshade.checked);
      showToast(checkHillshade.checked ? 'Terrain Hillshade aktif' : 'Terrain Hillshade nonaktif', 'info');
    });

    // Vector sublayer toggles
    const sublayerToggles = document.querySelectorAll<HTMLInputElement>('#sublayers-popover .sublayer-toggle[data-key]');
    sublayerToggles.forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.key as VectorSublayerKey;
        if (key) {
          this.customizer.toggleSublayer(key, input.checked);
        }
      });
    });

    // Bulk sublayer buttons
    document.getElementById('btn-popover-sublayers-all')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentBm = BASEMAPS.find(b => b.id === (this.mapManager?.getCurrentBasemapId() || DEFAULT_BASEMAP_ID));
      if (currentBm && currentBm.format !== 'vector') {
        showToast(`Kustomisasi sublayer hanya aktif pada Basemap Vektor (${currentBm.name} berformat Raster)`, 'warning');
        return;
      }
      this.customizer.setAllSublayers(true);
      showToast('Semua sublayer vektor diaktifkan', 'info');
      this.syncUI();
    });

    document.getElementById('btn-popover-sublayers-mute')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentBm = BASEMAPS.find(b => b.id === (this.mapManager?.getCurrentBasemapId() || DEFAULT_BASEMAP_ID));
      if (currentBm && currentBm.format !== 'vector') {
        showToast(`Kustomisasi sublayer hanya aktif pada Basemap Vektor (${currentBm.name} berformat Raster)`, 'warning');
        return;
      }
      this.customizer.setAllSublayers(false);
      showToast('Peta Bersih: semua sublayer dimatikan', 'info');
      this.syncUI();
    });

    // --- 3D Terrain Popover Controls ---
    const masterTerrainToggle = document.getElementById('popover-terrain-master-toggle') as HTMLInputElement;
    masterTerrainToggle?.addEventListener('change', () => {
      this.customizer.toggle3DTerrain(masterTerrainToggle.checked);
      showToast(masterTerrainToggle.checked ? 'Mode 3D Terrain Elevation diaktifkan!' : 'Kembali ke 2D datar', 'info');
      this.syncUI();
    });

    const terrainExagSlider = document.getElementById('popover-terrain-exaggeration-slider') as HTMLInputElement;
    terrainExagSlider?.addEventListener('input', () => {
      const val = parseFloat(terrainExagSlider.value);
      this.customizer.setTerrainExaggeration(val);
      const valEl = document.getElementById('popover-terrain-exaggeration-val');
      if (valEl) valEl.innerText = `${val.toFixed(2)}x`;
    });
  }

  /**
   * Outside click dismisses popovers
   */
  private bindOutsideClickEvents() {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.glass-popover') &&
        !target.closest('.bottom-tools-dock')
      ) {
        this.closeAllPopovers();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllPopovers();
      }
    });
  }

  /**
   * Synchronizes all UI components with engine states
   */
  public syncUI() {
    const state = this.customizer.getState();
    const currentBasemapId = this.mapManager?.getCurrentBasemapId() || 'google-hybrid';

    // 1. Sync Basemap Popover active states and sidebar card
    document.querySelectorAll<HTMLElement>('.basemap-popover-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === currentBasemapId);
    });

    const currentBm = BASEMAPS.find(b => b.id === currentBasemapId);
    const titleEl = document.getElementById('active-bm-title');
    const badgeEl = document.getElementById('active-bm-type-badge');
    if (titleEl && currentBm) titleEl.textContent = currentBm.name;
    if (badgeEl && currentBm) {
      const formatIcon = currentBm.format === 'vector' ? '🔷 Vektor' : '🖼️ Raster';
      const zoomText = currentBm.maxZoom ? ` • Maks Z${currentBm.maxZoom}` : '';
      badgeEl.textContent = `${currentBm.category} • ${formatIcon}${zoomText}`;
      badgeEl.className = `basemap-type-badge ${currentBm.format}`;
    }

    // Sync Basemap Opacity slider
    const currentOpacity = this.mapManager?.getBasemapOpacity() ?? 1.0;
    const opacityPct = Math.round(currentOpacity * 100);
    const opacitySlider = document.getElementById('popover-basemap-opacity-slider') as HTMLInputElement;
    if (opacitySlider && document.activeElement !== opacitySlider) {
      opacitySlider.value = String(opacityPct);
    }
    const opacityVal = document.getElementById('popover-basemap-opacity-val');
    if (opacityVal) opacityVal.innerText = `${opacityPct}%`;

    // 2. Dynamic check: does the active basemap contain discrete vector sublayers?
    const isRasterBasemap = currentBm ? currentBm.format !== 'vector' : true;
    const sublayerNotice = document.getElementById('popover-sublayer-notice');
    if (sublayerNotice) {
      sublayerNotice.style.display = isRasterBasemap ? 'block' : 'none';
      if (isRasterBasemap) {
        sublayerNotice.innerHTML = `
          <div class="sublayer-notice-content">
            <div class="sublayer-notice-header">
              <span class="lock-icon" aria-hidden="true">🔒</span>
              <span>Sublayer Khusus Basemap Vektor</span>
            </div>
            <p>Basemap aktif (<strong>${currentBm?.name || 'Raster'}</strong>) berupa gambar citra piksel. Tombol jalan, batas wilayah, dan label hanya aktif pada basemap <strong>Vektor</strong>.</p>
            <button type="button" class="btn-notice-switch-vector" id="btn-notice-switch-vector" aria-label="Beralih ke Basemap Vektor OpenFreeMap Liberty">
              ⚡ Ganti ke OpenFreeMap Vektor
            </button>
          </div>
        `;

        document.getElementById('btn-notice-switch-vector')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetVectorBm = 'openfreemap-liberty';
          if (this.mapManager) {
            this.mapManager.setBasemap(targetVectorBm);
          }
          this.customizer.setBasemapId(targetVectorBm);
          showToast('Beralih ke Basemap Vektor OpenFreeMap Liberty! Kustomisasi sublayer kini aktif.', 'success');
          this.syncUI();
        });
      }
    }

    // 3. Disable bulk action buttons for raster basemaps
    const btnSubAll = document.getElementById('btn-popover-sublayers-all') as HTMLButtonElement | null;
    const btnSubMute = document.getElementById('btn-popover-sublayers-mute') as HTMLButtonElement | null;
    if (btnSubAll) {
      btnSubAll.disabled = isRasterBasemap;
      btnSubAll.style.opacity = isRasterBasemap ? '0.35' : '1';
      btnSubAll.style.cursor = isRasterBasemap ? 'not-allowed' : 'pointer';
      btnSubAll.title = isRasterBasemap ? 'Hanya tersedia untuk basemap Vektor' : 'Aktifkan semua sublayer';
    }
    if (btnSubMute) {
      btnSubMute.disabled = isRasterBasemap;
      btnSubMute.style.opacity = isRasterBasemap ? '0.35' : '1';
      btnSubMute.style.cursor = isRasterBasemap ? 'not-allowed' : 'pointer';
      btnSubMute.title = isRasterBasemap ? 'Hanya tersedia untuk basemap Vektor' : 'Matikan semua sublayer';
    }

    // 4. Sync Sublayer Popover Checkboxes (dimmed and locked for raster basemaps)
    const checkHillshade = document.getElementById('popover-check-hillshade') as HTMLInputElement;
    if (checkHillshade) checkHillshade.checked = state.terrainHillshade;

    const vectorList = document.querySelector('.vector-sublayers-list') as HTMLElement | null;
    if (vectorList) {
      vectorList.classList.toggle('is-disabled-for-raster', isRasterBasemap);
    }

    const sublayerToggles = document.querySelectorAll<HTMLInputElement>('#sublayers-popover .sublayer-toggle[data-key]');
    sublayerToggles.forEach(input => {
      const key = input.dataset.key as VectorSublayerKey;
      if (key && state.sublayers[key] !== undefined) {
        input.checked = state.sublayers[key];
      }
      input.disabled = isRasterBasemap;
      const parentLabel = input.closest('.sublayer-item') as HTMLElement | null;
      if (parentLabel) {
        parentLabel.style.opacity = isRasterBasemap ? '0.35' : '1';
        parentLabel.style.pointerEvents = isRasterBasemap ? 'none' : 'auto';
        parentLabel.style.cursor = isRasterBasemap ? 'not-allowed' : 'pointer';
        parentLabel.title = isRasterBasemap ? 'Hanya dapat diubah pada basemap Vektor' : '';
      }
    });

    // 4. Sync 3D Terrain Popover Controls
    const masterTerrainToggle = document.getElementById('popover-terrain-master-toggle') as HTMLInputElement;
    if (masterTerrainToggle) masterTerrainToggle.checked = state.terrain3D;

    const terrainExagSlider = document.getElementById('popover-terrain-exaggeration-slider') as HTMLInputElement;
    if (terrainExagSlider) terrainExagSlider.value = String(state.terrainExaggeration);

    const terrainExagVal = document.getElementById('popover-terrain-exaggeration-val');
    if (terrainExagVal) terrainExagVal.innerText = `${state.terrainExaggeration.toFixed(2)}x`;

    // 5. Sync Dock Buttons active highlights
    const btnTerrain = document.getElementById('btn-toggle-terrain');
    if (btnTerrain) btnTerrain.classList.toggle('active', state.terrain3D);

    const isGridOn = this.pikselLoader ? this.pikselLoader.isGridVisible() : false;
    const btnGrid = document.getElementById('btn-toggle-grid');
    if (btnGrid) btnGrid.classList.toggle('active', isGridOn);

    const btnSublayers = document.getElementById('btn-toggle-sublayers');
    if (btnSublayers) {
      const isAnyOverlayActive = state.terrainHillshade;
      btnSublayers.classList.toggle('active', isAnyOverlayActive);
    }
  }
}
