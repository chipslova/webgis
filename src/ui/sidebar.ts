export type TabId = 'piksel' | 'gee' | 'basemaps' | 'layers' | 'measure' | 'data' | 'legend' | 'about';

export class SidebarUI {
  private activeTab: TabId = 'gee';
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

    // Update active nav button styling
    document.querySelectorAll<HTMLButtonElement>('.sidebar-tab-btn').forEach((btn) => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update active panel view
    document.querySelectorAll<HTMLElement>('.sidebar-panel').forEach((panel) => {
      if (panel.id === `panel-${tabId}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
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
      if (isOpen) {
        sidebar.classList.remove('collapsed');
      } else {
        sidebar.classList.add('collapsed');
      }
    }

    if (toggleBtn) {
      toggleBtn.innerHTML = isOpen
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
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

  public onTabChange(callback: (tabId: TabId) => void) {
    this.onTabChangeCallback = callback;
  }
}
