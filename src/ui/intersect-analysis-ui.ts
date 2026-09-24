import * as maplibregl from 'maplibre-gl';
import { bbox } from '@turf/bbox';
import { GeoJsonLoader } from '../tools/geojson-loader';
import { SpatialAnalysisUI } from './spatial-analysis-ui';
import {
  SpatialIntersectAnalyzer,
  SpatialOverlayMode,
  IntersectAnalysisResult,
  BatchOverlayResult
} from '../tools/spatial-intersect';
import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';
import { logger } from '../utils/logger';

export class IntersectAnalysisUI {
  private map: maplibregl.Map;
  private geojsonLoader: GeoJsonLoader;
  private spatialAnalysisUI: SpatialAnalysisUI;
  private onLayersChangeCallback?: () => void;

  private activeResult: IntersectAnalysisResult | null = null;
  private activeBatchResult: BatchOverlayResult | null = null;
  private currentMode: SpatialOverlayMode = 'intersect';
  private selectedColor: string = '#00f0ff'; // Neon Cyan default for WebGIS dark theme
  private selectedOpacity: number = 0.70;
  private currentWizardStep: 1 | 2 | 3 = 1;

  public getActiveResult(): IntersectAnalysisResult | null {
    return this.activeResult;
  }

  public getActiveBatchResult(): BatchOverlayResult | null {
    return this.activeBatchResult;
  }

  public getCurrentWizardStep(): 1 | 2 | 3 {
    return this.currentWizardStep;
  }

  constructor(
    map: maplibregl.Map,
    geojsonLoader: GeoJsonLoader,
    spatialAnalysisUI: SpatialAnalysisUI,
    onLayersChange?: () => void
  ) {
    this.map = map;
    this.geojsonLoader = geojsonLoader;
    this.spatialAnalysisUI = spatialAnalysisUI;
    this.onLayersChangeCallback = onLayersChange;
  }

