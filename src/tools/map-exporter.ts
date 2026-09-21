import * as maplibregl from 'maplibre-gl';
import { PikselLoader } from './piksel-loader';
import { logger } from '../utils/logger';
import { showToast } from '../ui/toast';
import { announceToScreenReader } from '../utils/a11y';

export interface LegendItem {
  label: string;
  color: string;
}

export interface MapExportOptions {
  title?: string;
  subtitle?: string;
  aspectRatio?: 'current' | '16:9' | '4:3' | 'a4-landscape' | '1:1';
  resolutionScale?: number;
  includeNorthArrow?: boolean;
  includeScaleBar?: boolean;
  includeLegend?: boolean;
  includeMetadata?: boolean;
  format?: 'image/png' | 'image/jpeg';
  legendItems?: LegendItem[];
}

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
    this.exportWithOptions({}, btnElement);
  }

  public exportWithOptions(options: MapExportOptions = {}, btnElement?: HTMLButtonElement | null) {
    const originalHtml = btnElement ? btnElement.innerHTML : '';
    if (btnElement) {
      btnElement.innerHTML = `
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span class="btn-text-label">Memproses Ekspor...</span>
      `;
      btnElement.disabled = true;
    }

    let isHandled = false;

    // Timeout guard in case render event does not fire
    const timeoutId = setTimeout(() => {
      if (!isHandled) {
        isHandled = true;
        logger.warn('[MapExporter] Render event timeout, performing direct canvas capture fallback');
        this.performCapture(options, btnElement, originalHtml);
      }
    }, 2500);

    this.map.once('render', () => {
      if (!isHandled) {
        isHandled = true;
        clearTimeout(timeoutId);
        this.performCapture(options, btnElement, originalHtml);
      }
    });

    this.map.triggerRepaint();
  }

  private performCapture(
    options: MapExportOptions = {},
    btnElement?: HTMLButtonElement | null,
    originalHtml: string = ''
  ) {
    try {
      const mapCanvas = this.map.getCanvas();
      if (!mapCanvas) {
        throw new Error('Elemen kanvas peta tidak ditemukan.');
      }

      const srcW = mapCanvas.width;
      const srcH = mapCanvas.height;
      const scale = options.resolutionScale || 1;

      // 1. Calculate Aspect Ratio Crop Box
      let sx = 0;
      let sy = 0;
      let sw = srcW;
      let sh = srcH;

      const ratioKey = options.aspectRatio || 'current';
      let targetRatio = srcW / srcH;

      if (ratioKey === '16:9') targetRatio = 16 / 9;
      else if (ratioKey === '4:3') targetRatio = 4 / 3;
      else if (ratioKey === 'a4-landscape') targetRatio = 1.414;
      else if (ratioKey === '1:1') targetRatio = 1.0;

      if (ratioKey !== 'current') {
        const currentRatio = srcW / srcH;
        if (currentRatio > targetRatio) {
          sw = srcH * targetRatio;
          sh = srcH;
          sx = (srcW - sw) / 2;
          sy = 0;
        } else {
          sw = srcW;
          sh = srcW / targetRatio;
          sx = 0;
          sy = (srcH - sh) / 2;
        }
      }

      const outW = Math.round(sw * scale);
      const outH = Math.round(sh * scale);

      // Create high-res composite canvas
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context tidak tersedia.');
      }

      // 2. Draw Cropped/Scaled Map Canvas
      ctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

      // 3. Draw Top Cartographic Banner (if Title / Metadata enabled)
      const topBarHeight = Math.max(54 * scale, Math.round(outH * 0.068));
      ctx.fillStyle = 'rgba(9, 14, 27, 0.9)';
      ctx.fillRect(0, 0, outW, topBarHeight);

      // Top Accent Line
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(0, topBarHeight - Math.max(2, Math.round(2 * scale)), outW, Math.max(2, Math.round(2 * scale)));

      // Title Text
      const titleText = options.title?.trim() || 'Digital Earth Indonesia WebGIS';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(14, Math.round(topBarHeight * 0.35))}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(titleText, 20 * scale, Math.round(topBarHeight * 0.44));

      // Subtitle
      const activeProduct = this.pikselLoader?.getActiveProduct();
      const activeYear = this.pikselLoader?.getSelectedYear() || '2025';
      const defaultSub = activeProduct
        ? `${activeProduct.name} (${activeYear}) • OGC WMS (10m)`
        : 'Sistem Informasi Geografis & Analisis Spasial Nasional';
      const subText = options.subtitle?.trim() || defaultSub;

      ctx.fillStyle = '#94a3b8';
      ctx.font = `${Math.max(11, Math.round(topBarHeight * 0.24))}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.fillText(subText, 20 * scale, Math.round(topBarHeight * 0.78));

      // 4. Draw North Arrow (Top-Right)
      if (options.includeNorthArrow !== false) {
        const bearing = this.map.getBearing();
        const naX = outW - 45 * scale;
        const naY = topBarHeight + 42 * scale;
        const naSize = 20 * scale;

        ctx.save();
        ctx.translate(naX, naY);
        ctx.rotate((-bearing * Math.PI) / 180);

        // Draw North Pointer (Cyan)
        ctx.beginPath();
        ctx.moveTo(0, -naSize);
        ctx.lineTo(naSize * 0.4, 0);
        ctx.lineTo(0, -naSize * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#00f0ff';
        ctx.fill();

        // Draw North Pointer Left Shade (White)
        ctx.beginPath();
        ctx.moveTo(0, -naSize);
        ctx.lineTo(-naSize * 0.4, 0);
        ctx.lineTo(0, -naSize * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Draw South Pointer (Dark Slate)
        ctx.beginPath();
        ctx.moveTo(0, naSize * 0.8);
        ctx.lineTo(naSize * 0.35, 0);
        ctx.lineTo(0, -naSize * 0.2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(100, 116, 139, 0.8)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, naSize * 0.8);
        ctx.lineTo(-naSize * 0.35, 0);
        ctx.lineTo(0, -naSize * 0.2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.fill();

        // North 'N' letter
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(10, Math.round(11 * scale))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('N', 0, -naSize - 4 * scale);
        ctx.restore();
      }

      // 5. Draw Dynamic Cartographic Scale Bar (Bottom-Left)
      if (options.includeScaleBar !== false) {
        const center = this.map.getCenter();
        const zoomNum = this.map.getZoom();
        const metersPerPixel = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoomNum) / scale;
        const targetPixels = Math.min(220 * scale, Math.max(90 * scale, Math.round(outW * 0.16)));
        const rawDistance = metersPerPixel * targetPixels;

        const magnitudes = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
        let chosenDistance = magnitudes[0];
        for (const m of magnitudes) {
          if (m <= rawDistance) chosenDistance = m;
          else break;
        }

        const scaleBarPixels = chosenDistance / metersPerPixel;
        const sbX = 24 * scale;
        const bottomBarHeight = Math.max(34 * scale, Math.round(outH * 0.04));
        const sbY = outH - bottomBarHeight - 26 * scale;
        const distLabel = chosenDistance >= 1000 ? `${chosenDistance / 1000} km` : `${chosenDistance} m`;

        // Background plate for scale bar
        ctx.fillStyle = 'rgba(9, 14, 27, 0.88)';
        ctx.fillRect(sbX - 6 * scale, sbY - 14 * scale, scaleBarPixels + 12 * scale, 24 * scale);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = Math.max(1, Math.round(1 * scale));
        ctx.strokeRect(sbX - 6 * scale, sbY - 14 * scale, scaleBarPixels + 12 * scale, 24 * scale);

        // Alternating scale bar lines
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(sbX, sbY, scaleBarPixels / 2, 4 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sbX + scaleBarPixels / 2, sbY, scaleBarPixels / 2, 4 * scale);

        // Labels
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(9, Math.round(10 * scale))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText('0', sbX, sbY - 4 * scale);
        ctx.textAlign = 'right';
        ctx.fillText(distLabel, sbX + scaleBarPixels, sbY - 4 * scale);
      }

      // 6. Draw Embedded Legend Plate (Bottom-Right or Top-Right if requested)
      if (options.includeLegend && options.legendItems && options.legendItems.length > 0) {
        const bottomBarHeight = Math.max(34 * scale, Math.round(outH * 0.04));
        const legItemHeight = 18 * scale;
        const legWidth = Math.min(240 * scale, Math.max(160 * scale, Math.round(outW * 0.22)));
        const legHeight = 28 * scale + options.legendItems.length * legItemHeight;
        const legX = outW - legWidth - 20 * scale;
        const legY = outH - bottomBarHeight - legHeight - 12 * scale;

        // Legend Background
        ctx.fillStyle = 'rgba(9, 14, 27, 0.9)';
        ctx.fillRect(legX, legY, legWidth, legHeight);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legX, legY, legWidth, legHeight);

        // Legend Title
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(10, Math.round(11 * scale))}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText('Legenda Peta', legX + 10 * scale, legY + 18 * scale);

        // Legend Items
        options.legendItems.forEach((item, i) => {
          const iy = legY + 34 * scale + i * legItemHeight;
          ctx.fillStyle = item.color || '#00f0ff';
          ctx.fillRect(legX + 10 * scale, iy - 8 * scale, 12 * scale, 10 * scale);
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(legX + 10 * scale, iy - 8 * scale, 12 * scale, 10 * scale);

          ctx.fillStyle = '#e2e8f0';
          ctx.font = `${Math.max(9, Math.round(10 * scale))}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillText(item.label.substring(0, 26), legX + 28 * scale, iy);
        });
      }

      // 7. Draw Bottom GIS Metadata Strip
      if (options.includeMetadata !== false) {
        const center = this.map.getCenter();
        const zoomNum = this.map.getZoom();
        const bottomBarHeight = Math.max(34 * scale, Math.round(outH * 0.04));
        ctx.fillStyle = 'rgba(9, 14, 27, 0.92)';
        ctx.fillRect(0, outH - bottomBarHeight, outW, bottomBarHeight);

        // Bottom Accent Line
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, outH - bottomBarHeight, outW, 1);

        const coordsText = `Lat: ${center.lat.toFixed(4)}°, Lng: ${center.lng.toFixed(4)}° | Zoom: ${zoomNum.toFixed(2)} | CRS: EPSG:3857`;
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

        ctx.fillStyle = '#cbd5e1';
        ctx.font = `${Math.max(10, Math.round(bottomBarHeight * 0.36))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(coordsText, 20 * scale, outH - Math.round(bottomBarHeight * 0.38));

        ctx.textAlign = 'right';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Diekspor: ${nowStr} • BIG / Open Data Cube`, outW - 20 * scale, outH - Math.round(bottomBarHeight * 0.38));
      }

      // 8. Trigger download
      const mimeType = options.format === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const ext = options.format === 'image/jpeg' ? 'jpg' : 'png';
      let dataUrl: string;

      try {
        dataUrl = outCanvas.toDataURL(mimeType, 0.92);
      } catch (corsErr: any) {
        logger.error('[MapExporter] Tainted canvas error (CORS):', corsErr);
        showToast('Lapisan raster dibatasi CORS; peta diekspor dengan basemap dan overlay vektor saja.', 'warning', 6000);
        return;
      }

      const link = document.createElement('a');
      link.download = `webgis-peta-kartografis-${Date.now()}.${ext}`;
      link.href = dataUrl;
      link.click();

      showToast(`Peta kartografis resolusi tinggi (${outW}x${outH} px) berhasil diekspor!`, 'success');
      announceToScreenReader('Peta resolusi tinggi berhasil diunduh.');
    } catch (e: any) {
      logger.error('Export error:', e);
      showToast(`Gagal mengekspor peta: ${e.message || 'Kesalahan perenderan'}`, 'error');
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

