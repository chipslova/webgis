import { BasemapCustomizer, VectorSublayerKey } from '../tools/basemap-customizer';
import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { BASEMAPS } from '../config/basemaps';
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
    const rasterContainer = document.getElementById('popover-basemap-raster-list');
    const vectorContainer = document.getElementById('popover-basemap-vector-list');
    if (!rasterContainer || !vectorContainer) return;

    rasterContainer.innerHTML = '';
    vectorContainer.innerHTML = '';

    const currentId = this.mapManager?.getCurrentBasemapId() || 'google-hybrid';

    // Categorize basemaps into Raster/Satellite vs Vector
    const rasterBasemaps = BASEMAPS.filter(b => 
      b.id === 'google-satellite' || 
      b.id === 'google-hybrid' || 
      b.id === 'esri-imagery' || 
      b.id === 'esri-relief'
    );

    const vectorBasemaps = BASEMAPS.filter(b => !rasterBasemaps.some(rb => rb.id === b.id));

    const createItem = (bm: typeof BASEMAPS[0]) => {
      const item = document.createElement('div');
      item.className = `basemap-popover-item ${bm.id === currentId ? 'active' : ''}`;
      item.dataset.id = bm.id;

      item.innerHTML = `
        <div class="popover-item-left">
          <div class="popover-basemap-dot" style="background-color: ${bm.previewColor};"></div>
          <div class="popover-basemap-text">
            <span class="popover-basemap-title">${bm.name}</span>
            <span class="popover-basemap-cat">${bm.category}</span>
          </div>
        </div>
        <div class="popover-check-indicator">✓</div>
      `;

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
        showToast(`Basemap diubah ke "${bm.name}"`, 'info');
        this.syncUI();
      });

      return item;
    };

    rasterBasemaps.forEach(bm => rasterContainer.appendChild(createItem(bm)));
    vectorBasemaps.forEach(bm => vectorContainer.appendChild(createItem(bm)));
  }

  /**
   * Binds floating bottom tools dock buttons
   */
  private bindDockEvents() {
    const btnBasemap = document.getElementById('btn-toggle-basemap');
    const btnSublayers = document.getElementById('btn-toggle-sublayers');
    const btnTerrain = document.getElementById('btn-toggle-terrain');
    const btn3D = document.getElementById('btn-toggle-3d');
    const btnGrid = document.getElementById('btn-toggle-grid');

    btnBasemap?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.basemapPopoverId, btnBasemap);
    });

    btnSublayers?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.sublayersPopoverId, btnSublayers);
    });

    btnTerrain?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.terrainPopoverId, btnTerrain);
    });

    btn3D?.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = this.customizer.getState().buildings3D;
      this.customizer.toggle3DBuildings(!current);
      showToast(!current ? '3D Extruded Buildings diaktifkan!' : '3D Buildings dinonaktifkan', 'info');
      this.syncUI();
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

    const btnQuickHeaderTerrain = document.getElementById('btn-quick-3d-terrain');
    btnQuickHeaderTerrain?.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = this.customizer.getState().terrain3D;
      this.customizer.toggle3DTerrain(!current);
      showToast(!current ? 'Mode 3D Terrain Elevation diaktifkan!' : 'Kembali ke tampilan 2D datar', 'info');
      this.syncUI();
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

    // --- Sublayers Popover Controls ---
    const checkHillshade = document.getElementById('popover-check-hillshade') as HTMLInputElement;
    checkHillshade?.addEventListener('change', () => {
      this.customizer.toggleTerrainHillshade(checkHillshade.checked);
      showToast(checkHillshade.checked ? 'Terrain Hillshade aktif' : 'Terrain Hillshade nonaktif', 'info');
    });

    const checkContours = document.getElementById('popover-check-contours') as HTMLInputElement;
    checkContours?.addEventListener('change', () => {
      this.customizer.toggleContourLines(checkContours.checked);
      showToast(checkContours.checked ? 'Garis Kontur DEM ditampilkan' : 'Garis Kontur DEM disembunyikan', 'info');
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
      this.customizer.setAllSublayers(true);
      showToast('Semua sublayer vektor diaktifkan', 'info');
      this.syncUI();
    });

    document.getElementById('btn-popover-sublayers-mute')?.addEventListener('click', (e) => {
      e.stopPropagation();
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

    const terrain3DBuildings = document.getElementById('popover-terrain-3d-buildings') as HTMLInputElement;
    terrain3DBuildings?.addEventListener('change', () => {
      this.customizer.toggle3DBuildings(terrain3DBuildings.checked);
      showToast(terrain3DBuildings.checked ? '3D Buildings aktif' : '3D Buildings nonaktif', 'info');
      this.syncUI();
    });

    const terrainContours = document.getElementById('popover-terrain-contour-toggle') as HTMLInputElement;
    terrainContours?.addEventListener('change', () => {
      this.customizer.toggleContourLines(terrainContours.checked);
      showToast(terrainContours.checked ? 'Garis Kontur DEM aktif' : 'Garis Kontur DEM nonaktif', 'info');
      this.syncUI();
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

    // 1. Sync Basemap Popover active states
    document.querySelectorAll<HTMLElement>('.basemap-popover-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === currentBasemapId);
    });

    // 2. Vector Sublayers vs Raster notice badge
    const isRasterBasemap = currentBasemapId === 'google-satellite' || 
                            currentBasemapId === 'esri-imagery' ||
                            currentBasemapId === 'google-hybrid';
    const sublayerNotice = document.getElementById('popover-sublayer-notice');
    if (sublayerNotice) {
      sublayerNotice.style.display = isRasterBasemap ? 'flex' : 'none';
    }

    // 3. Sync Sublayer Popover Checkboxes
    const checkHillshade = document.getElementById('popover-check-hillshade') as HTMLInputElement;
    if (checkHillshade) checkHillshade.checked = state.terrainHillshade;

    const checkContours = document.getElementById('popover-check-contours') as HTMLInputElement;
    if (checkContours) checkContours.checked = state.contourLines;

    const sublayerToggles = document.querySelectorAll<HTMLInputElement>('#sublayers-popover .sublayer-toggle[data-key]');
    sublayerToggles.forEach(input => {
      const key = input.dataset.key as VectorSublayerKey;
      if (key && state.sublayers[key] !== undefined) {
        input.checked = state.sublayers[key];
      }
    });

    // 4. Sync 3D Terrain Popover Controls
    const masterTerrainToggle = document.getElementById('popover-terrain-master-toggle') as HTMLInputElement;
    if (masterTerrainToggle) masterTerrainToggle.checked = state.terrain3D;

    const terrainExagSlider = document.getElementById('popover-terrain-exaggeration-slider') as HTMLInputElement;
    if (terrainExagSlider) terrainExagSlider.value = String(state.terrainExaggeration);

    const terrainExagVal = document.getElementById('popover-terrain-exaggeration-val');
    if (terrainExagVal) terrainExagVal.innerText = `${state.terrainExaggeration.toFixed(2)}x`;

    const terrain3DBuildings = document.getElementById('popover-terrain-3d-buildings') as HTMLInputElement;
    if (terrain3DBuildings) terrain3DBuildings.checked = state.buildings3D;

    const terrainContours = document.getElementById('popover-terrain-contour-toggle') as HTMLInputElement;
    if (terrainContours) terrainContours.checked = state.contourLines;

    // 5. Sync Dock Buttons active highlights
    const btnTerrain = document.getElementById('btn-toggle-terrain');
    if (btnTerrain) btnTerrain.classList.toggle('active', state.terrain3D);

    const btnQuickHeaderTerrain = document.getElementById('btn-quick-3d-terrain');
    if (btnQuickHeaderTerrain) btnQuickHeaderTerrain.classList.toggle('active', state.terrain3D);

    const btn3D = document.getElementById('btn-toggle-3d');
    if (btn3D) btn3D.classList.toggle('active', state.buildings3D);

    const isGridOn = this.pikselLoader ? this.pikselLoader.isGridVisible() : false;
    const btnGrid = document.getElementById('btn-toggle-grid');
    if (btnGrid) btnGrid.classList.toggle('active', isGridOn);

    const btnSublayers = document.getElementById('btn-toggle-sublayers');
    if (btnSublayers) {
      const isAnyOverlayActive = state.contourLines || state.terrainHillshade;
      btnSublayers.classList.toggle('active', isAnyOverlayActive);
    }
  }
}
