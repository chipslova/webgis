import { GeocoderTool, SearchResult } from '../tools/geocoder';

export class SearchUI {
  private geocoderTool: GeocoderTool;
  private input: HTMLInputElement | null = null;
  private dropdown: HTMLElement | null = null;
  private clearBtn: HTMLElement | null = null;

  constructor(geocoderTool: GeocoderTool) {
    this.geocoderTool = geocoderTool;
    this.bindEvents();
  }

  private bindEvents() {
    this.input = document.getElementById('geocoder-input') as HTMLInputElement;
    this.dropdown = document.getElementById('geocoder-results');
    this.clearBtn = document.getElementById('search-clear-btn');

    if (!this.input || !this.dropdown) return;

    let debounceTimer: any;

    this.input.addEventListener('input', () => {
      const query = this.input!.value.trim();
      if (this.clearBtn) this.clearBtn.style.display = query ? 'block' : 'none';

      clearTimeout(debounceTimer);
      if (query.length < 2) {
        this.dropdown?.classList.remove('active');
        return;
      }

      debounceTimer = setTimeout(async () => {
        const results = await this.geocoderTool.search(query);
        this.renderSearchResults(results);
      }, 350);
    });

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        if (this.input) this.input.value = '';
        if (this.clearBtn) this.clearBtn.style.display = 'none';
        this.dropdown?.classList.remove('active');
        this.geocoderTool.clear();
      });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this.input && this.dropdown && !this.input.contains(e.target as Node) && !this.dropdown.contains(e.target as Node)) {
        this.dropdown.classList.remove('active');
      }
    });
  }

  private renderSearchResults(results: SearchResult[]) {
    const dropdown = this.dropdown;
    if (!dropdown) return;

    dropdown.innerHTML = '';
    if (results.length === 0) {
      dropdown.innerHTML = '<div class="search-result-item" style="color: var(--text-muted);">Lokasi tidak ditemukan</div>';
      dropdown.classList.add('active');
      return;
    }

    results.forEach((res) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerText = res.display_name;

      item.addEventListener('click', () => {
        dropdown.classList.remove('active');
        this.geocoderTool.flyToResult(res);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.add('active');
  }
}
