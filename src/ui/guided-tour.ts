import { MapManager } from '../map/map-manager';
import { PikselLoader } from '../tools/piksel-loader';
import { GEELoader } from '../tools/gee-loader';
import { BasemapCustomizer } from '../tools/basemap-customizer';
import { SidebarUI } from './sidebar';
import { showToast } from './toast';

export interface TourStep {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  action: () => Promise<void> | void;
}

export class GuidedTourUI {
  private mapManager: MapManager;
  private pikselLoader: PikselLoader | null;
  private geeLoader: GEELoader | null;
  private basemapCustomizer: BasemapCustomizer | null;
  private sidebarUI: SidebarUI;
  private currentStepIndex: number = 0;
  private isTourActive: boolean = false;
  private overlayEl: HTMLElement | null = null;

  constructor(
    mapManager: MapManager,
    pikselLoader: PikselLoader | null,
    geeLoader: GEELoader | null,
    basemapCustomizer: BasemapCustomizer | null,
    sidebarUI: SidebarUI
  ) {
    this.mapManager = mapManager;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.basemapCustomizer = basemapCustomizer;
    this.sidebarUI = sidebarUI;
  }

  public getSteps(): TourStep[] {
    return [
      {
        id: 1,
        badge: '1. CITRA SATELIT 10M',
        title: 'Sentinel-2 GeoMAD (Bromo Tengger Semeru)',
        subtitle: 'Layanan OGC WMS Open Data Cube BIG',
        description: 'Satelit Sentinel-2 MSI merekam data reflektansi optik resolusi 10m. Badan Informasi Geospasial (BIG) memproses komposit tahunan bebas awan (GeoMAD) di atas kaldera lautan pasir Bromo.',
        tags: ['Resolusi 10m', 'Bebas Awan (GeoMAD)', 'Badan Informasi Geospasial'],
        action: async () => {
          const map = this.mapManager.getMap();
          if (!map) return;

          // Set optimal basemap
          if (this.mapManager.getCurrentBasemapId() !== 'esri-imagery') {
            this.mapManager.setBasemap('esri-imagery');
          }

          // Disable other layers
          this.geeLoader?.clearAllLayers();
          if (this.basemapCustomizer) {
            this.basemapCustomizer.toggle3DTerrain(false, false);
          }

          // Activate Sentinel-2 True Color
          this.pikselLoader?.setActiveProduct('s2-geomad-rgb');
          this.sidebarUI.setActiveTab('piksel');

          // Fly camera to Bromo
          map.flyTo({
            center: [112.9485, -7.9514],
            zoom: 12.2,
            pitch: 35,
            bearing: 15,
            duration: 1800,
            essential: true
          });
        }
      },
      {
        id: 2,
        badge: '2. ANALISIS TERMAL GEE',
        title: 'Urban Heat Island Jakarta vs Bogor',
        subtitle: 'Google Earth Engine & MODIS Land Surface Temperature',
        description: 'Pemodelan Google Earth Engine memetakan pulau bahang perkotaan (UHI). Amati kontras suhu permukaan (+9.25°C) antara pusat urban Jakarta Monas (33.85°C) vs kawasan pedesaan sejuk Bogor (24.60°C).',
        tags: ['MODIS LST 1km', 'UHI Delta +9.25°C', 'Stasiun Observasi POI'],
        action: async () => {
          const map = this.mapManager.getMap();
          if (!map) return;

          // Clear Piksel raster
          this.pikselLoader?.setActiveProduct(null);
          if (this.basemapCustomizer) {
            this.basemapCustomizer.toggle3DTerrain(false, false);
          }

          // Load GEE and enable LST & POI
          if (this.geeLoader) {
            await this.geeLoader.loadGEEDatasets();
            this.geeLoader.toggleLayer('lst', true);
            this.geeLoader.toggleLayer('poi', true);
            this.geeLoader.toggleLayer('elevation', false);
            this.geeLoader.toggleLayer('landcover', false);
          }

          this.sidebarUI.setActiveTab('gee');

          // Fly camera to Jakarta/Jabodetabek
          map.flyTo({
            center: [106.8456, -6.2088],
            zoom: 10.8,
            pitch: 0,
            bearing: 0,
            duration: 1800,
            essential: true
          });
        }
      },
      {
        id: 3,
        badge: '3. TOPOGRAFI & 3D TERRAIN',
        title: 'Elevasi Medan 3D & Ekstrusi Bangunan (Bandung)',
        subtitle: 'Mesh 3D Terrarium & Ekstrusi Vektor WebGL2',
        description: 'Peta dirender dalam perspektif 3D WebGL dengan elevasi mesh topografi AWS Terrarium dan ekstrusi volume gedung nyata OpenFreeMap di kawasan perkotaan Bandung dengan latar belakang lereng Cekungan Bandung.',
        tags: ['3D WebGL2', 'Mesh Elevasi 30m', 'Ekstrusi Gedung 3D', 'Zoom Detail Z14.8'],
        action: async () => {
          const map = this.mapManager.getMap();
          if (!map) return;

          // Clear GEE layers & Piksel layers
          this.geeLoader?.clearAllLayers();
          this.pikselLoader?.setActiveProduct(null);

          // Enable 3D Terrain & 3D buildings WITHOUT overriding flyTo pitch/bearing
          if (this.basemapCustomizer) {
            this.basemapCustomizer.toggle3DTerrain(true, false);
            this.basemapCustomizer.setTerrainExaggeration(1.8);
            this.basemapCustomizer.toggleTerrainHillshade(true);
            this.basemapCustomizer.toggle3DBuildings(true);
          }

          this.sidebarUI.setActiveTab('map');

          // Fly camera directly to Bandung Urban Core (Gedung Sate & Asia Afrika high-density 3D cluster)
          map.flyTo({
            center: [107.6186, -6.9024],
            zoom: 14.8,
            pitch: 62,
            bearing: -20,
            duration: 2000,
            essential: true
          });
        }
      }
    ];
  }

