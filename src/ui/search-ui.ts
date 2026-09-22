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
        if (this.dropdown) {
          this.dropdown.innerHTML = '<div class="search-result-item loading-result" style="color: var(--text-muted); cursor: default; display: flex; align-items: center; gap: 8px;"><span class="gee-spinner" style="width: 12px; height: 12px; border: 2px solid rgba(56, 189, 248, 0.3); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></span><span>Mencari lokasi...</span></div>';
          this.dropdown.classList.add('active');
          this.input?.setAttribute('aria-expanded', 'true');
        }
        try {
          const results = await this.geocoderTool.search(query);
          this.renderSearchResults(results, query);
        } catch {
          if (this.dropdown) {
            this.dropdown.innerHTML = '<div class="search-result-item empty-result" style="color: #ef4444; cursor: default;">Gagal menghubungi layanan pencarian lokasi.</div>';
          }
        }
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
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-if-mobile'));
    }
    announceToScreenReader(`Mengarahkan kamera ke lokasi: ${res.display_name}`);
  }

  private getTypeBadge(type?: string): string {
    if (type === 'city' || type === 'administrative') {
      return '<span style="font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">Kota / Wilayah</span>';
    }
    if (type === 'volcano') {
      return '<span style="font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">Gunung Api</span>';
    }
    if (type === 'island') {
      return '<span style="font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Kepulauan</span>';
    }
    if (type === 'lake' || type === 'water') {
      return '<span style="font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: rgba(6, 182, 212, 0.15); color: #06b6d4; border: 1px solid rgba(6, 182, 212, 0.3);">Badan Air</span>';
    }
    return '<span style="font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);">Lokasi</span>';
  }

  private renderSearchResults(results: SearchResult[], query: string) {
    const dropdown = this.dropdown;
    if (!dropdown) return;

    this.currentResults = results;
    this.selectedIndex = -1;
    dropdown.innerHTML = '';

    if (results.length === 0) {
      dropdown.innerHTML = '<div class="search-result-item empty-result" style="color: var(--text-muted); cursor: default; padding: 10px 12px; font-size: 12px;">Lokasi tidak ditemukan. Coba nama kota atau landmark di Indonesia (contoh: Jakarta, Bromo, IKN, Bandung).</div>';
      dropdown.classList.add('active');
      this.input?.setAttribute('aria-expanded', 'true');
      announceToScreenReader(`Lokasi tidak ditemukan untuk kata kunci ${query}`);
      return;
    }

    results.forEach((res, idx) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.setAttribute('role', 'option');
      item.setAttribute('id', `search-opt-${idx}`);
      item.setAttribute('aria-selected', 'false');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.gap = '8px';

      const labelSpan = document.createElement('span');
      labelSpan.style.flex = '1';
      labelSpan.style.overflow = 'hidden';
      labelSpan.style.textOverflow = 'ellipsis';
      labelSpan.style.whiteSpace = 'nowrap';
      labelSpan.innerText = res.display_name;

      const badgeSpan = document.createElement('div');
      badgeSpan.style.flexShrink = '0';
      badgeSpan.innerHTML = this.getTypeBadge(res.type);

      item.appendChild(labelSpan);
      item.appendChild(badgeSpan);

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.updateSelectionHighlight();
      });

      item.addEventListener('click', () => {
        this.selectResult(res);
      });

      dropdown.appendChild(item);
    });

    const footer = document.createElement('div');
    footer.style.padding = '6px 12px';
    footer.style.fontSize = '10px';
    footer.style.color = '#64748b';
    footer.style.borderTop = '1px solid rgba(255, 255, 255, 0.06)';
    footer.style.textAlign = 'right';
    footer.innerText = 'Data: OpenStreetMap & Landmark Indonesia';
    dropdown.appendChild(footer);

    dropdown.classList.add('active');
    this.input?.setAttribute('aria-expanded', 'true');
    announceToScreenReader(`${results.length} lokasi ditemukan`);
  }
}
