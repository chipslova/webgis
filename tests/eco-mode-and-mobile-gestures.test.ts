// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EcoModeManager } from '../src/tools/eco-mode';
import { StatusBarUI } from '../src/ui/status-bar';
import { SidebarUI } from '../src/ui/sidebar';
import { CommandPaletteUI } from '../src/ui/command-palette';

describe('Tahap 5: Low-Spec / GPU Eco-Mode & Mobile Touch Gestures', () => {
  const createMockMap = () => ({
    setPixelRatio: vi.fn(),
    setMaxPitch: vi.fn(),
    getPitch: vi.fn().mockReturnValue(60),
    easeTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getStyle: vi.fn().mockReturnValue({ version: 8 }),
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="app">
        <aside id="sidebar" class="sidebar" aria-expanded="true">
          <div class="mobile-drawer-handle"></div>
          <nav class="sidebar-nav">
            <button class="sidebar-tab-btn active" data-tab="map" id="tab-map">Lapisan</button>
            <button class="sidebar-tab-btn" data-tab="piksel" id="tab-piksel">Satelit</button>
          </nav>
          <div id="panel-map" class="sidebar-panel active"></div>
          <div id="panel-piksel" class="sidebar-panel"></div>
        </aside>
        <button id="sidebar-toggle-btn"></button>
        <div id="mobile-sidebar-backdrop"></div>
        <footer class="app-footer">
          <div class="status-group">
            <span id="stat-lat">0.00000</span>
            <span id="stat-lng">0.00000</span>
            <span id="stat-zoom">0.0</span>
            <span id="stat-pitch">0°</span>
            <span id="stat-bearing">0°</span>
            <button id="btn-copy-coords">Salin</button>
          </div>
          <button id="btn-toggle-eco-mode" class="eco-mode-btn">
            <span class="eco-icon">🍃</span>
            <span id="eco-mode-text">Eco GPU</span>
          </button>
          <span id="net-status-dot" class="status-dot"></span>
          <span id="net-status-text">Online</span>
        </footer>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('1. EcoModeManager', () => {
    it('should detect hardware profile correctly', () => {
      const mockMap = createMockMap() as any;
      const manager = new EcoModeManager(mockMap);
      const profile = manager.getHardwareProfile();

      expect(profile).toBeDefined();
      expect(typeof profile.cores).toBe('number');
      expect(profile.cores).toBeGreaterThanOrEqual(1);
      expect(profile.gpuRenderer).toBeDefined();
    });

    it('should enable and disable Eco Mode with map optimizations', () => {
      const mockMap = createMockMap() as any;
      const mockCustomizer = {
        getState: vi.fn().mockReturnValue({ buildings3D: true }),
        toggle3DBuildings: vi.fn()
      };

      const manager = new EcoModeManager(mockMap, mockCustomizer);
      expect(manager.isEcoMode()).toBe(false);

      // Enable Eco Mode
      manager.enableEcoMode(false);
      expect(manager.isEcoMode()).toBe(true);
      expect(mockMap.setPixelRatio).toHaveBeenCalledWith(1.0);
      expect(mockMap.setMaxPitch).toHaveBeenCalledWith(45);
      expect(mockMap.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 40 }));
      expect(mockCustomizer.toggle3DBuildings).toHaveBeenCalledWith(false);
      expect(localStorage.getItem('webgis_eco_mode')).toBe('true');

      // Disable Eco Mode
      manager.disableEcoMode(false);
      expect(manager.isEcoMode()).toBe(false);
      expect(mockMap.setMaxPitch).toHaveBeenCalledWith(85);
      expect(localStorage.getItem('webgis_eco_mode')).toBe('false');
    });

    it('should toggle Eco Mode and notify subscribers', () => {
      const mockMap = createMockMap() as any;
      const manager = new EcoModeManager(mockMap);
      const onChange = vi.fn();
      manager.onChange(onChange);

      manager.toggleEcoMode();
      expect(manager.isEcoMode()).toBe(true);
      expect(onChange).toHaveBeenCalledWith(true);

      manager.toggleEcoMode();
      expect(manager.isEcoMode()).toBe(false);
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  describe('2. StatusBarUI & Eco Mode Integration', () => {
    it('should toggle eco mode when status bar button is clicked and update UI', () => {
      const mockMap = createMockMap() as any;
      const manager = new EcoModeManager(mockMap);
      const statusBar = new StatusBarUI();
      statusBar.setEcoModeManager(manager);

      const ecoBtn = document.getElementById('btn-toggle-eco-mode') as HTMLButtonElement;
      const ecoText = document.getElementById('eco-mode-text');

      expect(ecoBtn).not.toBeNull();
      expect(ecoBtn.classList.contains('is-active')).toBe(false);
      expect(ecoText?.textContent).toBe('Eco GPU');

      // Click button to enable
      ecoBtn.click();
      expect(manager.isEcoMode()).toBe(true);
      expect(ecoBtn.classList.contains('is-active')).toBe(true);
      expect(ecoText?.textContent).toBe('Eco Aktif');

      // Click button again to disable
      ecoBtn.click();
      expect(manager.isEcoMode()).toBe(false);
      expect(ecoBtn.classList.contains('is-active')).toBe(false);
      expect(ecoText?.textContent).toBe('Eco GPU');
    });
  });

  describe('3. Mobile Touch Drawer Gestures', () => {
    it('should close open sidebar when swiped horizontally to the left', () => {
      const sidebar = new SidebarUI();
      expect(sidebar.getIsOpen()).toBe(true);

      const sidebarEl = document.getElementById('sidebar')!;

      // Simulate touch swipe left
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 300 } as Touch]
      });
      sidebarEl.dispatchEvent(touchStart);

      const touchEnd = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 120, clientY: 305 } as Touch] // deltaX = -80px
      });
      sidebarEl.dispatchEvent(touchEnd);

      expect(sidebar.getIsOpen()).toBe(false);
    });

    it('should ignore vertical scrolling and not close the drawer', () => {
      const sidebar = new SidebarUI();
      expect(sidebar.getIsOpen()).toBe(true);

      const sidebarEl = document.getElementById('sidebar')!;

      // Simulate vertical scroll (deltaY much larger than deltaX)
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 200 } as Touch]
      });
      sidebarEl.dispatchEvent(touchStart);

      const touchEnd = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 180, clientY: 350 } as Touch] // deltaY = +150px, deltaX = -20px
      });
      sidebarEl.dispatchEvent(touchEnd);

      expect(sidebar.getIsOpen()).toBe(true);
    });

    it('should open collapsed drawer when swiped right from the left screen edge', () => {
      const sidebar = new SidebarUI();
      sidebar.setOpen(false);
      expect(sidebar.getIsOpen()).toBe(false);

      // Touch near the left screen edge (clientX = 15)
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 15, clientY: 300 } as Touch]
      });
      document.dispatchEvent(touchStart);

      const touchEnd = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 85, clientY: 305 } as Touch] // deltaX = +70px
      });
      document.dispatchEvent(touchEnd);

      expect(sidebar.getIsOpen()).toBe(true);
    });
  });

  describe('4. Command Palette Eco Mode Action', () => {
    it('should toggle eco mode via Command Palette command', () => {
      const mockMap = createMockMap() as any;
      const manager = new EcoModeManager(mockMap);
      const sidebar = new SidebarUI();

      const palette = new CommandPaletteUI(
        { getBasemaps: () => [] } as any,
        null,
        null,
        null,
        sidebar,
        null,
        null
      );
      palette.setEcoModeManager(manager);

      const commands = (palette as any).getAllCommands();
      const ecoCmd = commands.find((c: any) => c.id === 'tool-toggle-eco-mode');

      expect(ecoCmd).toBeDefined();
      expect(ecoCmd.title).toContain('Eco Mode');
      expect(ecoCmd.keywords).toContain('eco');

      expect(manager.isEcoMode()).toBe(false);
      ecoCmd.action();
      expect(manager.isEcoMode()).toBe(true);
      ecoCmd.action();
      expect(manager.isEcoMode()).toBe(false);
    });
  });
});
