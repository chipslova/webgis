import { BasemapCustomizer, VectorSublayerKey } from '../tools/basemap-customizer';
import { showToast } from './toast';

export class BasemapCustomizerUI {
  private customizer: BasemapCustomizer;
  private containerId: string = 'basemap-customizer-container';

  constructor(customizer: BasemapCustomizer) {
    this.customizer = customizer;
    this.init();
  }

  public init() {
    this.render();
    this.bindEvents();

    this.customizer.onChange(() => {
      this.syncUI();
    });
  }

  public render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const state = this.customizer.getState();

    container.innerHTML = `
      <div class="customizer-section-card">
        <!-- 3D TERRAIN & ELEVATION -->
        <div class="customizer-group-header">
          <div class="customizer-group-title">
            <span class="customizer-icon">⛰️</span>
            <strong>3D Terrain & Model Elevasi</strong>
          </div>
          <span class="customizer-badge-3d">WebGL Mesh</span>
        </div>

        <div class="customizer-item-row">
          <div class="customizer-label-wrap">
            <span class="customizer-item-label">3D Terrain Elevation Mesh</span>
            <span class="customizer-item-sub">Elevasi 3D topografi bumi (Terrarium DEM)</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-3d-terrain" ${state.terrain3D ? 'checked' : ''} />
            <span class="slider round"></span>
          </label>
        </div>

        <div class="customizer-slider-wrap" id="terrain-exaggeration-wrap" style="${state.terrain3D ? '' : 'opacity: 0.5; pointer-events: none;'}">
          <div class="customizer-slider-header">
            <span class="customizer-slider-label">Eksagerasi Elevasi 3D</span>
            <span class="customizer-slider-val" id="val-terrain-exaggeration">${state.terrainExaggeration.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            id="slider-terrain-exaggeration"
            min="0.5"
            max="3.0"
            step="0.1"
            value="${state.terrainExaggeration}"
            class="piksel-slider"
          />
        </div>

        <div class="customizer-item-row" style="margin-top: 8px;">
          <div class="customizer-label-wrap">
            <span class="customizer-item-label">3D Extruded Buildings</span>
            <span class="customizer-item-sub">Bangunan timbul 3D berdasarkan ketinggian meter</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-3d-buildings" ${state.buildings3D ? 'checked' : ''} />
            <span class="slider round"></span>
          </label>
        </div>

        <!-- GLOBAL OVERLAYS -->
        <div class="customizer-divider"></div>
        <div class="customizer-group-header">
          <div class="customizer-group-title">
            <span class="customizer-icon">🌐</span>
            <strong>Global Overlays (Lapisan Tambahan)</strong>
          </div>
        </div>

        <div class="customizer-item-row">
          <div class="customizer-label-wrap">
            <span class="customizer-item-label">Garis Kontur DEM (Contour Lines)</span>
            <span class="customizer-item-sub">Isolines elevasi topografi di atas basemap</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-contour-lines" ${state.contourLines ? 'checked' : ''} />
            <span class="slider round"></span>
          </label>
        </div>

        <div class="customizer-item-row">
          <div class="customizer-label-wrap">
            <span class="customizer-item-label">Terrain Hillshade Relief</span>
            <span class="customizer-item-sub">Bayangan tekstur relief pegunungan</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-terrain-hillshade" ${state.terrainHillshade ? 'checked' : ''} />
            <span class="slider round"></span>
          </label>
        </div>

        <!-- VECTOR SUBLAYERS -->
        <div class="customizer-divider"></div>
        <div class="customizer-group-header">
          <div class="customizer-group-title">
            <span class="customizer-icon">🎨</span>
            <strong>Sublayer Vektor Basemap</strong>
          </div>
          <div class="customizer-actions-mini">
            <button class="btn-micro" id="btn-sublayers-all-on" title="Nyalakan semua sublayer">Semua</button>
            <button class="btn-micro btn-micro-mute" id="btn-sublayers-all-off" title="Matikan semua sublayer untuk peta bersih">Mute</button>
          </div>
        </div>

        <div class="customizer-sublayers-grid">
          ${this.renderSublayerItem('poi', '📍 Points of Interest', 'Fasilitas umum & amenitas', state.sublayers.poi)}
          ${this.renderSublayerItem('road_names', '🛣️ Nama Jalan', 'Label nama jalan & highway', state.sublayers.road_names)}
          ${this.renderSublayerItem('place_names', '🏙️ Nama Tempat', 'Label kota, desa & wilayah', state.sublayers.place_names)}
          ${this.renderSublayerItem('admin_boundaries', '🗺️ Batas Wilayah', 'Batas provinsi, kab/kota, negara', state.sublayers.admin_boundaries)}
          ${this.renderSublayerItem('landcover', '🌲 Tutupan Lahan', 'Area hutan, taman, vegetasi', state.sublayers.landcover)}
          ${this.renderSublayerItem('water', '🌊 Badan Air', 'Sungai, danau, laut', state.sublayers.water)}
          ${this.renderSublayerItem('buildings', '🏢 Bangunan', 'Footprint bangunan 2D', state.sublayers.buildings)}
          ${this.renderSublayerItem('roads', '🚗 Jaringan Jalan', 'Garis jalan & transportasi', state.sublayers.roads)}
        </div>
      </div>
    `;
  }

  private renderSublayerItem(key: VectorSublayerKey, title: string, subtitle: string, checked: boolean): string {
    return `
      <div class="sublayer-item-card">
        <div class="sublayer-info">
          <span class="sublayer-name">${title}</span>
          <span class="sublayer-desc">${subtitle}</span>
        </div>
        <label class="switch switch-sm">
          <input type="checkbox" class="toggle-sublayer-input" data-key="${key}" ${checked ? 'checked' : ''} />
          <span class="slider round"></span>
        </label>
      </div>
    `;
  }

  private bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 1. 3D Terrain toggle
    const toggle3D = document.getElementById('toggle-3d-terrain') as HTMLInputElement;
    toggle3D?.addEventListener('change', () => {
      this.customizer.toggle3DTerrain(toggle3D.checked);
      if (toggle3D.checked) {
        showToast('Mode 3D Terrain Elevation diaktifkan!', 'info');
      }
      this.syncUI();
    });

    // 2. Terrain Exaggeration Slider
    const exagSlider = document.getElementById('slider-terrain-exaggeration') as HTMLInputElement;
    exagSlider?.addEventListener('input', () => {
      const val = parseFloat(exagSlider.value);
      this.customizer.setTerrainExaggeration(val);
      const valEl = document.getElementById('val-terrain-exaggeration');
      if (valEl) valEl.innerText = `${val.toFixed(1)}×`;
    });

    // 3. 3D Buildings
    const toggleBuildings = document.getElementById('toggle-3d-buildings') as HTMLInputElement;
    toggleBuildings?.addEventListener('change', () => {
      this.customizer.toggle3DBuildings(toggleBuildings.checked);
      if (toggleBuildings.checked) {
        showToast('3D Extruded Buildings aktif (Perbesar peta untuk melihat)', 'info');
      }
    });

    // 4. Contour Lines
    const toggleContours = document.getElementById('toggle-contour-lines') as HTMLInputElement;
    toggleContours?.addEventListener('change', () => {
      this.customizer.toggleContourLines(toggleContours.checked);
      showToast(toggleContours.checked ? 'Garis Kontur DEM ditampilkan' : 'Garis Kontur DEM disembunyikan', 'info');
    });

    // 5. Terrain Hillshade
    const toggleHillshade = document.getElementById('toggle-terrain-hillshade') as HTMLInputElement;
    toggleHillshade?.addEventListener('change', () => {
      this.customizer.toggleTerrainHillshade(toggleHillshade.checked);
      showToast(toggleHillshade.checked ? 'Terrain Hillshade aktif' : 'Terrain Hillshade nonaktif', 'info');
    });

    // 6. Vector Sublayers Individual Toggles
    const sublayerInputs = container.querySelectorAll<HTMLInputElement>('.toggle-sublayer-input');
    sublayerInputs.forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.key as VectorSublayerKey;
        if (key) {
          this.customizer.toggleSublayer(key, input.checked);
        }
      });
    });

    // 7. Bulk Sublayer Action Buttons
    const btnAllOn = document.getElementById('btn-sublayers-all-on');
    btnAllOn?.addEventListener('click', () => {
      this.customizer.setAllSublayers(true);
      showToast('Semua sublayer vektor diaktifkan', 'info');
      this.syncUI();
    });

    const btnAllOff = document.getElementById('btn-sublayers-all-off');
    btnAllOff?.addEventListener('click', () => {
      this.customizer.setAllSublayers(false);
      showToast('Peta Bersih diaktifkan (semua sublayer dimatikan)', 'info');
      this.syncUI();
    });
  }

  public syncUI() {
    const state = this.customizer.getState();

    const toggle3D = document.getElementById('toggle-3d-terrain') as HTMLInputElement;
    if (toggle3D) toggle3D.checked = state.terrain3D;

    const exagWrap = document.getElementById('terrain-exaggeration-wrap');
    if (exagWrap) {
      exagWrap.style.opacity = state.terrain3D ? '1' : '0.5';
      exagWrap.style.pointerEvents = state.terrain3D ? 'auto' : 'none';
    }

    const exagSlider = document.getElementById('slider-terrain-exaggeration') as HTMLInputElement;
    if (exagSlider) exagSlider.value = String(state.terrainExaggeration);

    const valEl = document.getElementById('val-terrain-exaggeration');
    if (valEl) valEl.innerText = `${state.terrainExaggeration.toFixed(1)}×`;

    const toggleBuildings = document.getElementById('toggle-3d-buildings') as HTMLInputElement;
    if (toggleBuildings) toggleBuildings.checked = state.buildings3D;

    const toggleContours = document.getElementById('toggle-contour-lines') as HTMLInputElement;
    if (toggleContours) toggleContours.checked = state.contourLines;

    const toggleHillshade = document.getElementById('toggle-terrain-hillshade') as HTMLInputElement;
    if (toggleHillshade) toggleHillshade.checked = state.terrainHillshade;

    const sublayerInputs = document.querySelectorAll<HTMLInputElement>('.toggle-sublayer-input');
    sublayerInputs.forEach(input => {
      const key = input.dataset.key as VectorSublayerKey;
      if (key && state.sublayers[key] !== undefined) {
        input.checked = state.sublayers[key];
      }
    });

    // Also sync the quick-access 3D Terrain button in map controls
    const quick3DBtn = document.getElementById('btn-quick-3d-terrain');
    if (quick3DBtn) {
      quick3DBtn.classList.toggle('active', state.terrain3D);
    }
  }
}
