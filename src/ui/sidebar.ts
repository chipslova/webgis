export type TabId = 'map' | 'piksel' | 'gee' | 'measure' | 'data' | 'legend' | 'about';

export class SidebarUI {
  private activeTab: TabId = 'map';
  private isOpen: boolean = true;
  private onTabChangeCallback?: (tabId: TabId) => void;
  private mobileScrim: HTMLDivElement | null = null;
  private isMobileSheetOpen: boolean = false;

  constructor() {
    this.bindEvents();
    this.bindMobileSheet();
  }

  private isMobile(): boolean {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  private bindMobileSheet(): void {
    // Create and inject scrim element
    const scrim = document.createElement('div');
    scrim.className = 'mobile-sheet-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    this.mobileScrim = scrim;

    // Scrim click → close sheet
    scrim.addEventListener('click', () => this.closeMobileSheet());

    // Sidebar toggle button closes on mobile too
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (this.isMobile()) this.closeMobileSheet();
      });
    }

    // On resize from mobile → desktop, clean up sheet state
    window.addEventListener('resize', () => {
      if (!this.isMobile() && this.isMobileSheetOpen) {
        this.closeMobileSheet(false);
      }
    });
  }

  private openMobileSheet(): void {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !this.mobileScrim) return;
    sidebar.classList.add('mobile-open');
    this.mobileScrim.classList.add('visible');
    this.isMobileSheetOpen = true;
    // Prevent body scroll while sheet is open
    document.body.style.overflow = 'hidden';
  }

  private closeMobileSheet(restoreScroll: boolean = true): void {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !this.mobileScrim) return;
    sidebar.classList.remove('mobile-open');
    this.mobileScrim.classList.remove('visible');
    this.isMobileSheetOpen = false;
    if (restoreScroll) document.body.style.overflow = '';
    // Trigger map resize after sheet closes
    setTimeout(() => window.dispatchEvent(new Event('resize')), 360);
  }

  private bindEvents() {
    // Prevent touch & pointer events inside sidebar from propagating to the map canvas
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
      sidebarEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      sidebarEl.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
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

        if (this.isMobile()) {
          // Mobile: toggle bottom sheet
          if (this.isMobileSheetOpen && this.activeTab === tab) {
            // Same tab clicked again → close
            this.closeMobileSheet();
          } else {
            this.setActiveTab(tab);
            this.openMobileSheet();
          }
        } else {
          // Desktop: existing collapse behavior
          if (this.isOpen && this.activeTab === tab) {
            this.setOpen(false);
          } else {
            this.setActiveTab(tab);
            this.setOpen(true);
          }
        }
      });
    });

    // Toggle collapse button (desktop only)
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.isMobile()) {
          this.setOpen(!this.isOpen);
        }
      });
    }
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

    if (this.onTabChangeCallback) {
      this.onTabChangeCallback(tabId);
    }
  }

  public setOpen(isOpen: boolean) {
    this.isOpen = isOpen;
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');

    if (sidebar) {
      sidebar.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        sidebar.classList.remove('collapsed');
      } else {
        sidebar.classList.add('collapsed');
      }
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', isOpen ? 'Ciutkan bilah samping' : 'Bentangkan bilah samping');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      toggleBtn.innerHTML = isOpen
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
    }

    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public onTabChange(callback: (tabId: TabId) => void) {
    this.onTabChangeCallback = callback;
  }
}



