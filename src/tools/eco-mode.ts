import * as maplibregl from 'maplibre-gl';
import { showToast } from '../ui/toast';
import { announceToScreenReader } from '../utils/a11y';
import { logger } from '../utils/logger';

export interface HardwareProfile {
  isLowSpec: boolean;
  cores: number;
  memoryGb?: number;
  gpuRenderer?: string;
  isMobileTouch: boolean;
  batteryLow?: boolean;
}

export class EcoModeManager {
  private map: maplibregl.Map;
  private basemapCustomizerRef?: any;
  private isEcoActive: boolean = false;
  private changeCallbacks: Array<(active: boolean) => void> = [];
  private hardwareProfile: HardwareProfile;

  constructor(map: maplibregl.Map, basemapCustomizer?: any) {
    this.map = map;
    this.basemapCustomizerRef = basemapCustomizer;
    this.hardwareProfile = this.detectHardwareProfile();

    // Check stored preference or auto-detect
    try {
      const stored = localStorage.getItem('webgis_eco_mode');
      if (stored !== null) {
        if (stored === 'true') {
          this.enableEcoMode(false); // quiet init
        }
      } else if (this.hardwareProfile.isLowSpec || this.hardwareProfile.batteryLow) {
        // Auto-enable for low-spec or low battery devices on first visit
        this.enableEcoMode(true);
      }
    } catch (_) {}
  }

  public setBasemapCustomizer(customizer: any) {
    this.basemapCustomizerRef = customizer;
  }

  public detectHardwareProfile(): HardwareProfile {
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    const memoryGb = typeof navigator !== 'undefined' ? ((navigator as any).deviceMemory || 8) : 8;
    const isMobileTouch = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

    let gpuRenderer = 'Standard WebGL GPU';
    let isLowGpu = false;

    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'WebGL';
            const rLower = gpuRenderer.toLowerCase();
            if (
              rLower.includes('mali') ||
              rLower.includes('swiftshader') ||
              rLower.includes('llvmpipe') ||
              rLower.includes('basic render') ||
              rLower.includes('adreno (tm) 3') ||
              rLower.includes('adreno (tm) 505') ||
              rLower.includes('intel hd graphics 3000') ||
              rLower.includes('intel hd graphics 4000')
            ) {
              isLowGpu = true;
            }
          }
        }
      } catch (_) {}
    }

    const isLowSpec = cores <= 2 || memoryGb <= 2 || isLowGpu;

    return {
      isLowSpec,
      cores,
      memoryGb,
      gpuRenderer,
      isMobileTouch
    };
  }

  public isEcoMode(): boolean {
    return this.isEcoActive;
  }

  public getHardwareProfile(): HardwareProfile {
    return this.hardwareProfile;
  }

  public toggleEcoMode(): boolean {
    if (this.isEcoActive) {
      this.disableEcoMode();
    } else {
      this.enableEcoMode(true);
    }
    return this.isEcoActive;
  }

  public enableEcoMode(showNotice: boolean = true) {
    this.isEcoActive = true;
    try {
      localStorage.setItem('webgis_eco_mode', 'true');
    } catch (_) {}

    if (this.map) {
      // 1. Set pixel ratio to 1.0 (saves 50-75% GPU fillrate on retina screens)
      if (typeof (this.map as any).setPixelRatio === 'function') {
        (this.map as any).setPixelRatio(1.0);
      }

      // 2. Limit max pitch to 45° to reduce frustum vertex workload
      if (typeof this.map.setMaxPitch === 'function') {
        this.map.setMaxPitch(45);
      }

      // 3. If currently tilted past 45°, ease down to 40°
      if (typeof this.map.getPitch === 'function' && this.map.getPitch() > 45) {
        if (typeof this.map.easeTo === 'function') {
          this.map.easeTo({ pitch: 40, duration: 600 });
        }
      }

      // 4. Disable heavy 3D building shadows if customizer is attached
      if (this.basemapCustomizerRef?.toggle3DBuildings) {
        const state = this.basemapCustomizerRef.getState?.();
        if (state?.buildings3D) {
          this.basemapCustomizerRef.toggle3DBuildings(false);
        }
      }
    }

    if (showNotice) {
      showToast('🍃 Mode Hemat GPU & Baterai Aktif (Resolusi 1x, pitch maks 45°)', 'info');
      announceToScreenReader('Mode hemat GPU dan baterai aktif');
    }

    this.notify();
  }

  public disableEcoMode(showNotice: boolean = true) {
    this.isEcoActive = false;
    try {
      localStorage.setItem('webgis_eco_mode', 'false');
    } catch (_) {}

    if (this.map) {
      // Restore standard native pixel ratio
      const standardRatio = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      if (typeof (this.map as any).setPixelRatio === 'function') {
        (this.map as any).setPixelRatio(standardRatio);
      }

      // Restore maximum tilt to 85°
      if (typeof this.map.setMaxPitch === 'function') {
        this.map.setMaxPitch(85);
      }
    }

    if (showNotice) {
      showToast('⚡ Mode Performa Penuh Aktif (Hi-DPI & Sudut Miring Penuh)', 'success');
      announceToScreenReader('Mode performa penuh aktif');
    }

    this.notify();
  }

  public onChange(callback: (active: boolean) => void) {
    this.changeCallbacks.push(callback);
  }

  private notify() {
    this.changeCallbacks.forEach((cb) => {
      try {
        cb(this.isEcoActive);
      } catch (e) {
        logger.warn('[EcoModeManager] Error in callback:', e);
      }
    });
  }
}
