import * as maplibregl from 'maplibre-gl';
import { PikselLoader } from './piksel-loader';
import { GEELoader } from './gee-loader';
import { GeoJsonLoader } from './geojson-loader';
import { MeasureTool } from './measure';
import { showToast } from '../ui/toast';
import { escapeHtml } from '../utils/sanitize';
import { logger } from '../utils/logger';

export interface BookmarkedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevation?: string;
  date: string;
}

const BOOKMARK_STORAGE_KEY = 'webgis_bookmarked_locations';

export class PointInspector {
  private map: maplibregl.Map;
  private pikselLoader?: PikselLoader;
  private geeLoader?: GEELoader;
  private geojsonLoader?: GeoJsonLoader;
  private measureTool?: MeasureTool;
  private marker: maplibregl.Marker | null = null;
  private containerEl: HTMLElement | null = null;
  private isEnabled: boolean = true;
  private currentInspected?: { lat: number; lng: number; name?: string; elevation?: string };
  private chartState: {
    type: 'lst';
    lstData: any[];
  } | {
    type: 'precip';
    precipDates: string[];
    precipValues: number[];
  } | null = null;

  public static getBookmarks(): BookmarkedLocation[] {
    try {
      const raw = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public static isBookmarked(latOrObj: number | { lat: number; lng: number }, lng?: number): boolean {
    const targetLat = typeof latOrObj === 'object' ? latOrObj.lat : latOrObj;
    const targetLng = typeof latOrObj === 'object' ? latOrObj.lng : (lng ?? 0);
    const list = PointInspector.getBookmarks();
    return list.some(b => Math.abs(b.lat - targetLat) < 0.0001 && Math.abs(b.lng - targetLng) < 0.0001);
  }

  public static toggleBookmark(
    latOrObj: number | { lat: number; lng: number; name?: string; elevation?: string; note?: string },
    lng?: number,
    name?: string,
    elevation?: string
  ): boolean {
    const targetLat = typeof latOrObj === 'object' ? latOrObj.lat : latOrObj;
    const targetLng = typeof latOrObj === 'object' ? latOrObj.lng : (lng ?? 0);
    const targetName = typeof latOrObj === 'object' ? (latOrObj.name || (latOrObj as any).note) : name;
    const targetElev = typeof latOrObj === 'object' ? latOrObj.elevation : elevation;

    const list = PointInspector.getBookmarks();
    const existingIdx = list.findIndex(b => Math.abs(b.lat - targetLat) < 0.0001 && Math.abs(b.lng - targetLng) < 0.0001);
    let added = false;
    if (existingIdx !== -1) {
      list.splice(existingIdx, 1);
      added = false;
    } else {
      const item: BookmarkedLocation = {
        id: `bm-${Date.now()}`,
        name: targetName || `Titik (${targetLat.toFixed(4)}, ${targetLng.toFixed(4)})`,
        lat: targetLat,
        lng: targetLng,
        elevation: targetElev,
        date: new Date().toLocaleDateString('id-ID')
      };
      list.unshift(item);
      added = true;
    }
    try {
      localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(list));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('webgis:bookmarks-updated', { detail: { list } }));
      }
    } catch {}
    return added;
  }

  constructor(
    map: maplibregl.Map,
    pikselLoader?: PikselLoader,
    geeLoader?: GEELoader,
    geojsonLoader?: GeoJsonLoader,
    measureTool?: MeasureTool
  ) {
    this.map = map;
    this.pikselLoader = pikselLoader;
    this.geeLoader = geeLoader;
    this.geojsonLoader = geojsonLoader;
    this.measureTool = measureTool;

    this.containerEl = document.getElementById('floating-inspector-card');
    this.bindMapEvents();
    this.bindCardActions();
  }

  private bindMapEvents() {
    this.map.on('click', (e) => {
      if (!this.isEnabled) return;
      if (document.body.classList.contains('swipe-mode-active')) return;
      if (document.body.classList.contains('aoi-drawing-active')) return;
      if (document.body.classList.contains('measure-drawing-active')) return;
      if (this.measureTool && this.measureTool.getMode() !== 'none') return;

      // Ignore if user clicked on another interactive marker, sidebar, dock, or drawing pill
      const originalTarget = (e.originalEvent?.target as HTMLElement);
      if (originalTarget && (originalTarget.closest('.mapboxgl-marker') || originalTarget.closest('#sidebar') || originalTarget.closest('.sidebar') || originalTarget.closest('.floating-inspector-card') || originalTarget.closest('.bottom-tools-dock') || originalTarget.closest('.glass-popover') || originalTarget.closest('.app-header') || originalTarget.closest('.swipe-ui-root') || originalTarget.closest('#swipe-compare-overlay') || originalTarget.closest('.aoi-floating-pill') || originalTarget.closest('.measure-floating-pill'))) {
        return;
      }

      // Automatically collapse sidebar on mobile when inspecting a point
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-if-mobile'));
      }

      this.inspectCoordinate(e.lngLat.lng, e.lngLat.lat, e.point);
    });
  }

  private bindCardActions() {
    const closeBtn = document.getElementById('floating-insp-close');
    closeBtn?.addEventListener('click', () => {
      this.close();
    });

    const copyBtn = document.getElementById('btn-insp-copy-coords');
    copyBtn?.addEventListener('click', () => {
      const coordsText = document.getElementById('insp-coord-decimal')?.innerText;
      if (!coordsText) return;

      const doCopy = () => {
        // Primary: modern Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(coordsText).then(() => {
            showToast('Koordinat WGS84 berhasil disalin ke papan klip!', 'success');
          }).catch(() => {
            fallbackCopy();
          });
        } else {
          fallbackCopy();
        }
      };

      const fallbackCopy = () => {
        // Fallback: temporary textarea + execCommand (works on mobile browsers & WebViews)
        try {
          const ta = document.createElement('textarea');
          ta.value = coordsText;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const success = document.execCommand('copy');
          document.body.removeChild(ta);
          if (success) {
            showToast('Koordinat WGS84 berhasil disalin ke papan klip!', 'success');
          } else {
            showToast('Gagal menyalin — salin secara manual: ' + coordsText, 'warning');
          }
        } catch {
          showToast('Gagal menyalin — salin secara manual: ' + coordsText, 'warning');
        }
      };

      doCopy();
    });

    const bookmarkBtn = document.getElementById('btn-insp-bookmark');
    bookmarkBtn?.addEventListener('click', () => {
      if (!this.currentInspected) {
        showToast('Pilih titik pada peta terlebih dahulu untuk menyimpan bookmark', 'warning');
        return;
      }
      const isAdded = PointInspector.toggleBookmark(
        this.currentInspected.lat,
        this.currentInspected.lng,
        this.currentInspected.name,
        this.currentInspected.elevation
      );
      if (bookmarkBtn) {
        bookmarkBtn.innerText = isAdded ? '⭐ Tersimpan' : '⭐ Simpan Bookmark';
      }
      showToast(isAdded ? '⭐ Lokasi berhasil disimpan ke Bookmark Favorit!' : 'Bookmark lokasi telah dihapus', 'info');
    });

    const extractTsBtn = document.getElementById('btn-insp-extract-ts');
    extractTsBtn?.addEventListener('click', async () => {
      if (!this.currentInspected) return;

      const container = document.getElementById('insp-ts-result-container');
      const loading = document.getElementById('insp-ts-loading');
      const chartWrap = document.getElementById('insp-ts-chart-wrap');
      const errBox = document.getElementById('insp-ts-error');
      const canvas = document.getElementById('insp-ts-canvas') as HTMLCanvasElement;

      if (!container || !loading || !chartWrap || !errBox || !canvas) return;

      container.style.display = 'block';
      loading.style.display = 'block';
      chartWrap.style.display = 'none';
      errBox.style.display = 'none';
      extractTsBtn.setAttribute('disabled', 'true');
      extractTsBtn.innerHTML = '<span class="btn-icon">⏳</span> Memproses...';

      try {
        const res = await fetch('/api/gee-timeseries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: this.currentInspected.lat,
            lon: this.currentInspected.lng,
            startDate: '2024-01-01',
            endDate: '2026-12-31'
          })
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Terjadi kesalahan pada server');
        }

        if (data.status === 'unconfigured') {
          throw new Error(data.message);
        }

        if (!data.data || data.data.length === 0) {
          throw new Error('Data time-series kosong untuk titik ini.');
        }

        this.chartState = { type: 'lst', lstData: data.data };
        this.drawMiniChart(canvas, data.data);
        loading.style.display = 'none';
        chartWrap.style.display = 'block';

      } catch (err: any) {
        loading.style.display = 'none';
        errBox.style.display = 'block';
        errBox.innerText = err.message;
      } finally {
        extractTsBtn.removeAttribute('disabled');
        extractTsBtn.innerHTML = '<span class="btn-icon">🔄</span> Muat Ulang LST';
      }
    });

    const extractPrecipBtn = document.getElementById('btn-insp-extract-precip');
    extractPrecipBtn?.addEventListener('click', async () => {
      if (!this.currentInspected) return;

      const container = document.getElementById('insp-ts-result-container');
      const loading = document.getElementById('insp-ts-loading');
      const chartWrap = document.getElementById('insp-ts-chart-wrap');
      const errBox = document.getElementById('insp-ts-error');
      const canvas = document.getElementById('insp-ts-canvas') as HTMLCanvasElement;

      if (!container || !loading || !chartWrap || !errBox || !canvas) return;

      container.style.display = 'block';
      loading.style.display = 'block';
      loading.innerText = 'Mengekstrak data presipitasi GEE (CHIRPS)...';
      chartWrap.style.display = 'none';
      errBox.style.display = 'none';
      extractPrecipBtn.setAttribute('disabled', 'true');
      extractPrecipBtn.innerHTML = '<span class="btn-icon">⏳</span> Memproses...';

      try {
        const periodSelect = document.getElementById('gee-precip-period-select') as HTMLSelectElement | null;
        const periodVal = periodSelect?.value || '2024-08-15';
        let startDate = '2024-08-01';
        let endDate = '2024-08-31';
        if (periodVal.startsWith('2024-01')) {
          startDate = '2024-01-01';
          endDate = '2024-01-31';
        } else if (periodVal.startsWith('2023-08')) {
          startDate = '2023-08-01';
          endDate = '2023-08-31';
        } else if (periodVal.startsWith('2023-01')) {
          startDate = '2023-01-01';
          endDate = '2023-01-31';
        } else if (periodVal.startsWith('2022-08')) {
          startDate = '2022-08-01';
          endDate = '2022-08-31';
        } else if (periodVal.startsWith('2021-01')) {
          startDate = '2021-01-01';
          endDate = '2021-01-31';
        } else {
          const match = periodVal.match(/^(\d{4})-(\d{2})/);
          if (match) {
            const y = match[1];
            const m = match[2];
            const lastDay = new Date(Number(y), Number(m), 0).getDate();
            startDate = `${y}-${m}-01`;
            endDate = `${y}-${m}-${lastDay}`;
          }
        }

        const res = await fetch('/api/gee-timeseries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: this.currentInspected.lat,
            lon: this.currentInspected.lng,
            startDate,
            endDate,
            satellite: 'precipitation'
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const records: Array<{ date: string; precip: number }> = json?.data || [];

        if (records.length === 0) {
          throw new Error('Data riwayat curah hujan GEE CHIRPS kosong untuk titik ini.');
        }

        const dates: string[] = records.map(r => r.date);
        const precipValues: number[] = records.map(r => r.precip || 0);

        this.chartState = { type: 'precip', precipDates: dates, precipValues: precipValues };
        this.drawPrecipChart(canvas, dates, precipValues);
        loading.style.display = 'none';
        chartWrap.style.display = 'block';
      } catch (err: any) {
        loading.style.display = 'none';
        errBox.style.display = 'block';
        errBox.innerText = err.message;
      } finally {
        extractPrecipBtn.removeAttribute('disabled');
        extractPrecipBtn.innerHTML = '<span class="btn-icon">🔄</span> Muat Ulang Hujan';
      }
    });

    // Interactive Hover & Touch Event Handlers for Time-Series Canvas
    const canvas = document.getElementById('insp-ts-canvas') as HTMLCanvasElement;
    const tooltip = document.getElementById('insp-ts-tooltip');

    const updateHover = (clientX: number) => {
      if (!this.chartState || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const scaleX = canvas.width / rect.width;
      const mouseX = (clientX - rect.left) * scaleX;
      const P = { top: 10, right: 10, bottom: 20, left: 25 };
      const cW = canvas.width - P.left - P.right;

      if (this.chartState.type === 'lst') {
        const data = this.chartState.lstData;
        const N = data.length;
        if (N === 0) return;
        const rawIdx = Math.round(((mouseX - P.left) / cW) * (N - 1));
        const idx = Math.max(0, Math.min(N - 1, rawIdx));
        this.drawMiniChart(canvas, data, idx);

        if (tooltip) {
          const d = data[idx];
          const xPixel = (P.left + (idx / (N - 1 || 1)) * cW) / scaleX;
          tooltip.style.display = 'block';
          tooltip.style.left = `${Math.max(55, Math.min(rect.width - 55, xPixel))}px`;

          const dayStr = d.day_c !== null ? `${d.day_c.toFixed(1)} °C` : '<span style="color:#64748b;">N/A (Awan)</span>';
          const nightStr = d.night_c !== null ? `${d.night_c.toFixed(1)} °C` : '<span style="color:#64748b;">N/A</span>';
          const deltaStr = (d.day_c !== null && d.night_c !== null)
            ? `Δ ${Math.abs(d.day_c - d.night_c).toFixed(1)} °C`
            : null;

          tooltip.innerHTML = `
            <div class="insp-chart-tooltip-date">📅 ${d.date || 'Tanggal N/A'}</div>
            <div class="insp-chart-tooltip-row"><span style="color:#ef4444;">☀️ LST Siang:</span> <strong>${dayStr}</strong></div>
            <div class="insp-chart-tooltip-row"><span style="color:#06b6d4;">🌙 LST Malam:</span> <strong>${nightStr}</strong></div>
            ${deltaStr ? `<div class="insp-chart-tooltip-row" style="color:#fbbf24; font-size:9px; border-top:1px dashed rgba(255,255,255,0.15); padding-top:2px; margin-top:2px;"><span>⚡ Fluktuasi:</span> <span>${deltaStr}</span></div>` : ''}
          `;
        }
      } else if (this.chartState.type === 'precip') {
        const dates = this.chartState.precipDates;
        const values = this.chartState.precipValues;
        const N = values.length;
        if (N === 0) return;
        const slotW = cW / N;
        const rawIdx = Math.floor((mouseX - P.left) / slotW);
        const idx = Math.max(0, Math.min(N - 1, rawIdx));
        this.drawPrecipChart(canvas, dates, values, idx);

        if (tooltip) {
          const v = values[idx] || 0;
          const d = dates[idx] || 'N/A';
          const xPixel = (P.left + (idx + 0.5) * slotW) / scaleX;
          tooltip.style.display = 'block';
          tooltip.style.left = `${Math.max(55, Math.min(rect.width - 55, xPixel))}px`;

          let cat = '☀️ Kering / Nihil';
          let color = '#94a3b8';
          if (v >= 50) { cat = '⛈️ Hujan Ekstrem'; color = '#ef4444'; }
          else if (v >= 20) { cat = '🌧️ Hujan Lebat'; color = '#f97316'; }
          else if (v >= 2.5) { cat = '🌦️ Hujan Sedang'; color = '#22c55e'; }
          else if (v > 0) { cat = '🌤️ Gerimis'; color = '#38bdf8'; }

          tooltip.innerHTML = `
            <div class="insp-chart-tooltip-date">📅 ${d}</div>
            <div class="insp-chart-tooltip-row"><span style="color:#4ade80;">🌧️ Curah Hujan:</span> <strong>${v.toFixed(1)} mm</strong></div>
            <div class="insp-chart-tooltip-row" style="font-size:9px; color:${color};"><span>Status:</span> <span>${cat}</span></div>
          `;
        }
      }
    };

    const clearHover = () => {
      if (!this.chartState || !canvas) return;
      if (tooltip) tooltip.style.display = 'none';
      if (this.chartState.type === 'lst') {
        this.drawMiniChart(canvas, this.chartState.lstData);
      } else if (this.chartState.type === 'precip') {
        this.drawPrecipChart(canvas, this.chartState.precipDates, this.chartState.precipValues);
      }
    };

    canvas?.addEventListener('mousemove', (e) => updateHover(e.clientX));
    canvas?.addEventListener('mouseleave', clearHover);
    canvas?.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) updateHover(e.touches[0].clientX);
    }, { passive: true });
    canvas?.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) updateHover(e.touches[0].clientX);
    }, { passive: true });
    canvas?.addEventListener('touchend', clearHover);
  }

  private drawMiniChart(canvas: HTMLCanvasElement, data: any[], hoverIndex?: number | null) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const width = 250;
    const height = 120;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const P = { top: 10, right: 10, bottom: 20, left: 25 };
    const cH = height - P.top - P.bottom;
    const cW = width - P.left - P.right;
    
    // Find min and max
    let minT = 100;
    let maxT = -100;
    data.forEach(d => {
      if (d.day_c !== null) { minT = Math.min(minT, d.day_c); maxT = Math.max(maxT, d.day_c); }
      if (d.night_c !== null) { minT = Math.min(minT, d.night_c); maxT = Math.max(maxT, d.night_c); }
    });
    
    // Fallback if no data or flat
    if (minT === maxT) { minT -= 5; maxT += 5; }
    if (minT === 100) { minT = 20; maxT = 40; }

    const yRange = maxT - minT;
    // Add 10% padding
    const yMin = minT - (yRange * 0.1);
    const yMax = maxT + (yRange * 0.1);
    const realRange = yMax - yMin;

    const toY = (v: number) => height - P.bottom - ((v - yMin) / realRange) * cH;
    const toX = (i: number) => P.left + (i / (data.length - 1 || 1)) * cW;

    // Grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.fillStyle = '#94a3b8'; 
    ctx.font = '9px Inter, sans-serif';
    
    // 3 horizontal lines
    [yMin, (yMin + yMax)/2, yMax].forEach(yV => {
      const y = toY(yV);
      ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(width - P.right, y); ctx.stroke();
      ctx.fillText(`${yV.toFixed(1)}`, 2, y + 3);
    });

    // Draw lines
    const drawLine = (key: 'day_c' | 'night_c', color: string) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      let first = true;
      data.forEach((d, i) => {
        if (d[key] !== null) {
          const x = toX(i);
          const y = toY(d[key]);
          if (first) { ctx.moveTo(x, y); first = false; }
          else { ctx.lineTo(x, y); }
        }
      });
      ctx.stroke();
    };

    drawLine('night_c', '#06b6d4'); // Cyan for night
    drawLine('day_c', '#ef4444');   // Red for day

    // Small dots for points
    data.forEach((d, i) => {
      const x = toX(i);
      if (d.night_c !== null) {
        ctx.beginPath();
        ctx.arc(x, toY(d.night_c), 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
      }
      if (d.day_c !== null) {
        ctx.beginPath();
        ctx.arc(x, toY(d.day_c), 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
      }
    });

    // Highlight hovered point with crosshair and glowing circles
    if (typeof hoverIndex === 'number' && data[hoverIndex]) {
      const x = toX(hoverIndex);
      const d = data[hoverIndex];

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, P.top);
      ctx.lineTo(x, height - P.bottom);
      ctx.stroke();
      ctx.restore();

      if (d.night_c !== null) {
        const y = toY(d.night_c);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }

      if (d.day_c !== null) {
        const y = toY(d.day_c);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }

    // Legend & Hint in top bar
    if (typeof hoverIndex === 'number' && data[hoverIndex]) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(data[hoverIndex].date || '', P.left, 9);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText('Hover titik untuk detail', P.left, 9);
    }

    ctx.fillStyle = '#ef4444'; ctx.fillText('Siang', width - P.right - 25, 10);
    ctx.fillStyle = '#06b6d4'; ctx.fillText('Malam', width - P.right - 25, 20);
  }

  private drawPrecipChart(canvas: HTMLCanvasElement, dates: string[], values: number[], hoverIndex?: number | null) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const width = 250;
    const height = 120;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const P = { top: 12, right: 10, bottom: 20, left: 25 };
    const cH = height - P.top - P.bottom;
    const cW = width - P.left - P.right;

    let maxVal = Math.max(...values, 5);
    const sumVal = values.reduce((a, b) => a + (b || 0), 0);

    const toY = (v: number) => height - P.bottom - (v / maxVal) * cH;

    // Grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8.5px Inter, sans-serif';

    [0, maxVal / 2, maxVal].forEach((yV) => {
      const y = toY(yV);
      ctx.beginPath();
      ctx.moveTo(P.left, y);
      ctx.lineTo(width - P.right, y);
      ctx.stroke();
      ctx.fillText(`${yV.toFixed(0)}m`, 2, y + 3);
    });

    // Bars
    const barWidth = Math.max(2, (cW / values.length) - 1.5);
    values.forEach((v, i) => {
      const x = P.left + i * (cW / values.length);
      const y = toY(v);
      const h = height - P.bottom - y;
      const isHover = (hoverIndex === i);

      if (isHover) {
        ctx.fillStyle = '#fde047'; // Bright yellow on hover
      } else if (v >= 20) {
        ctx.fillStyle = '#f97316'; // Hujan lebat
      } else if (v >= 2.5) {
        ctx.fillStyle = '#22c55e'; // Hujan sedang/ringan
      } else if (v > 0) {
        ctx.fillStyle = '#38bdf8'; // Gerimis
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; // Kering
      }

      ctx.fillRect(x, y, barWidth, Math.max(1, h));

      if (isHover) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, barWidth, Math.max(1, h));
      }
    });

    // Header label
    ctx.font = '9px Inter, sans-serif';
    if (typeof hoverIndex === 'number' && dates[hoverIndex]) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`📅 ${dates[hoverIndex]}: ${(values[hoverIndex] || 0).toFixed(1)} mm`, P.left, 9);
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`Total: ${sumVal.toFixed(1)} mm (${dates.length} Hari)`, P.left, 9);
      ctx.fillStyle = '#64748b';
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText('(Hover bar untuk detail)', width - P.right - 92, 9);
    }

    // Date range labels at bottom
    if (dates && dates.length > 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText(dates[0].slice(5), P.left, height - 5);
      ctx.fillText(dates[dates.length - 1].slice(5), width - P.right - 24, height - 5);
    }
  }

  public close() {
    if (this.containerEl) {
      this.containerEl.classList.remove('active');
    }
    const tooltip = document.getElementById('insp-ts-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    this.chartState = null;
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }

  public clear() {
    this.close();
  }

  /**
   * Convert Decimal Degrees to Degrees Minutes Seconds (DMS)
   */
  private toDMS(val: number, isLat: boolean): string {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    return `${deg}° ${min}' ${sec}" ${dir}`;
  }

  public inspectCoordinate(lng: number, lat: number, screenPoint?: maplibregl.PointLike) {
    // 1. Check Active Layer Information
    let activeLayerName = 'Peta Dasar (Basemap)';
    let activeLayerCategory = 'Peta Dasar';

    const pikselProduct = this.pikselLoader?.getActiveProduct();
    if (pikselProduct) {
      const year = this.pikselLoader?.getSelectedYear() || '2025';
      activeLayerName = `${pikselProduct.name} (${year})`;
      activeLayerCategory = `Piksel OGC WMS (${pikselProduct.resolution || '10m'})`;
    } else if (this.geeLoader) {
      if (this.geeLoader.isLayerVisible('precipitation')) {
        activeLayerName = 'Curah Hujan Radar Satelit (NASA GPM / GEE)';
        activeLayerCategory = 'Presipitasi Radar · mm/hari (Transparan)';
      } else if (this.geeLoader.isLayerVisible('lst-day')) {
        activeLayerName = 'NASA MODIS LST Siang (1 km)';
        activeLayerCategory = 'NASA LP DAAC · MOD11A2 / MYD11A2';
      } else if (this.geeLoader.isLayerVisible('lst-night')) {
        activeLayerName = 'NASA MODIS LST Malam (1 km)';
        activeLayerCategory = 'NASA LP DAAC · MOD11A2 / MYD11A2';
      } else if (this.geeLoader.isLayerVisible('landcover')) {
        activeLayerName = 'ESA WorldCover v200 (Tutupan Lahan)';
        activeLayerCategory = 'ESA / Impact Observatory (10m)';
      }
    }

    // 2. Query Real Vector Features at Point (from custom GeoJSON layers & sample cities)
    let vectorFeatureName: string | undefined = undefined;
    let vectorProperties: Record<string, any> | undefined = undefined;

    if (screenPoint) {
      const px = Array.isArray(screenPoint) ? screenPoint[0] : (screenPoint as maplibregl.Point).x;
      const py = Array.isArray(screenPoint) ? screenPoint[1] : (screenPoint as maplibregl.Point).y;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [px - 8, py - 8],
        [px + 8, py + 8]
      ];
      
      const customLayers = this.geojsonLoader?.getLayers() || [];
      for (const cl of customLayers) {
        if (!cl.visible) continue;
        const candidateLayerIds = [`layer-point-${cl.id}`, `layer-fill-${cl.id}`, `layer-line-${cl.id}`]
          .filter(lId => this.map.getLayer(lId));
        
        if (candidateLayerIds.length === 0) continue;

        const features = this.map.queryRenderedFeatures(bbox, {
          layers: candidateLayerIds
        });

        if (features && features.length > 0) {
          const f = features[0];
          const props = f.properties || {};
          vectorFeatureName = props.name || props.nama_obj || props.NAMOBJ || props.Kabupaten || props.Kota || cl.name;
          vectorProperties = props;
          break;
        }
      }
    }

    // 3. Query Terrain DEM Elevation (if 3D terrain active or DEM available)
    let elevationM: number | null = null;
    try {
      if (typeof (this.map as any).queryTerrainElevation === 'function') {
        const el = (this.map as any).queryTerrainElevation([lng, lat]);
        if (typeof el === 'number' && !isNaN(el)) {
          elevationM = el;
        }
      }
    } catch {
      // Ignore if terrain is not yet initialized or out of bounds
    }

    // 4. Render Floating Card UI
    this.renderInspectorCard(lng, lat, activeLayerName, activeLayerCategory, vectorFeatureName, vectorProperties, elevationM);

    // 5. Place Glowing Pin Marker on Map
    this.placePinMarker(lng, lat);

    // 6. Asynchronously Query Real OGC WMS GetFeatureInfo (if raster layer active)
    this.queryWMSGetFeatureInfo(lng, lat, screenPoint);
  }

  private async queryWMSGetFeatureInfo(lng: number, lat: number, screenPoint?: maplibregl.PointLike) {
    const rasterStatusEl = document.getElementById('insp-raster-query-status');
    const pikselProduct = this.pikselLoader?.getActiveProduct();
    
    if (!pikselProduct) {
      if (rasterStatusEl) {
        if (this.geeLoader?.isLayerVisible('precipitation')) {
          rasterStatusEl.innerText = 'Presipitasi Radar Satelit Aktif (NASA GPM · Transparan 100%)';
          rasterStatusEl.style.color = '#22c55e';
        } else if (this.geeLoader?.isLayerVisible('lst-day') || this.geeLoader?.isLayerVisible('lst-night')) {
          rasterStatusEl.innerText = 'Radiansi Termal MODIS LST 1km Aktif (Klik titik stasiun untuk observasi detail)';
          rasterStatusEl.style.color = '#f59e0b';
        } else if (this.geeLoader?.isLayerVisible('landcover')) {
          rasterStatusEl.innerText = 'Sentinel-2 10m LULC Aktif (Klasifikasi Tutupan Lahan ESA)';
          rasterStatusEl.style.color = '#10b981';
        } else {
          rasterStatusEl.innerText = 'Peta visual (Tidak ada citra WMS aktif)';
          rasterStatusEl.style.color = 'var(--text-muted)';
        }
      }
      return;
    }

    if (rasterStatusEl) {
      rasterStatusEl.innerText = 'Meminta GetFeatureInfo dari server BIG Piksel...';
      rasterStatusEl.style.color = '#38bdf8';
    }

    try {
      const bounds = this.map.getBounds();
      const canvas = this.map.getCanvas();
      const width = canvas.clientWidth || 800;
      const height = canvas.clientHeight || 600;

      let x = 0;
      let y = 0;
      if (screenPoint) {
        x = Math.round(Array.isArray(screenPoint) ? screenPoint[0] : (screenPoint as maplibregl.Point).x);
        y = Math.round(Array.isArray(screenPoint) ? screenPoint[1] : (screenPoint as maplibregl.Point).y);
      } else {
        const pt = this.map.project([lng, lat]);
        x = Math.round(pt.x);
        y = Math.round(pt.y);
      }

      // Clamp coordinate within viewport bounds
      x = Math.max(0, Math.min(width, x));
      y = Math.max(0, Math.min(height, y));

      const bboxStr = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
      const year = this.pikselLoader?.getSelectedYear() || '2025';

      const rawServiceUrl = pikselProduct.serviceUrl || 'https://ows.staging.piksel.big.go.id/wms';
      const fullUrlStr = rawServiceUrl.startsWith('http')
        ? rawServiceUrl
        : (typeof window !== 'undefined' ? `${window.location.origin}${rawServiceUrl}` : `https://ows.staging.piksel.big.go.id${rawServiceUrl}`);
      // Use WMS proxy to avoid CORS errors for GetFeatureInfo
      const url = new URL('/api/wms-proxy', window.location.origin);
      url.searchParams.set('wmsUrl', fullUrlStr);
      url.searchParams.set('SERVICE', 'WMS');
      url.searchParams.set('VERSION', '1.3.0');
      url.searchParams.set('REQUEST', 'GetFeatureInfo');
      url.searchParams.set('LAYERS', pikselProduct.layer);
      url.searchParams.set('QUERY_LAYERS', pikselProduct.layer);
      url.searchParams.set('STYLES', pikselProduct.style || '');
      url.searchParams.set('CRS', 'EPSG:4326');
      url.searchParams.set('BBOX', bboxStr);
      url.searchParams.set('WIDTH', String(width));
      url.searchParams.set('HEIGHT', String(height));
      url.searchParams.set('I', String(x));
      url.searchParams.set('J', String(y));
      url.searchParams.set('INFO_FORMAT', 'application/json');
      if (pikselProduct.timeEnabled) {
        url.searchParams.set('TIME', `${year}-01-01`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(text);
      } catch {}

      if (parsedJson && parsedJson.features && parsedJson.features.length > 0) {
        const props = parsedJson.features[0].properties || {};
        const entries = Object.entries(props);
        if (entries.length > 0) {
          const summary = entries
            .slice(0, 3)
            .map(([k, v]) => `<span style="color:#00f0ff;">${escapeHtml(k)}:</span> ${escapeHtml(String(v))}`)
            .join(' · ');
          if (rasterStatusEl) {
            rasterStatusEl.innerHTML = `<strong>Data Piksel:</strong> ${summary}`;
            rasterStatusEl.style.color = '#00f0ff';
          }
        } else {
          const rawVal = props.value ?? props.gray_index ?? props.band_1 ?? 'Data terdeteksi';
          const val = escapeHtml(String(rawVal));
          if (rasterStatusEl) {
            rasterStatusEl.innerHTML = `<strong style="color: #00f0ff;">Piksel Terdeteksi: ${val}</strong> (GetFeatureInfo)`;
            rasterStatusEl.style.color = '#00f0ff';
          }
        }
      } else if (text && text.trim().length > 0 && !text.includes('<?xml') && !text.includes('ServiceException')) {
        if (rasterStatusEl) {
          rasterStatusEl.innerText = `Hasil OGC: ${text.substring(0, 50)}`;
          rasterStatusEl.style.color = '#cbd5e1';
        }
      } else {
        if (rasterStatusEl) {
          rasterStatusEl.innerText = 'Visualisasi Citra WMS (Dirender sebagai lapisan peta)';
          rasterStatusEl.style.color = 'var(--text-muted)';
        }
      }
    } catch (e) {
      if (rasterStatusEl) {
        rasterStatusEl.innerText = 'Visualisasi Citra WMS (Dirender sebagai lapisan peta)';
        rasterStatusEl.style.color = 'var(--text-muted)';
      }
    }
  }

  private renderInspectorCard(
    lng: number,
    lat: number,
    activeLayerName: string,
    activeLayerCategory: string,
    vectorName?: string,
    vectorProps?: Record<string, any>,
    elevationM?: number | null
  ) {
    if (!this.containerEl) {
      this.containerEl = document.getElementById('floating-inspector-card');
    }
    if (!this.containerEl) return;

    const latDms = this.toDMS(lat, true);
    const lngDms = this.toDMS(lng, false);

    const latEl = document.getElementById('insp-lat');
    const lngEl = document.getElementById('insp-lng');
    const decimalEl = document.getElementById('insp-coord-decimal');
    const productNameEl = document.getElementById('insp-product-name');
    const productValEl = document.getElementById('insp-product-val');
    const vectorWrapEl = document.getElementById('insp-vector-row');
    const vectorValEl = document.getElementById('insp-vector-val');
    const vectorPropsSlot = document.getElementById('insp-vector-props-slot');

    if (latEl) latEl.innerText = latDms;
    if (lngEl) lngEl.innerText = lngDms;
    if (decimalEl) decimalEl.innerText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    // Real Terrain Elevation in meters above sea level (mdpl)
    const elvEl = document.getElementById('insp-elevation');
    if (elvEl) {
      if (elevationM !== null && elevationM !== undefined) {
        const rounded = Math.round(elevationM);
        if (rounded === 0) {
          elvEl.innerText = '🌊 0 mdpl (Muka Laut)';
        } else if (rounded > 0) {
          elvEl.innerText = `⛰️ ${rounded.toLocaleString('id-ID')} mdpl`;
        } else {
          elvEl.innerText = `🔻 ${Math.abs(rounded).toLocaleString('id-ID')} m (Bawah Laut)`;
        }
      } else {
        elvEl.innerText = 'Aktifkan Medan 3D untuk mdpl';
      }
    }

    const lstEl = document.getElementById('insp-lst');
    if (lstEl) lstEl.innerText = 'Tidak Tersedia (Kueri WMS)';

    if (productNameEl && productValEl) {
      productNameEl.innerText = 'Lapisan Aktif';
      productValEl.innerText = `${activeLayerName} · ${activeLayerCategory}`;
    }

    if (vectorWrapEl && vectorValEl) {
      if (vectorName) {
        vectorValEl.innerText = vectorName;
        vectorWrapEl.style.display = 'block';

        if (vectorPropsSlot && vectorProps) {
          const rows = Object.entries(vectorProps)
            .filter(([k]) => k !== 'name' && k !== 'nama_obj')
            .slice(0, 4)
            .map(([k, v]) => `
              <div class="insp-row" style="font-size: 11px; padding: 2px 0;">
                <span class="insp-label" style="color: #64748b;">${escapeHtml(k)}:</span>
                <span class="insp-val" style="color: #cbd5e1;">${escapeHtml(String(v))}</span>
              </div>
            `).join('');
          vectorPropsSlot.innerHTML = rows;
        }
      } else {
        vectorWrapEl.style.display = 'none';
        if (vectorPropsSlot) vectorPropsSlot.innerHTML = '';
      }
    }

    this.currentInspected = {
      lat,
      lng,
      name: vectorName || `Titik Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      elevation: elevationM !== null && elevationM !== undefined ? `${Math.round(elevationM)} mdpl` : undefined
    };

    const bookmarkBtn = document.getElementById('btn-insp-bookmark');
    if (bookmarkBtn) {
      const isBm = PointInspector.isBookmarked(lat, lng);
      bookmarkBtn.innerText = isBm ? '⭐ Tersimpan' : '⭐ Simpan Bookmark';
    }

    // Reset Time-series UI
    const tsContainer = document.getElementById('insp-ts-result-container');
    const extractTsBtn = document.getElementById('btn-insp-extract-ts');
    const extractPrecipBtn = document.getElementById('btn-insp-extract-precip');
    const tooltip = document.getElementById('insp-ts-tooltip');
    if (tsContainer) tsContainer.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
    this.chartState = null;
    if (extractTsBtn) {
      extractTsBtn.removeAttribute('disabled');
      extractTsBtn.innerHTML = '<span class="btn-icon">📈</span> Deret LST';
    }
    if (extractPrecipBtn) {
      extractPrecipBtn.removeAttribute('disabled');
      extractPrecipBtn.innerHTML = '<span class="btn-icon">🌧️</span> Histori Hujan';
    }

    this.containerEl.classList.add('active');
  }

  private placePinMarker(lng: number, lat: number) {
    if (this.marker) {
      this.marker.remove();
    }

    const el = document.createElement('div');
    el.className = 'inspector-pin-marker';
    el.innerHTML = `
      <div class="pin-pulse"></div>
      <div class="pin-core"></div>
    `;

    // Defensive polyfill for maplibre-gl mock/test transform compatibility
    const camTransform = (this.map as any)?._camera?.transform;
    if (camTransform && typeof camTransform.isLocationOccluded !== 'function') {
      camTransform.isLocationOccluded = () => false;
    }
    const mapTransform = (this.map as any)?.transform;
    if (mapTransform && typeof mapTransform.isLocationOccluded !== 'function') {
      mapTransform.isLocationOccluded = () => false;
    }

    try {
      this.marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(this.map);
    } catch (err) {
      logger.warn('[PointInspector] Failed to add pin marker:', err);
    }
  }
}
