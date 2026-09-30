export type TabId = 'map' | 'piksel' | 'gee' | 'analysis' | 'measure' | 'data' | 'legend' | 'about';

export class SidebarUI {
  private activeTab: TabId = 'map';
  private isOpen: boolean = true;
  private tabChangeCallbacks: ((tabId: TabId) => void)[] = [];
  private resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.bindEvents();
    this.bindGlobalCollapseEvent();
    this.bindTouchDrawerGestures();
  }

  private bindTouchDrawerGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
      sidebarEl.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }
      }, { passive: true });

      sidebarEl.addEventListener('touchend', (e: TouchEvent) => {
        if (e.changedTouches.length === 1) {
          const deltaX = e.changedTouches[0].clientX - touchStartX;
          const deltaY = e.changedTouches[0].clientY - touchStartY;
          const deltaTime = Date.now() - touchStartTime;

          // If horizontal swipe to the left by > 45px within 600ms, close sidebar
          if (this.isOpen && deltaX < -45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && deltaTime < 600) {
            this.setOpen(false);
          }
        }
      }, { passive: true });
    }

    // Edge swipe listener on document for opening collapsed drawer
    document.addEventListener('touchstart', (e: TouchEvent) => {
      if (!this.isOpen && e.touches.length === 1 && e.touches[0].clientX < 32) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    }, { passive: true });

    document.addEventListener('touchend', (e: TouchEvent) => {
      if (!this.isOpen && touchStartX < 32 && e.changedTouches.length === 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;

        // If swipe right from left edge by > 45px
        if (deltaX > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && deltaTime < 600) {
          this.setOpen(true);
        }
      }
      touchStartX = 9999;
    }, { passive: true });
  }

  private bindEvents() {
    // Prevent pointerdown inside sidebar from propagating to the map canvas
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
      sidebarEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // Nav tab buttons
    const navButtons = document.querySelectorAll<HTMLButtonElement>('.sidebar-tab-btn');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tab = btn.dataset.tab as TabId;
        if (!tab) return;

        if (this.isOpen && this.activeTab === tab) {
          this.setOpen(false);
        } else {
          this.setActiveTab(tab);
          this.setOpen(true);
        }
      });
    });

    // Toggle collapse button
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setOpen(!this.isOpen);
      });
    }

    // Mobile sidebar backdrop click to close
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        e.preventDefault();
        this.setOpen(false);
      });
    }
  }

  /**
   * Bind the global custom event for auto-collapsing the sidebar on mobile and during map drawing.
   * Uses this.setOpen(false) to keep internal state and DOM in sync —
   * prevents the isOpen state drift that occurred when manipulating DOM directly.
   */
  private wasOpenBeforeDrawing: boolean = false;

  private bindGlobalCollapseEvent() {
    if (typeof window === 'undefined') return;
    window.addEventListener('webgis:collapse-sidebar-if-mobile', () => {
      if (window.innerWidth <= 768 && this.isOpen) {
        this.setOpen(false);
      }
    });

    window.addEventListener('webgis:collapse-sidebar-for-drawing', () => {
      this.wasOpenBeforeDrawing = this.isOpen;
      if (this.isOpen) {
        this.setOpen(false);
      }
    });

    window.addEventListener('webgis:restore-sidebar-after-drawing', () => {
      if (this.wasOpenBeforeDrawing && !this.isOpen) {
        this.setOpen(true);
      }
    });
  }

  public setActiveTab(tabId: TabId) {
    this.activeTab = tabId;

    // Update active nav button styling and accessibility
    document.querySelectorAll<HTMLButtonElement>('.sidebar-tab-btn').forEach((btn) => {
      const isSelected = btn.dataset.tab === tabId;
      if (isSelected) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });

    // Update active panel view and accessibility
    document.querySelectorAll<HTMLElement>('.sidebar-panel').forEach((panel) => {
      const isActive = panel.id === `panel-${tabId}`;
      if (isActive) {
        panel.classList.add('active');
        panel.setAttribute('aria-hidden', 'false');
      } else {
        panel.classList.remove('active');
        panel.setAttribute('aria-hidden', 'true');
      }
    });

    for (const callback of this.tabChangeCallbacks) {
      try {
        callback(tabId);
      } catch (err) {
        console.error('[SidebarUI] Error in tabChangeCallback:', err);
      }
    }
  }

  public setOpen(isOpen: boolean) {
    this.isOpen = isOpen;
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');

    if (backdrop) {
      backdrop.classList.toggle('active', isOpen);
    }

    if (sidebar) {
      sidebar.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        sidebar.classList.remove('collapsed');
      } else {
        sidebar.classList.add('collapsed');
      }
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', isOpen ? 'Collapse sidebar' : 'Expand sidebar');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      toggleBtn.innerHTML = isOpen
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }

    if (this.resizeTimeoutId) {
      clearTimeout(this.resizeTimeoutId);
      this.resizeTimeoutId = null;
    }

    this.resizeTimeoutId = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('resize'));
      }
      this.resizeTimeoutId = null;
    }, 320);
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public collapseIfMobile(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 768 && this.isOpen) {
      this.setOpen(false);
    }
  }

  public onTabChange(callback: (tabId: TabId) => void) {
    this.tabChangeCallbacks.push(callback);
  }

  public destroy(): void {
    if (this.resizeTimeoutId) {
      clearTimeout(this.resizeTimeoutId);
      this.resizeTimeoutId = null;
    }
  }
}