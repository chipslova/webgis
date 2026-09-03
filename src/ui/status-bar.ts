import { showToast } from './toast';

export class StatusBarUI {
  private latEl: HTMLElement | null;
  private lngEl: HTMLElement | null;
  private zoomEl: HTMLElement | null;
  private pitchEl: HTMLElement | null;
  private bearingEl: HTMLElement | null;
  private copyBtn: HTMLButtonElement | null;
  private coordGroup: HTMLElement | null;

  private currentLat: number = 0;
  private currentLng: number = 0;

  constructor() {
    this.latEl = document.getElementById('stat-lat');
    this.lngEl = document.getElementById('stat-lng');
    this.zoomEl = document.getElementById('stat-zoom');
    this.pitchEl = document.getElementById('stat-pitch');
    this.bearingEl = document.getElementById('stat-bearing');
    this.copyBtn = document.getElementById('btn-copy-coords') as HTMLButtonElement;
    this.coordGroup = document.querySelector('.status-group');

    this.bindEvents();
  }

  private copyCurrentCoordinates() {
    const text = `${this.currentLat.toFixed(6)}, ${this.currentLng.toFixed(6)}`;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`✓ Koordinat ${text} (WGS84) berhasil disalin`, 'success');
      if (this.copyBtn) {
        const orig = this.copyBtn.innerHTML;
        this.copyBtn.innerText = '✓ Tersalin!';
        setTimeout(() => {
          this.copyBtn!.innerHTML = orig;
        }, 1800);
      }
    }).catch(() => {
      showToast(`Koordinat: ${text}`, 'info');
    });
  }

  private bindEvents() {
    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => {
        this.copyCurrentCoordinates();
      });
    }

    if (this.coordGroup) {
      this.coordGroup.style.cursor = 'pointer';
      this.coordGroup.title = 'Klik untuk menyalin koordinat saat ini';
      this.coordGroup.addEventListener('click', () => {
        this.copyCurrentCoordinates();
      });
    }
  }

  public update(info: { lat: number; lng: number; zoom: number; pitch: number; bearing: number }) {
    this.currentLat = info.lat;
    this.currentLng = info.lng;

    if (this.latEl) this.latEl.innerText = info.lat.toFixed(5);
    if (this.lngEl) this.lngEl.innerText = info.lng.toFixed(5);
    if (this.zoomEl) this.zoomEl.innerText = info.zoom.toFixed(1);
    if (this.pitchEl) this.pitchEl.innerText = `${Math.round(info.pitch)}°`;
    if (this.bearingEl) this.bearingEl.innerText = `${Math.round(info.bearing)}°`;
  }
}
