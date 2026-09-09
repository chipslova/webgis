import { GeocoderTool, SearchResult } from '../tools/geocoder';
import { announceToScreenReader } from '../utils/a11y';

export class SearchUI {
  private geocoderTool: GeocoderTool;
  private input: HTMLInputElement | null = null;
  private dropdown: HTMLElement | null = null;
  private clearBtn: HTMLElement | null = null;
  private currentResults: SearchResult[] = [];
  private selectedIndex: number = -1;

  constructor(geocoderTool: GeocoderTool) {
    this.geocoderTool = geocoderTool;
    this.bindEvents();
  }

  private bindEvents() {
    this.input = document.getElementById('geocoder-input') as HTMLInputElement;
    this.dropdown = document.getElementById('geocoder-results');
    this.clearBtn = document.getElementById('search-clear-btn');

    if (!this.input || !this.dropdown) return;

    // Accessibility attributes
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-controls', 'geocoder-results');

    let debounceTimer: any;

    this.input.addEventListener('input', () => {
      const query = this.input!.value.trim();
      if (this.clearBtn) this.clearBtn.style.display = query ? 'block' : 'none';

      clearTimeout(debounceTimer);
      if (query.length < 2) {
        this.closeDropdown();
        return;
      }

      debounceTimer = setTimeout(async () => {
        const results = await this.geocoderTool.search(query);
        this.renderSearchResults(results, query);
      }, 300);
    });

    // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.dropdown?.classList.contains('active') || this.currentResults.length === 0) {
        if (e.key === 'Escape') {
          this.closeDropdown();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.currentResults.length;
        this.updateSelectionHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = this.selectedIndex <= 0 ? this.currentResults.length - 1 : this.selectedIndex - 1;
        this.updateSelectionHighlight();
      } else if (e.key === 'Enter') {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.currentResults.length) {
          e.preventDefault();
          this.selectResult(this.currentResults[this.selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeDropdown();
      }
    });

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        if (this.input) this.input.value = '';
        if (this.clearBtn) this.clearBtn.style.display = 'none';
        this.closeDropdown();
        this.geocoderTool.clear();
        this.input?.focus();
      });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this.input && this.dropdown && !this.input.contains(e.target as Node) && !this.dropdown.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private closeDropdown() {
    this.dropdown?.classList.remove('active');
    this.input?.setAttribute('aria-expanded', 'false');
    this.selectedIndex = -1;
  }

  private updateSelectionHighlight() {
    if (!this.dropdown) return;
    const items = this.dropdown.querySelectorAll('.search-result-item');
    items.forEach((item, idx) => {
      const isSelected = idx === this.selectedIndex;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private selectResult(res: SearchResult) {
    this.closeDropdown();
    if (this.input) {
      this.input.value = res.display_name;
      if (this.clearBtn) this.clearBtn.style.display = 'block';
    }
    this.geocoderTool.flyToResult(res);
    announceToScreenReader(`Menuju lokasi: ${res.display_name}`);
  }

  private renderSearchResults(results: SearchResult[], query: string) {
    const dropdown = this.dropdown;
    if (!dropdown) return;

    this.currentResults = results;
    this.selectedIndex = -1;
    dropdown.innerHTML = '';

    if (results.length === 0) {
      dropdown.innerHTML = '<div class="search-result-item empty-result" style="color: var(--text-muted); cursor: default;">Lokasi tidak ditemukan</div>';
      dropdown.classList.add('active');
      this.input?.setAttribute('aria-expanded', 'true');
      announceToScreenReader(`Tidak ada lokasi ditemukan untuk ${query}`);
      return;
    }

    results.forEach((res, idx) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.setAttribute('role', 'option');
      item.setAttribute('id', `search-opt-${idx}`);
      item.setAttribute('aria-selected', 'false');
      item.innerText = res.display_name;

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.updateSelectionHighlight();
      });

      item.addEventListener('click', () => {
        this.selectResult(res);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.add('active');
    this.input?.setAttribute('aria-expanded', 'true');
    announceToScreenReader(`${results.length} lokasi ditemukan untuk pencarian ${query}`);
  }
}
