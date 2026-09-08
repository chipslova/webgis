export type TabId = 'map' | 'piksel' | 'gee' | 'measure' | 'data' | 'legend' | 'about';

export class SidebarUI {
  private activeTab: TabId = 'map';
  private isOpen: boolean = true;
  private onTabChangeCallback?: (tabId: TabId) => void;

  constructor() {
    this.bindEvents();
  }

  private bindEvents() {
    // Nav tab buttons
    const navButtons = document.querySelectorAll<HTMLButtonElement>('.sidebar-tab-btn');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as TabId;
        if (tab) {
          if (this.isOpen && this.activeTab === tab) {
            // Clicking active tab toggles panel closed
            this.setOpen(false);
          } else {
            // Open and switch to selected tab
            this.setActiveTab(tab);
            if (!this.isOpen) {
              this.setOpen(true);
            }
          }
        }
      });
    });

    // Toggle collapse button
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.setOpen(!this.isOpen);
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

    // Continuously trigger resize during transition so MapLibre canvas expands smoothly to full width
    const start = performance.now();
    const duration = 350;
    const animateResize = (now: number) => {
      window.dispatchEvent(new Event('resize'));
      if (now - start < duration) {
        requestAnimationFrame(animateResize);
      } else {
        window.dispatchEvent(new Event('resize'));
      }
    };
    requestAnimationFrame(animateResize);
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public onTabChange(callback: (tabId: TabId) => void) {
    this.onTabChangeCallback = callback;
  }
}