  public init() {
    this.initMapLayers();
    this.bindEvents();
    this.updateAOIStatusCard();
    this.updateLayerSelect();
    this.goToWizardStep(1);

    if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.onLayersChange === 'function') {
      this.spatialAnalysisUI.onLayersChange(() => {
        this.updateAOIStatusCard();
        this.updateLayerSelect();
      });
    }
  }

  public updateAOIStatusCard() {
    const card = document.getElementById('intersect-aoi-status-card');
    const icon = document.getElementById('intersect-aoi-icon');
    const label = document.getElementById('intersect-aoi-label');
    const sublabel = document.getElementById('intersect-aoi-sublabel');
    const activeAOI = this.spatialAnalysisUI?.getActiveAOIPolygon ? this.spatialAnalysisUI.getActiveAOIPolygon() : null;

    if (!card || !icon || !label || !sublabel) return;

    if (activeAOI) {
      card.classList.add('active');
      icon.innerText = '🇮🇩';
      const aoiName = activeAOI.properties?.name || 'Seluruh Wilayah Indonesia (Nasional)';
      label.innerText = aoiName.toLowerCase().includes('wilayah') ? aoiName : `Wilayah Acuan: ${aoiName}`;
      sublabel.innerText = 'Cakupan aktif: Menjangkau data bahaya bencana & fasilitas di seluruh Indonesia';
    } else {
      card.classList.add('active');
      icon.innerText = '🇮🇩';
      label.innerText = 'Seluruh Wilayah Indonesia (Nasional)';
      sublabel.innerText = 'Cakupan aktif: Menjangkau seluruh data bahaya & faskes dari Sabang sampai Merauke';
    }
  }

  public getAllMapLayerIds(): string[] {
    return [
      'intersect-result-fill',
      'intersect-result-line',
      'intersect-result-points',
      'intersect-hover-fill',
      'intersect-hover-line',
      'intersect-hover-points'
    ];
  }

  public restoreAfterStyleChange() {
    this.initMapLayers();
    if (this.activeResult && this.activeResult.data) {
      const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
      if (src && typeof src.setData === 'function') {
        src.setData(this.activeResult.data);
      }
    }
  }

  private initMapLayers() {
    if (!this.map || !this.map.getStyle()) return;

    try {
      // 1. Main Result Source & Layers
      if (!this.map.getSource('intersect-result-source')) {
        this.map.addSource('intersect-result-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!this.map.getLayer('intersect-result-fill')) {
        this.map.addLayer({
          id: 'intersect-result-fill',
          type: 'fill',
          source: 'intersect-result-source',
          filter: ['any', ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': this.selectedColor,
            'fill-opacity': this.selectedOpacity
          }
        });
      }

      if (!this.map.getLayer('intersect-result-line')) {
        this.map.addLayer({
          id: 'intersect-result-line',
          type: 'line',
          source: 'intersect-result-source',
          paint: {
            'line-color': '#ffffff',
            'line-width': 2.5,
            'line-opacity': 0.9,
            'line-dasharray': [3, 2]
          }
        });
      }

      if (!this.map.getLayer('intersect-result-points')) {
        this.map.addLayer({
          id: 'intersect-result-points',
          type: 'circle',
          source: 'intersect-result-source',
          filter: ['any', ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 7,
            'circle-color': this.selectedColor,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95
          }
        });
      }

      // 2. Interactive Hover Highlight Source & Layers
      if (!this.map.getSource('intersect-hover-source')) {
        this.map.addSource('intersect-hover-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!this.map.getLayer('intersect-hover-fill')) {
        this.map.addLayer({
          id: 'intersect-hover-fill',
          type: 'fill',
          source: 'intersect-hover-source',
          filter: ['any', ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#facc15',
            'fill-opacity': 0.65
          }
        });
      }

      if (!this.map.getLayer('intersect-hover-line')) {
        this.map.addLayer({
          id: 'intersect-hover-line',
          type: 'line',
          source: 'intersect-hover-source',
          paint: {
            'line-color': '#facc15',
            'line-width': 4,
            'line-opacity': 1
          }
        });
      }

      if (!this.map.getLayer('intersect-hover-points')) {
        this.map.addLayer({
          id: 'intersect-hover-points',
          type: 'circle',
          source: 'intersect-hover-source',
          filter: ['any', ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 11,
            'circle-color': '#facc15',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
          }
        });
      }
    } catch (err) {
      logger.warn('[IntersectAnalysisUI] Layer init warning:', err);
    }
  }

  public updateLayerSelect() {
    const selectA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
    const selectB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
    if (!selectA || !selectB) return;

    const valA = selectA.value;
    const valB = selectB.value;

    const layers = this.geojsonLoader.getLayers();
    const activeAOI = this.spatialAnalysisUI.getActiveAOIPolygon();

    let optionsHtmlA = '<option value="" disabled selected>Pilih lapisan wilayah acuan...</option>';
    let optionsHtmlB = '<option value="" disabled selected>Pilih lapisan target...</option>';

    if (activeAOI) {
      optionsHtmlA += '<option value="__aoi_active__">🎯 Wilayah Acuan Aktif (AOI / Poligon Gambaran)</option>';
      optionsHtmlB += '<option value="__aoi_active__">🎯 Wilayah Acuan Aktif (AOI / Poligon Gambaran)</option>';
    }

    optionsHtmlA += '<option value="__disaster_zones__">🚨 Zona Bahaya Bencana Se-Indonesia (InaRISK & PVMBG)</option>';
    optionsHtmlB += '<option value="__disaster_zones__">🚨 Zona Bahaya Bencana Se-Indonesia (InaRISK & PVMBG)</option>';
    optionsHtmlB += '<option value="__critical_facilities__">🏥 Fasilitas Kesehatan & Objek Vital Nasional (Kemenkes & OSM)</option>';
    optionsHtmlA += '<option value="__gee_stations__">🌡️ Stasiun Observasi MODIS LST (18 Titik Indonesia)</option>';
    optionsHtmlB += '<option value="__gee_stations__">🌡️ Stasiun Observasi MODIS LST (18 Titik Indonesia)</option>';
    optionsHtmlB += '<option value="__merapi_facilities__">🏥 Faskes & Sekolah Lereng Merapi (OSM & BNPB)</option>';
    optionsHtmlB += '<option value="__sample_cutter__">🛡️ Kawasan Bodetabek (Bidang Pemotong / Poligon)</option>';

    layers.forEach((l) => {
      const featCount = l.data.features.length;
      optionsHtmlA += `<option value="${l.id}">📁 ${l.name} (${featCount} fitur)</option>`;
      optionsHtmlB += `<option value="${l.id}">📁 ${l.name} (${featCount} fitur)</option>`;
    });

    selectA.innerHTML = optionsHtmlA;
    selectB.innerHTML = optionsHtmlB;

    if (valA && selectA.querySelector(`option[value="${valA}"]`)) {
      selectA.value = valA;
    } else if (activeAOI) {
      selectA.value = '__aoi_active__';
    } else if (layers.length > 0) {
      selectA.value = layers[0].id;
    }

    if (valB && selectB.querySelector(`option[value="${valB}"]`)) {
      selectB.value = valB;
    } else if (layers.length > 0 && layers[0].id !== selectA.value) {
      selectB.value = layers[0].id;
    } else if (layers.length > 1) {
      selectB.value = layers[1].id;
    } else {
      selectB.value = '__gee_stations__';
    }
  }

  private bindEvents() {
    // Wizard Navigation
    const updateWizardAreaActive = (activeId: string) => {
      document.querySelectorAll<HTMLElement>('.wizard-area-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === activeId);
      });
    };

    const btnWizardNext1 = document.getElementById('btn-wizard-next-1');
    const btnWizardBack2 = document.getElementById('btn-wizard-back-2');
    const btnWizardNext2 = document.getElementById('btn-wizard-next-2');
    const btnWizardBack3 = document.getElementById('btn-wizard-back-3');

    btnWizardNext1?.addEventListener('click', () => this.goToWizardStep(2));
    btnWizardBack2?.addEventListener('click', () => this.goToWizardStep(1));
    btnWizardNext2?.addEventListener('click', () => {
      this.updateWizardSummary();
      this.goToWizardStep(3);
    });
    btnWizardBack3?.addEventListener('click', () => this.goToWizardStep(2));

    const runBtn = document.getElementById('btn-run-intersect-analysis');
    const clearBtn = document.getElementById('btn-clear-intersect-analysis');
    const opacitySlider = document.getElementById('intersect-opacity-slider') as HTMLInputElement | null;
    const opacityVal = document.getElementById('intersect-opacity-val');
    const colorChips = document.querySelectorAll<HTMLButtonElement>('.intersect-color-chip');
    const customColorInput = document.getElementById('intersect-color-custom') as HTMLInputElement | null;

    // 0. Quick Step 1 AOI Setup (Preset or Freehand Drawing)
    const btnResetIndonesia = document.getElementById('btn-reset-indonesia-aoi');
    const btnSampleAOI = document.getElementById('btn-quick-sample-aoi');
    const btnDrawAOI = document.getElementById('btn-quick-draw-aoi');

    btnResetIndonesia?.addEventListener('click', () => {
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.clearAOI === 'function') {
        this.spatialAnalysisUI.clearAOI();
      }
      if (this.map && typeof this.map.flyTo === 'function') {
        this.map.flyTo({
          center: [118.0, -2.5],
          zoom: 4.8,
          duration: 1000
        });
      }
      this.updateAOIStatusCard();
      this.updateLayerSelect();

      const chipDisaster = document.getElementById('chip-target-disaster');
      updateActiveChip(chipDisaster);
      if (customSelectors) customSelectors.style.display = 'none';

      const opDescEl = document.getElementById('intersect-op-desc');
      if (opDescEl) {
        opDescEl.innerHTML = '🇮🇩 <strong>Cakupan Seluruh Indonesia:</strong> Mendeteksi seluruh zona bahaya bencana &amp; faskes di seluruh Indonesia!';
      }
      updateWizardAreaActive('btn-reset-indonesia-aoi');
      showToast('🇮🇩 Cakupan Wilayah: Seluruh Indonesia Aktif (Tanpa Batasan Poligon)', 'info');
    });

    btnSampleAOI?.addEventListener('click', () => {
      if (this.geojsonLoader.getLayers().length === 0) {
        this.geojsonLoader.loadSampleData();
      }
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.selectPresetRegion === 'function') {
        this.spatialAnalysisUI.selectPresetRegion('dki-jakarta');
      }
      this.updateAOIStatusCard();
      this.updateLayerSelect();

      const chipDisaster = document.getElementById('chip-target-disaster');
      updateActiveChip(chipDisaster);
      if (customSelectors) customSelectors.style.display = 'none';

      const opDescEl = document.getElementById('intersect-op-desc');
      if (opDescEl) {
        opDescEl.innerHTML = '🎯 <strong>Simulasi DKI Jakarta:</strong> Menganalisis zonasi bahaya banjir rob, amblesan pesisir Jakarta & fasilitas medis rujukan!';
      }
      showToast('🎯 Wilayah DKI Jakarta Aktif: Siap dianalisis terhadap Zona Bahaya Banjir Rob!', 'info');
    });

    const btnMerapiAOI = document.getElementById('btn-quick-merapi-aoi');
    btnMerapiAOI?.addEventListener('click', () => {
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.selectPresetRegion === 'function') {
        this.spatialAnalysisUI.selectPresetRegion('merapi-krb3');
      }
      this.updateAOIStatusCard();

      const chipDisaster = document.getElementById('chip-target-disaster');
      updateActiveChip(chipDisaster);
      if (customSelectors) customSelectors.style.display = 'none';

      // Set mode to intersect
      const intersectPill = document.querySelector('.intersect-op-btn[data-mode="intersect"]') as HTMLButtonElement | null;
      if (intersectPill) {
        opPills.forEach((p) => p.classList.remove('active'));
        intersectPill.classList.add('active');
        this.currentMode = 'intersect';
      }

      const opDescEl = document.getElementById('intersect-op-desc');
      if (opDescEl) {
        opDescEl.innerHTML = '🌋 <strong>Simulasi Bencana Merapi:</strong> Menghitung sekolah, puskesmas, dan posko yang berada di dalam zona bahaya awan panas KRB III Merapi!';
      }

      showToast('🌋 Simulasi Bencana Aktif: Zona Bahaya KRB III Merapi vs Sekolah & Fasilitas Medis!', 'info');
    });

    const btnBandungAOI = document.getElementById('btn-quick-bandung-aoi');
    btnBandungAOI?.addEventListener('click', () => {
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.selectPresetRegion === 'function') {
        this.spatialAnalysisUI.selectPresetRegion('cekungan-bandung');
      }
      this.updateAOIStatusCard();

      const chipDisaster = document.getElementById('chip-target-disaster');
      updateActiveChip(chipDisaster);
      if (customSelectors) customSelectors.style.display = 'none';

      const opDescEl = document.getElementById('intersect-op-desc');
      if (opDescEl) {
        opDescEl.innerHTML = '🏔️ <strong>Simulasi Sesar Lembang:</strong> Mendeteksi jalur patahan gempa aktif Sesar Lembang yang membelah wilayah Bandung Raya!';
      }
      showToast('🏔️ Wilayah Bandung Raya Aktif: Siap dianalisis terhadap Zona Sesar Lembang!', 'info');
    });

    const btnIknAOI = document.getElementById('btn-quick-ikn-aoi');
    btnIknAOI?.addEventListener('click', () => {
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.selectPresetRegion === 'function') {
        this.spatialAnalysisUI.selectPresetRegion('ikn-nusantara');
      }
      this.updateAOIStatusCard();

      const chipDisaster = document.getElementById('chip-target-disaster');
      updateActiveChip(chipDisaster);
      if (customSelectors) customSelectors.style.display = 'none';

      const opDescEl = document.getElementById('intersect-op-desc');
      if (opDescEl) {
        opDescEl.innerHTML = '🌲 <strong>Simulasi IKN Sepaku:</strong> Mendeteksi zona kerawanan kebakaran hutan & lahan gambut (Karhutla) di Sepaku IKN!';
      }
      showToast('🌲 Wilayah IKN Sepaku Aktif: Siap dianalisis terhadap Zona Kerentanan Bencana!', 'info');
    });

    btnDrawAOI?.addEventListener('click', () => {
      updateWizardAreaActive('btn-quick-draw-aoi');
      if (this.geojsonLoader.getLayers().length === 0) {
        this.geojsonLoader.loadSampleData();
      }
      if (this.spatialAnalysisUI && typeof this.spatialAnalysisUI.startDrawing === 'function') {
        this.spatialAnalysisUI.startDrawing();
      }
    });

    // 1. Operation Mode Pills (Intersect, Difference, Union, XOR)
    const opPills = document.querySelectorAll<HTMLButtonElement>('.intersect-op-btn');
    const chipDisaster = document.getElementById('chip-target-disaster');
    const chipFacilities = document.getElementById('chip-target-facilities');
    const chipCities = document.getElementById('chip-target-cities');
    const chipStations = document.getElementById('chip-target-stations');
    const chipMerapiFac = document.getElementById('chip-target-merapi-fac');
    const chipCutter = document.getElementById('chip-target-cutter');
    const chipAll = document.getElementById('chip-target-all');
    const chipCustom = document.getElementById('chip-target-custom');
    const customSelectors = document.getElementById('intersect-custom-selectors');

    const updateActiveChip = (targetBtn: HTMLElement | null) => {
      document.querySelectorAll('.intersect-target-chips .btn-chip').forEach((c) => c.classList.remove('active'));
      targetBtn?.classList.add('active');
    };

    opPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        opPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const mode = (pill.dataset.mode as SpatialOverlayMode) || 'intersect';
        this.currentMode = mode;
        const opDescEl = document.getElementById('intersect-op-desc');

        if (mode === 'difference' || mode === 'union' || mode === 'sym_difference') {
          // Point targets cannot be cut or unioned geometrically with polygons.
          // Auto-switch to polygon hazard or cutter target if a point target was active.
          const activeChip = document.querySelector('.intersect-target-chips .btn-chip.active') as HTMLElement | null;
          if (activeChip && (activeChip.id === 'chip-target-cities' || activeChip.id === 'chip-target-stations' || activeChip.id === 'chip-target-facilities')) {
            updateActiveChip(chipDisaster || chipCutter);
            if (customSelectors) customSelectors.style.display = 'none';
          }
        } else if (mode === 'intersect') {
          const activeChip = document.querySelector('.intersect-target-chips .btn-chip.active') as HTMLElement | null;
          if (activeChip && activeChip.id === 'chip-target-cutter') {
            updateActiveChip(chipDisaster || chipCities);
            if (customSelectors) customSelectors.style.display = 'none';
          }
        }

        if (opDescEl) {
          if (mode === 'intersect') {
            opDescEl.innerHTML = '⚔️ <strong>Irisan:</strong> Cari objek zona bahaya bencana, fasilitas publik/medis, atau stasiun di dalam batas wilayah.';
          } else if (mode === 'difference') {
            opDescEl.innerHTML = '✂️ <strong>Potong:</strong> Kurangi wilayah dengan memotong bagian yang bertabrakan dengan zona bahaya bencana atau bidang pemotong!';
          } else if (mode === 'union') {
            opDescEl.innerHTML = '🔗 <strong>Gabung:</strong> Satukan wilayah dengan zona bahaya atau bidang tetangga menjadi satu kesatuan poligon utuh!';
          } else if (mode === 'sym_difference') {
            opDescEl.innerHTML = '⚡ <strong>Beda:</strong> Ambil area unik kedua wilayah, sedangkan area tumpang tindih tengah dibuang!';
          }
        }
      });
    });

    // 2. Quick Target Selection Chips (Langkah 2)
    chipDisaster?.addEventListener('click', () => {
      updateActiveChip(chipDisaster);
      if (customSelectors) customSelectors.style.display = 'none';
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      if (selB) selB.value = '__disaster_zones__';
    });

    chipFacilities?.addEventListener('click', () => {
      updateActiveChip(chipFacilities);
      if (customSelectors) customSelectors.style.display = 'none';
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      if (selB) selB.value = '__critical_facilities__';
    });

    chipCities?.addEventListener('click', () => {
      updateActiveChip(chipCities);
      if (customSelectors) customSelectors.style.display = 'none';
      if (this.geojsonLoader.getLayers().length === 0) {
        this.geojsonLoader.loadSampleData();
      }
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      const layers = this.geojsonLoader.getLayers();
      if (selB && layers.length > 0) selB.value = layers[0].id;
    });

    chipStations?.addEventListener('click', () => {
      updateActiveChip(chipStations);
      if (customSelectors) customSelectors.style.display = 'none';
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      if (selB) selB.value = '__gee_stations__';
    });

    chipMerapiFac?.addEventListener('click', () => {
      updateActiveChip(chipMerapiFac);
      if (customSelectors) customSelectors.style.display = 'none';
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      if (selB) selB.value = '__merapi_facilities__';
    });

    chipCutter?.addEventListener('click', () => {
      updateActiveChip(chipCutter);
      if (customSelectors) customSelectors.style.display = 'none';
      const selA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
      const selB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;
      if (selA) selA.value = '__aoi_active__';
      if (selB) selB.value = '__sample_cutter__';
    });

    chipAll?.addEventListener('click', () => {
      updateActiveChip(chipAll);
      if (customSelectors) customSelectors.style.display = 'none';
    });

    chipCustom?.addEventListener('click', () => {
      updateActiveChip(chipCustom);
      if (customSelectors) customSelectors.style.display = 'flex';
    });

    runBtn?.addEventListener('click', () => this.runAnalysis());
    clearBtn?.addEventListener('click', () => this.clearAnalysis());

    opacitySlider?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const val = Number(target.value);
      this.selectedOpacity = val / 100;
      if (opacityVal) opacityVal.innerText = `${val}%`;

      if (this.map && this.map.getLayer('intersect-result-fill')) {
        this.map.setPaintProperty('intersect-result-fill', 'fill-opacity', this.selectedOpacity);
      }
    });

    colorChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        colorChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const color = chip.dataset.color || '#00f0ff';
        this.updateColor(color);
      });
    });

    customColorInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      colorChips.forEach((c) => c.classList.remove('active'));
      this.updateColor(target.value);
    });
  }

  private updateColor(color: string) {
    this.selectedColor = color;
    if (this.map && this.map.getLayer('intersect-result-fill')) {
      this.map.setPaintProperty('intersect-result-fill', 'fill-color', color);
    }
    if (this.map && this.map.getLayer('intersect-result-points')) {
      this.map.setPaintProperty('intersect-result-points', 'circle-color', color);
    }
  }

  public async runAnalysis() {
    const statusBox = document.getElementById('intersect-analysis-status');
    const activeChip = document.querySelector('.intersect-target-chips .btn-chip.active') as HTMLElement | null;
    const targetType = activeChip?.dataset.target || 'disaster-zones';

    // 0. Auto-ensure sample vector data is present if target is cities
    if (targetType === 'cities' && this.geojsonLoader.getLayers().length === 0) {
      this.geojsonLoader.loadSampleData();
      this.updateLayerSelect();
    }


    // 2. Batch Multi-Layer Mode
    if (targetType === 'all') {
      await this.runBatchAnalysis();
      return;
    }

    // 3. Standard Pair Overlay Mode
    const selectA = document.getElementById('intersect-layer-a') as HTMLSelectElement | null;
    const selectB = document.getElementById('intersect-layer-b') as HTMLSelectElement | null;

    let idA = selectA?.value || '__aoi_active__';
    let idB = selectB?.value || '__disaster_zones__';

    if (targetType === 'disaster-zones') {
      idA = '__aoi_active__';
      idB = '__disaster_zones__';
    } else if (targetType === 'facilities') {
      idA = '__aoi_active__';
      idB = '__critical_facilities__';
    } else if (targetType === 'cities') {
      idA = '__aoi_active__';
      const layers = this.geojsonLoader.getLayers();
      idB = layers.length > 0 ? layers[0].id : '__gee_stations__';
    } else if (targetType === 'stations') {
      idA = '__aoi_active__';
      idB = '__gee_stations__';
    } else if (targetType === 'cutter') {
      idA = '__aoi_active__';
      idB = '__sample_cutter__';
    } else if (targetType === 'merapi-facilities') {
      idA = '__aoi_active__';
      idB = '__merapi_facilities__';
    }

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.className = 'analysis-status-box';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="hud-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
          <span><strong>Mencari objek dalam wilayah (${SpatialIntersectAnalyzer.getModeLabel(this.currentMode)})...</strong></span>
        </div>
      `;
    }

    try {
      const [dataA, nameA] = await this.resolveLayerData(idA);
      const [dataB, nameB] = await this.resolveLayerData(idB);

      if (!dataB || !dataB.features || dataB.features.length === 0) {
        showToast(`Lapisan "${nameB}" tidak memiliki data yang valid.`, 'warning');
        if (statusBox) statusBox.style.display = 'none';
        return;
      }

      // If idA is active AOI and user did NOT draw any polygon,
      // it means: Nationwide coverage across all of Indonesia!
      if (idA === '__aoi_active__' && !dataA) {
        this.initMapLayers();
        const result = SpatialIntersectAnalyzer.wrapNationwideResult(dataB, nameB);
        this.activeResult = result;
        this.activeBatchResult = null;
        this.renderResults(result);

        const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
        if (src && typeof src.setData === 'function') {
          src.setData(dataB);
        }

        if (this.map && typeof this.map.flyTo === 'function') {
          this.map.flyTo({
            center: [118.0, -2.5],
            zoom: 4.8,
            duration: 1200
          });
        }

        showToast(`Ditemukan ${result.intersectedCount} objek dalam cakupan seluruh Indonesia!`, 'success');
        return;
      }

      if (!dataA || !dataA.features || dataA.features.length === 0) {
        showToast(`Lapisan "${nameA}" tidak memiliki data yang valid.`, 'warning');
        if (statusBox) statusBox.style.display = 'none';
        return;
      }

      this.initMapLayers();

      const result = SpatialIntersectAnalyzer.overlay(dataA, dataB, {
        mode: this.currentMode,
        layerAName: nameA,
        layerBName: nameB
      });

      this.activeResult = result;
      this.activeBatchResult = null;

      if (!result.success) {
        showToast(result.error || 'Gagal memproses overlay', 'error');
        if (statusBox) {
          statusBox.className = 'analysis-status-box warning';
          statusBox.innerHTML = `⚠️ <strong>Gagal:</strong> ${result.error || 'Tidak dapat memproses irisan.'}`;
        }
        return;
      }

      // Update map source
      const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
      if (src && typeof src.setData === 'function' && result.data) {
        src.setData(result.data);
      }

      this.renderResults(result);

      if (this.onLayersChangeCallback) {
        this.onLayersChangeCallback();
      }

      showToast(
        `${result.modeLabel} selesai: ${result.intersectedCount} fitur ditemukan!`,
        'success'
      );
      announceToScreenReader(
        `Analisis ${result.modeLabel} selesai. ${result.intersectedCount} fitur dengan total luas ${result.intersectedAreaKm2} kilometer persegi.`
      );
    } catch (err: any) {
      logger.error('[IntersectAnalysisUI] Execution error:', err);
      showToast(`Error: ${err?.message || 'Gagal memproses analisis'}`, 'error');
      if (statusBox) statusBox.style.display = 'none';
    }
  }

  private async runBatchAnalysis() {
    const statusBox = document.getElementById('intersect-analysis-status');
    const aoi = this.spatialAnalysisUI.getActiveAOIPolygon();

    if (!aoi) {
      showToast('Tentukan Wilayah Acuan terlebih dahulu untuk analisis multi-lapisan!', 'warning');
      document.getElementById('spatial-analysis-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const baseFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [aoi]
    };

    const targetLayers: { id: string; name: string; data: GeoJSON.FeatureCollection }[] = [];

    // Add Cities Layer
    const customLayers = this.geojsonLoader.getLayers();
    for (const l of customLayers) {
      targetLayers.push({ id: l.id, name: l.name, data: l.data });
    }

    // Add GEE Stations
    try {
      const res = await fetch('/data/gee_cfsv2_stations.geojson');
      if (res.ok) {
        const data = await res.json();
        targetLayers.push({ id: '__gee_stations__', name: 'Stasiun Observasi LST', data });
      }
    } catch (_) {}

    // Add Disaster Hazard Zones
    try {
      const res = await fetch('/data/indonesia_disaster_zones.geojson');
      if (res.ok) {
        const data = await res.json();
        targetLayers.push({ id: '__disaster_zones__', name: 'Zona Bahaya Bencana (InaRISK & PVMBG)', data });
      }
    } catch (_) {}

    // Add Critical Facilities
    try {
      const res = await fetch('/data/indonesia_critical_facilities.geojson');
      if (res.ok) {
        const data = await res.json();
        targetLayers.push({ id: '__critical_facilities__', name: 'Fasilitas Kritis & Faskes Nasional', data });
      }
    } catch (_) {}

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.className = 'analysis-status-box';
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="hud-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
          <span><strong>Menganalisis Wilayah Acuan terhadap ${targetLayers.length} lapisan aktif...</strong></span>
        </div>
      `;
    }

    const batchRes = SpatialIntersectAnalyzer.batchOverlay(baseFC, targetLayers, {
      mode: this.currentMode,
      layerAName: 'Wilayah Acuan'
    });

    this.activeBatchResult = batchRes;
    this.renderBatchResults(batchRes);
    showToast(`Analisis Multi-Lapisan selesai untuk ${targetLayers.length} layer!`, 'success');
  }

  private renderResults(result: IntersectAnalysisResult) {
    const statusBox = document.getElementById('intersect-analysis-status');
    if (!statusBox) return;

    statusBox.style.display = 'block';
    statusBox.className = 'analysis-status-box success';

    if (result.intersectedCount === 0) {
      statusBox.className = 'analysis-status-box warning';
      statusBox.innerHTML = `
        <div style="font-size: 11px;">
          <strong style="color: #facc15;">ℹ️ Tidak Ditemukan Hasil ${result.modeLabel}:</strong><br>
          Tidak ada bagian dari <strong>${result.layerBName}</strong> yang beririsan dengan <strong>${result.layerAName}</strong> (Disjoint).
        </div>
      `;
      return;
    }

    const warningHtml = result.warning
      ? `<div style="font-size: 10px; color: #facc15; margin-bottom: 6px; padding: 4px 6px; background: rgba(245, 158, 11, 0.1); border-radius: 4px;">⚠️ ${result.warning}</div>`
      : '';

    let areaMetricHtml = '';
    if (result.intersectedAreaKm2 > 0) {
      areaMetricHtml = `
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Luas Area Hasil (${result.modeLabel.split(' ')[0]})</span>
          <span class="intersect-metric-val" style="color: #00f0ff;">${result.intersectedAreaKm2.toLocaleString('id-ID')} km²</span>
          <span class="intersect-metric-sub">(${result.intersectedAreaHa.toLocaleString('id-ID')} ha · ${result.overlapPercentage}% dari ${result.layerAName})</span>
        </div>
      `;
    }

    // Category Thematic Breakdown Bars
    let catBreakdownHtml = '';
    if (result.categoryBreakdowns.length > 0) {
      const bars = result.categoryBreakdowns.map((cat) => `
        <div style="margin-bottom: 5px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
            <span style="font-weight: 600; color: #fff;">${cat.category}</span>
            <span style="color: #94a3b8;">${cat.count} objek · ${cat.percentage}%</span>
          </div>
          <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
            <div style="width: ${cat.percentage}%; height: 100%; background: ${cat.color}; border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `).join('');

      catBreakdownHtml = `
        <div style="margin-top: 10px; padding: 8px 10px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;">
          <span style="font-size: 10px; font-weight: 700; color: #00f0ff; text-transform: uppercase; letter-spacing: 0.3px; display: block; margin-bottom: 6px;">
            📊 Distribusi Tematik Kategori:
          </span>
          ${bars}
        </div>
      `;
    }

    // Interactive Summaries Table (with Hover Slicing & Click FlyTo)
    let tableHtml = '';
    if (result.featureSummaries.length > 0) {
      const rows = result.featureSummaries.slice(0, 15).map((f, idx) => {
        const areaBadge = f.areaKm2 ? `<span style="color: #00f0ff; font-size: 9.5px;">${f.areaKm2} km²</span>` : `<span style="color: var(--text-muted); font-size: 9.5px;">${f.type}</span>`;
        return `
          <tr class="intersect-table-row" data-idx="${idx}" style="cursor: pointer; transition: background 0.15s ease;">
            <td style="padding: 4px 6px; font-size: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${idx + 1}</td>
            <td style="padding: 4px 6px; font-size: 10px; font-weight: 600; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.06); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${f.name}</td>
            <td style="padding: 4px 6px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${areaBadge}</td>
          </tr>
        `;
      }).join('');

      tableHtml = `
        <div style="margin-top: 8px; max-height: 130px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; background: rgba(0,0,0,0.3);">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: rgba(255,255,255,0.05); font-size: 9.5px; color: var(--text-muted);">
                <th style="padding: 4px 6px;">#</th>
                <th style="padding: 4px 6px;">Nama Fitur</th>
                <th style="padding: 4px 6px; text-align: right;">Ukuran / Tipe</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        <span style="font-size: 9px; color: var(--text-muted); display: block; margin-top: 3px;">💡 Arahkan kursor ke baris tabel untuk menyorot geometri di peta.</span>
      `;
    }

    statusBox.innerHTML = `
      ${warningHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #00f0ff; font-size: 11px;">⚔️ Hasil ${result.modeLabel}:</strong>
        <span style="font-size: 9.5px; padding: 2px 8px; border-radius: 10px; background: rgba(0, 240, 255, 0.15); border: 1px solid rgba(0, 240, 255, 0.4); color: #00f0ff; font-weight: 600;">
          ${result.intersectedCount} Fitur Ditemukan
        </span>
      </div>

      <div class="intersect-metrics-grid">
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Jumlah Objek Ditemukan</span>
          <span class="intersect-metric-val" style="color: #4ade80;">${result.intersectedCount} Objek</span>
          <span class="intersect-metric-sub">${result.layerAName} ∩ ${result.layerBName}</span>
        </div>
        ${areaMetricHtml}
      </div>

      ${catBreakdownHtml}
      ${tableHtml}

      <div class="intersect-action-buttons-row" style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button id="btn-intersect-flyto" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Arahkan kamera peta ke cakupan hasil">
          <span>👁️ Fokuskan Peta</span>
        </button>
        <button id="btn-intersect-download-geojson" class="btn btn-outline btn-sm btn-export-geo" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Unduh GeoJSON">
          <span>📥 .GeoJSON</span>
        </button>
        <button id="btn-intersect-download-csv" class="btn btn-outline btn-sm btn-export-geo" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Unduh CSV">
          <span>📊 .CSV</span>
        </button>
        <button id="btn-intersect-download-kml" class="btn btn-outline btn-sm btn-export-geo" style="font-size: 10px; padding: 5px 6px; justify-content: center;" title="Unduh KML untuk Google Earth">
          <span>🌍 .KML</span>
        </button>
      </div>
    `;

    // Bind action buttons
    document.getElementById('btn-intersect-flyto')?.addEventListener('click', () => this.flyToResult());
    document.getElementById('btn-intersect-download-geojson')?.addEventListener('click', () => this.downloadGeoJSON());
    document.getElementById('btn-intersect-download-csv')?.addEventListener('click', () => this.downloadCSV());
    document.getElementById('btn-intersect-download-kml')?.addEventListener('click', () => this.downloadKML());

    // Bind interactive table row hover & click
    const tableRows = statusBox.querySelectorAll<HTMLTableRowElement>('.intersect-table-row');
    tableRows.forEach((row) => {
      const idx = Number(row.dataset.idx);
      const feat = result.data?.features[idx];

      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(0, 240, 255, 0.12)';
        if (feat) this.highlightFeatureOnMap(feat);
      });

      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
        this.clearHighlightOnMap();
      });

      row.addEventListener('click', () => {
        if (feat) this.flyToFeature(feat);
      });
    });
  }

  private renderBatchResults(batch: BatchOverlayResult) {
    const statusBox = document.getElementById('intersect-analysis-status');
    if (!statusBox) return;

    statusBox.style.display = 'block';
    statusBox.className = 'analysis-status-box success';

    const cards = batch.results.map((r) => {
      const count = r.result.intersectedCount;
      const areaVal = r.result.intersectedAreaKm2 > 0 ? `${r.result.intersectedAreaKm2} km²` : `${count} Fitur`;
      const badgeClass = count > 0 ? 'badge-success' : 'badge-muted';
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin-bottom: 4px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px;">
          <div>
            <div style="font-size: 10.5px; font-weight: 600; color: #fff;">${r.layerName}</div>
            <div style="font-size: 9px; color: var(--text-muted);">${r.result.layerAName} ∩ ${r.layerName}</div>
          </div>
          <span style="font-size: 10px; font-weight: 700; color: #00f0ff;" class="${badgeClass}">
            ${areaVal}
          </span>
        </div>
      `;
    }).join('');

    statusBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #00f0ff; font-size: 11px;">🌐 Hasil Multi-Lapisan (Batch Overlay):</strong>
        <span style="font-size: 9.5px; padding: 2px 8px; border-radius: 10px; background: rgba(0, 240, 255, 0.15); color: #00f0ff; font-weight: 600;">
          ${batch.totalLayersProcessed} Lapisan
        </span>
      </div>

      <div class="intersect-metrics-grid">
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Total Fitur Terkena</span>
          <span class="intersect-metric-val" style="color: #4ade80;">${batch.totalIntersectedCount} Objek</span>
          <span class="intersect-metric-sub">Diuji terhadap ${batch.baseLayerName}</span>
        </div>
        <div class="intersect-metric-box">
          <span class="intersect-metric-label">Total Luas Irisan</span>
          <span class="intersect-metric-val" style="color: #00f0ff;">${batch.totalIntersectedAreaKm2} km²</span>
          <span class="intersect-metric-sub">Akumulasi seluruh layer</span>
        </div>
      </div>

      <div style="margin-top: 10px;">
        ${cards}
      </div>
    `;
  }

  public highlightFeatureOnMap(feature: GeoJSON.Feature) {
    const src = this.map.getSource('intersect-hover-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }
  }

  public clearHighlightOnMap() {
    const src = this.map.getSource('intersect-hover-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  public flyToFeature(feature: GeoJSON.Feature) {
    if (!feature.geometry) return;
    try {
      const b = bbox(feature) as [number, number, number, number];
      this.map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]]
        ],
        { padding: 80, maxZoom: 14, duration: 1000 }
      );
      this.highlightFeatureOnMap(feature);
    } catch (e) {
      logger.warn('[IntersectAnalysisUI] flyToFeature error:', e);
    }
  }

  public clearAnalysis() {
    this.activeResult = null;
    this.activeBatchResult = null;
    const src = this.map.getSource('intersect-result-source') as maplibregl.GeoJSONSource;
    if (src && typeof src.setData === 'function') {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
    this.clearHighlightOnMap();

    const statusBox = document.getElementById('intersect-analysis-status');
    if (statusBox) {
      statusBox.style.display = 'none';
      statusBox.innerHTML = '';
    }

    showToast('Lapisan dan hasil analisis overlay telah dibersihkan.', 'info');
    if (this.onLayersChangeCallback) {
      this.onLayersChangeCallback();
    }
  }

  public flyToResult() {
    if (!this.activeResult || !this.activeResult.bbox) {
      showToast('Tidak ada batas cakupan wilayah hasil untuk difokuskan.', 'warning');
      return;
    }

    const b = this.activeResult.bbox;
    this.map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]]
      ],
      { padding: 60, maxZoom: 13, duration: 1200 }
    );
  }

  private downloadGeoJSON() {
    if (!this.activeResult || !this.activeResult.data) {
      showToast('Tidak ada data irisan untuk diunduh.', 'warning');
      return;
    }

    const str = JSON.stringify(this.activeResult.data, null, 2);
    const blob = new Blob([str], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overlay_${this.activeResult.mode}_${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Berkas GeoJSON hasil overlay berhasil diunduh!', 'success');
  }

  private downloadCSV() {
    if (!this.activeResult || !this.activeResult.featureSummaries || this.activeResult.featureSummaries.length === 0) {
      showToast('Tidak ada ringkasan fitur untuk diunduh sebagai CSV.', 'warning');
      return;
    }

    const headers = ['No', 'Nama Fitur', 'Tipe Geometri', 'Kategori', 'Luas (km2)', 'Luas (Ha)', 'Lapisan Basis', 'Lapisan Target'];
    const rows = this.activeResult.featureSummaries.map((f, i) => [
      i + 1,
      `"${f.name.replace(/"/g, '""')}"`,
      f.type,
      `"${(f.category || 'Umum').replace(/"/g, '""')}"`,
      f.areaKm2 || 0,
      f.areaHa || 0,
      `"${f.layerA.replace(/"/g, '""')}"`,
      `"${f.layerB.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overlay_summary_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Ringkasan overlay CSV berhasil diunduh!', 'success');
  }

  private downloadKML() {
    if (!this.activeResult || !this.activeResult.data) {
      showToast('Tidak ada data overlay untuk diunduh.', 'warning');
      return;
    }

    try {
      import('../utils/kml-exporter').then(({ geoJsonToKml, downloadKml }) => {
        const title = `${this.activeResult?.modeLabel}: ${this.activeResult?.layerAName} x ${this.activeResult?.layerBName}`;
        const kmlString = geoJsonToKml(this.activeResult!.data!, title);
        downloadKml(kmlString, `overlay_${Date.now()}.kml`);
        showToast('Hasil overlay KML berhasil diunduh!', 'success');
      });
    } catch {
      showToast('Gagal memproses ekspor KML.', 'error');
    }
  }

  private async resolveLayerData(id: string): Promise<[GeoJSON.FeatureCollection | null, string]> {
    if (id === '__aoi_active__') {
      const aoi = this.spatialAnalysisUI?.getActiveAOIPolygon ? this.spatialAnalysisUI.getActiveAOIPolygon() : null;
      if (aoi) {
        return [
          {
            type: 'FeatureCollection',
            features: [aoi]
          },
          aoi.properties?.name || 'Wilayah Gambaran Aktif'
        ];
      }
      return [null, '🇮🇩 Seluruh Wilayah Indonesia (Nasional)'];
    }

    if (id === '__disaster_zones__') {
      try {
        const res = await fetch('/data/indonesia_disaster_zones.geojson');
        if (!res.ok) throw new Error('Failed to fetch disaster zones');
        const data = await res.json();
        return [data, 'Zona Bahaya Bencana Se-Indonesia'];
      } catch (err) {
        logger.error('[IntersectAnalysisUI] Failed to load disaster zones:', err);
        return [null, 'Zona Bahaya Bencana Se-Indonesia'];
      }
    }

    if (id === '__critical_facilities__') {
      try {
        const res = await fetch('/data/indonesia_critical_facilities.geojson');
        if (!res.ok) throw new Error('Failed to fetch critical facilities');
        const data = await res.json();
        return [data, 'Faskes & Fasilitas Kritis Nasional'];
      } catch (err) {
        logger.error('[IntersectAnalysisUI] Failed to load critical facilities:', err);
        return [null, 'Faskes & Fasilitas Kritis Nasional'];
      }
    }

    if (id === '__gee_stations__') {
      try {
        const res = await fetch('/data/gee_cfsv2_stations.geojson');
        if (!res.ok) throw new Error('Failed to fetch stations');
        const data = await res.json();
        return [data, 'Stasiun Observasi MODIS LST'];
      } catch (err) {
        logger.error('[IntersectAnalysisUI] Failed to load stations:', err);
        return [null, 'Stasiun Observasi MODIS LST'];
      }
    }

    if (id === '__merapi_facilities__') {
      try {
        const res = await fetch('/data/merapi_public_facilities.geojson');
        if (!res.ok) throw new Error('Failed to fetch Merapi facilities');
        const data = await res.json();
        return [data, 'Faskes & Sekolah Lereng Merapi'];
      } catch (err) {
        logger.error('[IntersectAnalysisUI] Failed to load Merapi facilities:', err);
        return [null, 'Faskes & Sekolah Lereng Merapi'];
      }
    }

    if (id === '__merapi_hazard__') {
      try {
        const res = await fetch('/data/merapi_hazard_zone.geojson');
        if (!res.ok) throw new Error('Failed to fetch Merapi hazard zone');
        const data = await res.json();
        return [data, 'KRB III Gunung Merapi (Zona Merah)'];
      } catch (err) {
        logger.error('[IntersectAnalysisUI] Failed to load Merapi hazard zone:', err);
        return [null, 'KRB III Gunung Merapi (Zona Merah)'];
      }
    }

    if (id === '__sample_cutter__') {
      const cutterPolygon: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Kawasan Bodetabek (Bidang Pemotong)',
              category: 'Kawasan Pembanding / Pemotong'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [106.82, -6.08],
                [107.15, -6.08],
                [107.15, -6.38],
                [106.82, -6.38],
                [106.82, -6.08]
              ]]
            }
          }
        ]
      };
      return [cutterPolygon, 'Kawasan Bodetabek (Bidang Pemotong)'];
    }

    const layer = this.geojsonLoader.getLayer(id);
    if (layer) {
      return [layer.data, layer.name];
    }

    return [null, 'Lapisan'];
  }

  private goToWizardStep(step: 1 | 2 | 3): void {
    this.currentWizardStep = step;

    document.querySelectorAll<HTMLElement>('.intersect-wizard-panel').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });

    const target = document.getElementById(`intersect-step-${step}`);
    if (target) {
      target.classList.add('active');
      target.style.display = 'block';
    }

    document.querySelectorAll<HTMLElement>('.wizard-step-item').forEach(item => {
      const itemStep = parseInt(item.dataset.step || '0');
      item.classList.toggle('active', itemStep === step);
      item.classList.toggle('done', itemStep < step);
    });

    document.querySelectorAll<HTMLElement>('.wizard-step-line').forEach((line, i) => {
      line.classList.toggle('done', i + 1 < step);
    });
  }

  private updateWizardSummary(): void {
    const areaEl = document.getElementById('intersect-aoi-label');
    const areaText = areaEl?.innerText || 'Seluruh Indonesia';

    const activeChip = document.querySelector<HTMLElement>('.intersect-target-chips .btn-chip.active');
    const titleEl = activeChip?.querySelector<HTMLElement>('.target-card-title');
    const targetText = titleEl?.textContent?.trim() || 'Zona Bahaya Bencana';

    const activeOpBtn = document.querySelector<HTMLElement>('.intersect-op-btn.active');
    const modeKey = (activeOpBtn as HTMLButtonElement | null)?.dataset.mode || 'intersect';
    const modeLabels: Record<string, string> = {
      intersect: 'Temukan objek di dalam wilayah',
      difference: 'Potong & hapus area yang tumpang tindih',
      union: 'Gabungkan kedua area jadi satu',
      sym_difference: 'Ambil area unik, buang yang tumpang tindih'
    };

    const elArea = document.getElementById('summary-area-label');
    const elTarget = document.getElementById('summary-target-label');
    const elMode = document.getElementById('summary-mode-label');
    if (elArea) elArea.textContent = areaText;
    if (elTarget) elTarget.textContent = targetText;
    if (elMode) elMode.textContent = modeLabels[modeKey] || 'Temukan objek di dalam wilayah';
  }
}
