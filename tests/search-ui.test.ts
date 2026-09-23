// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchUI } from '../src/ui/search-ui';
import { GeocoderTool, SearchResult } from '../src/tools/geocoder';

describe('SearchUI', () => {
  let geocoderMock: any;
  let inputEl: HTMLInputElement;
  let dropdownEl: HTMLElement;
  let clearBtnEl: HTMLElement;
  let searchUI: SearchUI;

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="search-container">
        <input type="text" id="geocoder-input" placeholder="Cari..." />
        <button id="search-clear-btn" style="display: none;">×</button>
        <div id="geocoder-results" class="geocoder-dropdown"></div>
      </div>
    `;

    inputEl = document.getElementById('geocoder-input') as HTMLInputElement;
    dropdownEl = document.getElementById('geocoder-results')!;
    clearBtnEl = document.getElementById('search-clear-btn')!;

    geocoderMock = {
      search: vi.fn(),
      flyToResult: vi.fn(),
      clear: vi.fn()
    };

    searchUI = new SearchUI(geocoderMock as unknown as GeocoderTool);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with accessibility attributes on input', () => {
    expect(inputEl.getAttribute('role')).toBe('combobox');
    expect(inputEl.getAttribute('aria-autocomplete')).toBe('list');
    expect(inputEl.getAttribute('aria-expanded')).toBe('false');
    expect(inputEl.getAttribute('aria-controls')).toBe('geocoder-results');
  });

  it('should trigger search and render results when user types at least 2 characters', async () => {
    vi.useFakeTimers();

    const sampleResults: SearchResult[] = [
      {
        display_name: 'Jakarta (Monas, Daerah Khusus Ibukota Jakarta)',
        lat: '-6.1754',
        lon: '106.8272',
        type: 'city'
      }
    ];
    geocoderMock.search.mockResolvedValue(sampleResults);

    inputEl.value = 'Jakarta';
    inputEl.dispatchEvent(new Event('input'));

    expect(clearBtnEl.style.display).toBe('block');

    // Fast-forward debounce timer (300ms)
    await vi.advanceTimersByTimeAsync(350);

    expect(geocoderMock.search).toHaveBeenCalledWith('Jakarta');
    expect(dropdownEl.classList.contains('active')).toBe(true);
    expect(inputEl.getAttribute('aria-expanded')).toBe('true');
    expect(dropdownEl.querySelectorAll('.search-result-item').length).toBe(1);
    expect(dropdownEl.innerHTML).toContain('Jakarta');

    vi.useRealTimers();
  });

  it('should close dropdown when query length is less than 2', async () => {
    dropdownEl.classList.add('active');
    inputEl.value = 'a';
    inputEl.dispatchEvent(new Event('input'));

    expect(dropdownEl.classList.contains('active')).toBe(false);
    expect(inputEl.getAttribute('aria-expanded')).toBe('false');
  });

  it('should handle clear button click to reset input and clear marker', () => {
    inputEl.value = 'Surabaya';
    clearBtnEl.style.display = 'block';
    dropdownEl.classList.add('active');

    clearBtnEl.dispatchEvent(new Event('click'));

    expect(inputEl.value).toBe('');
    expect(clearBtnEl.style.display).toBe('none');
    expect(dropdownEl.classList.contains('active')).toBe(false);
    expect(geocoderMock.clear).toHaveBeenCalled();
  });

  it('should select result on click and fly to location', async () => {
    vi.useFakeTimers();

    const sampleResults: SearchResult[] = [
      {
        display_name: 'Bandung, Jawa Barat',
        lat: '-6.9175',
        lon: '107.6191',
        type: 'city'
      }
    ];
    geocoderMock.search.mockResolvedValue(sampleResults);

    inputEl.value = 'Bandung';
    inputEl.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(350);

    const resultItem = dropdownEl.querySelector('.search-result-item') as HTMLElement;
    resultItem.dispatchEvent(new Event('click'));

    expect(geocoderMock.flyToResult).toHaveBeenCalledWith(sampleResults[0]);
    expect(inputEl.value).toBe('Bandung, Jawa Barat');
    expect(dropdownEl.classList.contains('active')).toBe(false);

    vi.useRealTimers();
  });

  it('should navigate search results using keyboard ArrowDown, ArrowUp, Enter and Escape', async () => {
    vi.useFakeTimers();

    const sampleResults: SearchResult[] = [
      { display_name: 'Hasil 1', lat: '-6.1', lon: '106.8' },
      { display_name: 'Hasil 2', lat: '-6.2', lon: '106.9' }
    ];
    geocoderMock.search.mockResolvedValue(sampleResults);

    inputEl.value = 'Hasil';
    inputEl.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(350);

    // Press ArrowDown to select first item
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const items = dropdownEl.querySelectorAll('.search-result-item');
    expect(items[0].classList.contains('selected')).toBe(true);

    // Press ArrowDown to select second item
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(items[1].classList.contains('selected')).toBe(true);

    // Press Enter to trigger selection
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(geocoderMock.flyToResult).toHaveBeenCalledWith(sampleResults[1]);
    expect(dropdownEl.classList.contains('active')).toBe(false);

    vi.useRealTimers();
  });
});
