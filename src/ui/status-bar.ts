export class StatusBarUI {
  private latEl: HTMLElement | null;
  private lngEl: HTMLElement | null;
  private zoomEl: HTMLElement | null;
  private pitchEl: HTMLElement | null;
  private bearingEl: HTMLElement | null;
  private copyBtn: HTMLButtonElement | null;

  private currentLat: number = 0;
  private currentLng: number = 0;

  constructor() {
    this.latEl = document.getElementById('stat-lat');
    this.lngEl = document.getElementById('stat-lng');
    this.zoomEl = document.getElementById('stat-zoom');
    this.pitchEl = document.getElementById('stat-pitch');
    this.bearingEl = document.getElementById('stat-bearing');
    this.copyBtn = document.getElementById('btn-copy-coords') as HTMLButtonElement;

    this.bindEvents();
  }

  private bindEvents() {
    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => {
        const text = `${this.currentLat.toFixed(6)}, ${this.currentLng.toFixed(6)}`;
        navigator.clipboard.writeText(text).then(() => {
          const orig = this.copyBtn!.innerHTML;
          this.copyBtn!.innerText = 'Copied!';
          setTimeout(() => {
            this.copyBtn!.innerHTML = orig;
          }, 1500);
        });
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
