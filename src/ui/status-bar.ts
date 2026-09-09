import { showToast } from './toast';
import { announceToScreenReader } from '../utils/a11y';

export class StatusBarUI {
  private latEl: HTMLElement | null;
  private lngEl: HTMLElement | null;
  private zoomEl: HTMLElement | null;
  private pitchEl: HTMLElement | null;
  private bearingEl: HTMLElement | null;
  private copyBtn: HTMLButtonElement | null;
  private coordGroup: HTMLElement | null;
  private netStatusDot: HTMLElement | null = null;
  private netStatusText: HTMLElement | null = null;

  private currentLat: number = 0;
  private currentLng: number = 0;

  private lastLatStr = '';
  private lastLngStr = '';
  private lastZoomStr = '';
  private lastPitchStr = '';
  private lastBearingStr = '';

  constructor() {
    this.latEl = document.getElementById('stat-lat');
    this.lngEl = document.getElementById('stat-lng');
    this.zoomEl = document.getElementById('stat-zoom');
    this.pitchEl = document.getElementById('stat-pitch');
    this.bearingEl = document.getElementById('stat-bearing');
    this.copyBtn = document.getElementById('btn-copy-coords') as HTMLButtonElement;
    this.coordGroup = document.querySelector('.status-group');
    this.netStatusDot = document.getElementById('net-status-dot');
    this.netStatusText = document.getElementById('net-status-text');

    this.bindEvents();
  }

  public setOnlineStatus(online: boolean) {
    if (this.netStatusDot) {
      this.netStatusDot.className = `status-dot ${online ? 'online' : 'offline'}`;
      this.netStatusDot.setAttribute('title', online ? 'Koneksi Online' : 'Koneksi Terputus (Offline)');
    }
    if (this.netStatusText) {
      this.netStatusText.textContent = online ? 'Online' : 'Offline';
    }
  }

  private copyCurrentCoordinates() {
    const text = `${this.currentLat.toFixed(6)}, ${this.currentLng.toFixed(6)}`;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`✓ Koordinat ${text} (WGS84) berhasil disalin`, 'success');
      announceToScreenReader(`Koordinat ${text} derajat WGS84 berhasil disalin ke clipboard`);
      if (this.copyBtn) {
        const orig = this.copyBtn.innerHTML;
        this.copyBtn.innerText = '✓ Tersalin!';
        setTimeout(() => {
          this.copyBtn!.innerHTML = orig;
        }, 1800);
      }
    }).catch(() => {
      showToast(`Koordinat: ${text}`, 'info');
      announceToScreenReader(`Koordinat ${text} derajat WGS84`);
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

    const latStr = info.lat.toFixed(5);
    const lngStr = info.lng.toFixed(5);
    const zoomStr = info.zoom.toFixed(1);
    const pitchStr = `${Math.round(info.pitch)}°`;
    const bearingStr = `${Math.round(info.bearing)}°`;

    if (this.latEl && this.lastLatStr !== latStr) {
      this.latEl.innerText = latStr;
      this.lastLatStr = latStr;
    }
    if (this.lngEl && this.lastLngStr !== lngStr) {
      this.lngEl.innerText = lngStr;
      this.lastLngStr = lngStr;
    }
    if (this.zoomEl && this.lastZoomStr !== zoomStr) {
      this.zoomEl.innerText = zoomStr;
      this.lastZoomStr = zoomStr;
    }
    if (this.pitchEl && this.lastPitchStr !== pitchStr) {
      this.pitchEl.innerText = pitchStr;
      this.lastPitchStr = pitchStr;
    }
    if (this.bearingEl && this.lastBearingStr !== bearingStr) {
      this.bearingEl.innerText = bearingStr;
      this.lastBearingStr = bearingStr;
    }
  }
}
