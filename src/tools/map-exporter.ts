import * as maplibregl from 'maplibre-gl';
import { PikselLoader } from './piksel-loader';
import { logger } from '../utils/logger';
import { showToast } from '../ui/toast';
import { announceToScreenReader } from '../utils/a11y';

export class MapExporter {
  private map: maplibregl.Map;
  private pikselLoader?: PikselLoader;

  constructor(map: maplibregl.Map, pikselLoader?: PikselLoader) {
    this.map = map;
    this.pikselLoader = pikselLoader;
  }

  public setPikselLoader(loader: PikselLoader) {
    this.pikselLoader = loader;
  }

  public exportPNG(btnElement?: HTMLButtonElement | null) {
    const originalHtml = btnElement ? btnElement.innerHTML : '';
    if (btnElement) {
      btnElement.innerHTML = `
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span class="btn-text-label">Memproses...</span>
      `;
      btnElement.disabled = true;
    }

    let isHandled = false;

    // Timeout guard in case render event does not fire (prevents button stuck in spinning state)
    const timeoutId = setTimeout(() => {
      if (!isHandled) {
        isHandled = true;
        logger.warn('[MapExporter] Render event timeout, performing direct canvas capture fallback');
        this.performCapture(btnElement, originalHtml);
      }
    }, 2500);

    this.map.once('render', () => {
      if (!isHandled) {
        isHandled = true;
        clearTimeout(timeoutId);
        this.performCapture(btnElement, originalHtml);
      }
    });

    this.map.triggerRepaint();
  }

  private performCapture(btnElement?: HTMLButtonElement | null, originalHtml: string = '') {
    try {
      const mapCanvas = this.map.getCanvas();
      if (!mapCanvas) {
        throw new Error('Elemen canvas peta tidak ditemukan.');
      }

      const w = mapCanvas.width;
      const h = mapCanvas.height;

      // Create high-res composite canvas
      const outCanvas = document.createElement('canvas');
      outCanvas.width = w;
      outCanvas.height = h;
      const ctx = outCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context tidak tersedia.');
      }

      // 1. Draw Map Canvas
      ctx.drawImage(mapCanvas, 0, 0);

      // 2. Draw Top GIS Title Banner
      const topBarHeight = Math.max(54, Math.round(h * 0.065));
      ctx.fillStyle = 'rgba(9, 14, 27, 0.88)';
      ctx.fillRect(0, 0, w, topBarHeight);

      // Top Accent Line
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(0, topBarHeight - 2, w, 2);

      // Title Text
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(14, Math.round(topBarHeight * 0.34))}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('Digital Earth Indonesia WebGIS', 20, Math.round(topBarHeight * 0.44));

      // Subtitle (Active Layers & Basemap)
      const activeProduct = this.pikselLoader?.getActiveProduct();
      const activeYear = this.pikselLoader?.getSelectedYear() || '2025';
      const prodText = activeProduct
        ? `${activeProduct.name} (${activeYear}) • OGC WMS (10m)`
        : 'Peta Analisis Geospasial Nasional';
      ctx.fillStyle = '#94a3b8';
      ctx.font = `${Math.max(11, Math.round(topBarHeight * 0.24))}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(prodText, 20, Math.round(topBarHeight * 0.78));

      // 3. Draw Bottom GIS Metadata Strip
      const bottomBarHeight = Math.max(34, Math.round(h * 0.04));
      ctx.fillStyle = 'rgba(9, 14, 27, 0.88)';
      ctx.fillRect(0, h - bottomBarHeight, w, bottomBarHeight);

      // Bottom Accent Line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, h - bottomBarHeight, w, 1);

      const center = this.map.getCenter();
      const zoom = this.map.getZoom().toFixed(2);
      const coordsText = `Lat: ${center.lat.toFixed(4)}°, Lng: ${center.lng.toFixed(4)}° | Zoom: ${zoom} | CRS: EPSG:3857`;
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `${Math.max(10, Math.round(bottomBarHeight * 0.36))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(coordsText, 20, h - Math.round(bottomBarHeight * 0.38));

      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Diekspor: ${nowStr} • BIG / Open Data Cube`, w - 20, h - Math.round(bottomBarHeight * 0.38));

      // Trigger download
      let dataUrl: string;
      try {
        dataUrl = outCanvas.toDataURL('image/png');
      } catch (corsErr: any) {
        logger.error('[MapExporter] Tainted canvas error (CORS):', corsErr);
        showToast('Lapisan raster eksternal dibatasi CORS oleh server sumber sehingga tidak dapat diekspor langsung.', 'warning', 6000);
        return;
      }

      const link = document.createElement('a');
      link.download = `digital-earth-indonesia-map-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      
      showToast('Peta grafis resolusi tinggi berhasil disimpan!', 'success');
      announceToScreenReader('Peta grafis resolusi tinggi berhasil diunduh.');
    } catch (e: any) {
      logger.error('Export error:', e);
      showToast(`Gagal mengekspor peta: ${e.message || 'Kendala rendering'}`, 'error');
    } finally {
      if (btnElement) {
        setTimeout(() => {
          btnElement.innerHTML = originalHtml;
          btnElement.disabled = false;
        }, 800);
      }
    }
  }
}