  public async startTour(): Promise<void> {
    this.isTourActive = true;
    this.currentStepIndex = 0;
    this.renderTourCard();
    showToast('🚀 Tur Jelajah Nusantara dimulai (3 Langkah)', 'info');
    await this.executeCurrentStep();
  }

  public endTour() {
    this.isTourActive = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    showToast('🎉 Tur selesai! Selamat mengeksplorasi seluruh fitur WebGIS.', 'success');
  }

  private async executeCurrentStep(): Promise<void> {
    const steps = this.getSteps();
    const currentStep = steps[this.currentStepIndex];
    if (!currentStep) return;

    this.renderTourCard();
    try {
      await currentStep.action();
    } catch (_) {}
  }

  public async nextStep(): Promise<void> {
    const steps = this.getSteps();
    if (this.currentStepIndex < steps.length - 1) {
      this.currentStepIndex++;
      this.renderTourCard();
      await this.executeCurrentStep();
    } else {
      this.endTour();
    }
  }

  public async prevStep(): Promise<void> {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.renderTourCard();
      await this.executeCurrentStep();
    }
  }

  private renderTourCard() {
    if (!this.isTourActive) return;

    const steps = this.getSteps();
    const step = steps[this.currentStepIndex];
    const isFirst = this.currentStepIndex === 0;
    const isLast = this.currentStepIndex === steps.length - 1;

    let existingCard = document.getElementById('webgis-tour-card');
    if (!existingCard) {
      this.overlayEl = document.createElement('div');
      this.overlayEl.id = 'webgis-tour-card';
      this.overlayEl.className = 'webgis-tour-card';
      this.overlayEl.setAttribute('role', 'dialog');
      this.overlayEl.setAttribute('aria-label', 'Tur Demo Interaktif');
      document.body.appendChild(this.overlayEl);
      existingCard = this.overlayEl;
    }

    const dotsHtml = steps.map((_, idx) => `
      <span class="tour-dot ${idx === this.currentStepIndex ? 'active' : ''}"></span>
    `).join('');

    const tagsHtml = step.tags.map(t => `
      <span class="tour-tag">${t}</span>
    `).join('');

    existingCard.innerHTML = `
      <div class="tour-header">
        <div class="tour-badge-wrap">
          <span class="tour-step-badge">${step.badge}</span>
          <span class="tour-counter">${this.currentStepIndex + 1} dari ${steps.length}</span>
        </div>
        <button id="btn-tour-close" class="tour-close-btn" title="Tutup Tur" aria-label="Tutup tur demo">✕</button>
      </div>

      <div class="tour-body">
        <h3 class="tour-title">${step.title}</h3>
        <span class="tour-subtitle">${step.subtitle}</span>
        <p class="tour-desc">${step.description}</p>
        <div class="tour-tags-row">
          ${tagsHtml}
        </div>
      </div>

      <div class="tour-footer">
        <div class="tour-dots-row">
          ${dotsHtml}
        </div>
        <div class="tour-actions">
          ${!isFirst ? `
            <button id="btn-tour-prev" class="btn-tour-action secondary" aria-label="Langkah sebelumnya">
              ← Kembali
            </button>
          ` : ''}
          <button id="btn-tour-next" class="btn-tour-action primary" aria-label="${isLast ? 'Selesaikan tur' : 'Lanjut ke langkah berikutnya'}">
            ${isLast ? '✓ Selesai Jelajah' : 'Lanjut →'}
          </button>
        </div>
      </div>
    `;

    // Bind event listeners
    document.getElementById('btn-tour-close')?.addEventListener('click', () => this.endTour());
    document.getElementById('btn-tour-prev')?.addEventListener('click', () => this.prevStep());
    document.getElementById('btn-tour-next')?.addEventListener('click', () => this.nextStep());
  }
}
