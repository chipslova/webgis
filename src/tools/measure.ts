import * as maplibregl from 'maplibre-gl';
import { lineString, polygon } from '@turf/helpers';
import { length } from '@turf/length';
import { area } from '@turf/area';
import { logger } from '../utils/logger';
import { showToast } from '../ui/toast';
import { announceToScreenReader } from '../utils/a11y';

export type MeasureMode = 'none' | 'distance' | 'area';

export interface ElevationProfilePoint {
  distanceKm: number;
  elevationM: number;
  coord: [number, number];
}

export interface ElevationProfileSummary {
  minElevation: number;
  maxElevation: number;
  totalGain: number;
  totalLoss: number;
  points: ElevationProfilePoint[];
}

export interface MeasureResult {
  text: string;
  mode: MeasureMode;
  profile?: ElevationProfileSummary | null;
}

export class MeasureTool {
  private map: maplibregl.Map;
  private mode: MeasureMode = 'none';
  private points: [number, number][] = [];
  private isFinished: boolean = false;
  private geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  private tooltip: maplibregl.Popup | null = null;
  private hoverMarker: maplibregl.Marker | null = null;
  private onResultCallback?: (result: MeasureResult) => void;
  private onFinishCallback?: () => void;
  private onCancelCallback?: () => void;
  private onModeChangeCallback?: (mode: MeasureMode) => void;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.initLayers();
    this.bindEvents();
    // NOTE: style.load listener centralized in MapManager.onStyleReady()
  }

  public initLayers() {
    if (!this.map) return;
    if (!this.map.getStyle()) {
      this.map.once('style.load', () => this.initLayers());
      return;
    }

    try {
      if (!this.map.getSource('measure-source')) {
        this.map.addSource('measure-source', {
          type: 'geojson',
          data: this.geojson
        });
      }

      // 1. Fill layer for Area measurement (STRICTLY renders only Polygon features during Area mode)
      if (!this.map.getLayer('measure-fill')) {
        this.map.addLayer({
          id: 'measure-fill',
          type: 'fill',
          source: 'measure-source',
          filter: ['==', '$type', 'Polygon'],
          layout: {
            visibility: this.mode === 'area' ? 'visible' : 'none'
          },
          paint: {
            'fill-color': '#00f0ff',
            'fill-opacity': 0.22
          }
        });
      }

      // 2a. Dark casing for satellite contrast
      if (!this.map.getLayer('measure-line-casing')) {
        this.map.addLayer({
          id: 'measure-line-casing',
          type: 'line',
          source: 'measure-source',
          paint: {
            'line-color': '#0f172a',
            'line-width': 7,
            'line-opacity': 0.6
          }
        });
      }

      // 2b. Line layer for Distance path and Area perimeter (natively renders LineString & Polygon outlines)
      if (!this.map.getLayer('measure-line')) {
        this.map.addLayer({
          id: 'measure-line',
          type: 'line',
          source: 'measure-source',
          paint: {
            'line-color': '#00f0ff',
            'line-width': 4,
            'line-dasharray': [2, 2]
          }
        });
      }

      // 3. Point layer for Vertices (natively renders Point features)
      if (!this.map.getLayer('measure-points')) {
        this.map.addLayer({
          id: 'measure-points',
          type: 'circle',
          source: 'measure-source',
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffffff',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#00f0ff'
          }
        });
      }
    } catch (e) {
      logger.warn('Notice initializing MeasureTool layers:', e);
    }
  }

  /** Called centrally by MapManager after style.load — re-creates source/layers and restores data. */
  public restoreAfterStyleChange() {
    this.initLayers();
    if (this.geojson.features.length > 0) {
      const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(this.geojson);
      }
    }
  }

  private bindEvents() {
    this.map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      this.initLayers();
      this.addPoint([e.lngLat.lng, e.lngLat.lat]);
    });

    this.map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none' || this.points.length === 0 || this.isFinished) return;
      this.updateTempDraw([e.lngLat.lng, e.lngLat.lat]);
    });

    this.map.on('contextmenu', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      e.preventDefault();
      this.finishMeasurement();
    });

    // Double-click to finalize measurement on desktop/trackpad
    this.map.on('dblclick', (e: maplibregl.MapMouseEvent) => {
      if (this.mode === 'none') return;
      e.preventDefault();
      this.finishMeasurement();
    });

    // Double-tap on mobile touch screen to finalize measurement
    let lastTouchTime = 0;
    try {
      const canvas = this.map.getCanvas();
      canvas.addEventListener('touchend', () => {
        if (this.mode === 'none') return;
        const now = Date.now();
        if (now - lastTouchTime < 350 && this.points.length >= 2) {
          this.finishMeasurement();
        }
        lastTouchTime = now;
      }, { passive: true });
    } catch (_) {}

    // Floating Measurement Pill Action Buttons
    if (typeof document !== 'undefined') {
      document.getElementById('btn-measure-pill-undo')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.undoLastPoint();
      });
      document.getElementById('btn-measure-pill-cancel')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.cancelMeasurement();
      });
      document.getElementById('btn-measure-pill-finish')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.finishMeasurement();
      });
    }

    // Keyboard support: Escape cancels measuring, 'z'/'Z' undoes last vertex, 'Enter' finishes
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (this.mode === 'none') return;
        const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true');
        if (isInput) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancelMeasurement();
        } else if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.undoLastPoint();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.finishMeasurement();
        }
      });
    }
  }

  public showFloatingPill() {
    const pill = typeof document !== 'undefined' ? document.getElementById('measure-floating-pill') : null;
    if (pill) {
      pill.style.display = 'flex';
      this.updateFloatingPill();
    }
  }

  public hideFloatingPill() {
    const pill = typeof document !== 'undefined' ? document.getElementById('measure-floating-pill') : null;
    if (pill) {
      pill.style.display = 'none';
    }
  }

  public updateFloatingPill(hoverCoord?: [number, number]) {
    const statusText = typeof document !== 'undefined' ? document.getElementById('measure-pill-status-text') : null;
    if (!statusText) return;

    const n = this.points.length;
    if (this.mode === 'distance') {
      if (n === 0) {
        statusText.innerHTML = '📏 <strong>Mode Ukur Jarak:</strong> Klik peta untuk simpul jalur...';
      } else if (n === 1) {
        statusText.innerHTML = '📍 <strong>1 Titik:</strong> Klik titik berikutnya untuk mengukur jarak...';
      } else {
        const coords = hoverCoord ? [...this.points, hoverCoord] : this.points;
        const line = lineString(coords);
        const lengthKm = length(line, { units: 'kilometers' });
        const formatted = lengthKm >= 1 ? `${lengthKm.toFixed(2)} km` : `${(lengthKm * 1000).toFixed(0)} m`;
        statusText.innerHTML = `📏 <strong>Jarak: ${formatted} (${n} Simpul):</strong> Klik titik baru atau <strong>Selesai</strong>`;
      }
    } else if (this.mode === 'area') {
      if (n === 0) {
        statusText.innerHTML = '📐 <strong>Mode Ukur Luas:</strong> Klik peta untuk simpul batas...';
      } else if (n < 3) {
        statusText.innerHTML = `📍 <strong>${n} Simpul:</strong> Butuh minimal ${3 - n} titik lagi...`;
      } else {
        const coords = hoverCoord ? [...this.points, hoverCoord] : this.points;
        const polyCoords = [...coords, coords[0]];
        const poly = polygon([polyCoords]);
        const areaSqM = area(poly);
        let formatted = '';
        if (areaSqM >= 1000000) {
          formatted = `${(areaSqM / 1000000).toFixed(2)} km²`;
        } else if (areaSqM >= 10000) {
          formatted = `${(areaSqM / 10000).toFixed(2)} ha`;
        } else {
          formatted = `${areaSqM.toFixed(0)} m²`;
        }
        statusText.innerHTML = `📐 <strong>Luas: ${formatted} (${n} Simpul):</strong> Klik titik baru atau <strong>Selesai</strong>`;
      }
    }
  }

  public setMode(mode: MeasureMode) {
    this.mode = mode;
    this.isFinished = false;
    this.clear();
    this.initLayers();
    if (this.map && this.map.getLayer('measure-fill')) {
      this.map.setLayoutProperty('measure-fill', 'visibility', mode === 'area' ? 'visible' : 'none');
    }

    if (mode === 'none') {
      this.map.getCanvas().style.cursor = '';
      if (this.tooltip) {
        try { this.tooltip.remove(); } catch {}
        this.tooltip = null;
      }
      this.hideFloatingPill();
      if (typeof document !== 'undefined') {
        document.body.classList.remove('measure-drawing-active');
      }
    } else {
      this.map.getCanvas().style.cursor = 'crosshair';
      if (typeof document !== 'undefined') {
        document.body.classList.add('measure-drawing-active');
        const inspectorCard = document.getElementById('floating-inspector-card');
        if (inspectorCard) inspectorCard.classList.remove('active');
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('webgis:collapse-sidebar-for-drawing'));
      }
      this.showFloatingPill();
      announceToScreenReader(`Mode pengukuran ${mode === 'distance' ? 'jarak garis' : 'luas poligon'} aktif. Klik peta untuk menandai titik.`);
    }

    if (this.onModeChangeCallback) {
      this.onModeChangeCallback(mode);
    }
  }

  public getMode(): MeasureMode {
    return this.mode;
  }

  public isDrawingActive(): boolean {
    return this.mode !== 'none' && this.points.length > 0 && !this.isFinished;
  }

  private addPoint(coord: [number, number]) {
    if (this.isFinished) {
      this.clear();
      this.isFinished = false;
    }
    this.initLayers();
    this.points.push(coord);
    this.renderFeatures(this.points);
    this.updateTooltip(coord, this.points);
    this.updateFloatingPill();
  }

  private updateTempDraw(currentHover: [number, number]) {
    const tempPoints = [...this.points, currentHover];
    this.renderFeatures(tempPoints);
    this.updateTooltip(currentHover, tempPoints);
    this.updateFloatingPill(currentHover);
  }

  public finishMeasurement() {
    if (this.points.length > 0) {
      if (this.mode === 'area' && this.points.length < 3) {
        showToast('Minimal 3 titik koordinat diperlukan untuk membentuk poligon luas!', 'warning');
        return;
      }
      if (this.mode === 'distance' && this.points.length < 2) {
        showToast('Minimal 2 titik koordinat diperlukan untuk mengukur jarak!', 'warning');
        return;
      }

      this.isFinished = true;
      this.renderFeatures(this.points, true);
      const lastPoint = this.points[this.points.length - 1];
      this.updateTooltip(lastPoint, this.points);
      this.hideFloatingPill();
      if (typeof document !== 'undefined') {
        document.body.classList.remove('measure-drawing-active');
      }
      this.map.getCanvas().style.cursor = '';

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('webgis:restore-sidebar-after-drawing'));
      }

      showToast('Pengukuran selesai. Hasil ditampilkan pada bilah sisi.', 'success');
      if (this.onFinishCallback) {
        this.onFinishCallback();
      }
    }
  }

  public cancelMeasurement() {
    this.mode = 'none';
    this.isFinished = false;
    this.clear();
    this.hideFloatingPill();
    if (typeof document !== 'undefined') {
      document.body.classList.remove('measure-drawing-active');
    }
    this.map.getCanvas().style.cursor = '';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('webgis:restore-sidebar-after-drawing'));
    }
    showToast('Pengukuran dibatalkan', 'info');
    if (this.onCancelCallback) {
      this.onCancelCallback();
    }
    if (this.onModeChangeCallback) {
      this.onModeChangeCallback('none');
    }
  }

  public clear() {
    this.points = [];
    this.isFinished = false;
    this.geojson = { type: 'FeatureCollection', features: [] };
    this.initLayers();
    const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
    if (source && typeof source.setData === 'function') {
      source.setData(this.geojson);
    }
    if (this.tooltip) {
      try { this.tooltip.remove(); } catch {}
      this.tooltip = null;
    }
    this.highlightProfileCoordinate(null);
    if (this.onResultCallback) {
      this.onResultCallback({ text: '0', mode: this.mode, profile: null });
    }
    this.updateFloatingPill();
  }

  /** Remove the last placed vertex (Undo). Triggers re-render and tooltip update. */
  public undoLastPoint() {
    if (this.isFinished || this.points.length === 0) return;
    this.points.pop();
    if (this.points.length === 0) {
      this.clear();
      this.updateFloatingPill();
      showToast('Titik pengukuran dihapus', 'info');
    } else {
      this.renderFeatures(this.points);
      this.updateTooltip(this.points[this.points.length - 1], this.points);
      this.updateFloatingPill();
      showToast('Titik terakhir dihapus', 'info');
    }
  }

  public onFinish(callback: () => void) {
    this.onFinishCallback = callback;
  }

  public onCancel(callback: () => void) {
    this.onCancelCallback = callback;
  }

  public onModeChange(callback: (mode: MeasureMode) => void) {
    this.onModeChangeCallback = callback;
  }

  private renderFeatures(coords: [number, number][], _isFinal: boolean = false) {
    this.initLayers();
    const features: GeoJSON.Feature[] = [];

    // Add vertex point features
    coords.forEach((c) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: {}
      });
    });

    if (this.mode === 'distance') {
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        });
      }
    } else if (this.mode === 'area') {
      if (coords.length === 2) {
        // Show line segment while user is drawing first 2 points
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        });
      } else if (coords.length >= 3) {
        const closedCoords = [...coords, coords[0]];
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [closedCoords] },
          properties: {}
        });
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: closedCoords },
          properties: {}
        });
      }
    }

    this.geojson = { type: 'FeatureCollection', features };
    const source = this.map.getSource('measure-source') as maplibregl.GeoJSONSource;
    if (source && typeof source.setData === 'function') {
      source.setData(this.geojson);
    }
    // NOTE: Layer ordering is handled centrally by MapManager.bringCustomLayersToTop()
  }

  /** Compute 3D elevation cross-section profile along the measured line */
  public computeElevationProfile(coords: [number, number][] = this.points): ElevationProfileSummary | null {
    if (this.mode !== 'distance' || coords.length < 2) {
      return null;
    }

    try {
      const line = lineString(coords);
      const totalKm = length(line, { units: 'kilometers' });
      if (totalKm <= 0) return null;

      // Determine sampling target (between 25 and 50 points)
      const targetSamples = Math.min(50, Math.max(25, Math.round(totalKm * 20)));
      const profilePoints: ElevationProfilePoint[] = [];

      let cumulativeDist = 0;
      let prevElev: number | null = null;
      let totalGain = 0;
      let totalLoss = 0;
      let minElevation = Infinity;
      let maxElevation = -Infinity;
      let validElevationCount = 0;

      // Segments
      const segments: { start: [number, number]; end: [number, number]; lenKm: number }[] = [];
      for (let i = 0; i < coords.length - 1; i++) {
        const segLen = length(lineString([coords[i], coords[i + 1]]), { units: 'kilometers' });
        segments.push({ start: coords[i], end: coords[i + 1], lenKm: segLen });
      }

      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        if (seg.lenKm <= 0) continue;

        const segSamples = Math.max(2, Math.round((seg.lenKm / totalKm) * targetSamples));
        const isLastSeg = s === segments.length - 1;
        const count = isLastSeg ? segSamples : segSamples - 1;

        for (let j = 0; j <= count; j++) {
          const t = j / segSamples;
          const sampleLng = seg.start[0] + t * (seg.end[0] - seg.start[0]);
          const sampleLat = seg.start[1] + t * (seg.end[1] - seg.start[1]);
          const d = cumulativeDist + t * seg.lenKm;

          let elev = 0;
          let hasRealElevation = false;

          if (this.map && typeof (this.map as any).queryTerrainElevation === 'function') {
            try {
              const queried = (this.map as any).queryTerrainElevation([sampleLng, sampleLat]);
              if (typeof queried === 'number' && !isNaN(queried)) {
                elev = Math.round(queried);
                hasRealElevation = true;
              }
            } catch {
              // Ignore terrain sampling error
            }
          }

          if (hasRealElevation) {
            validElevationCount++;
            if (elev < minElevation) minElevation = elev;
            if (elev > maxElevation) maxElevation = elev;

            if (prevElev !== null) {
              const delta = elev - prevElev;
              if (delta > 0) totalGain += delta;
              else if (delta < 0) totalLoss += Math.abs(delta);
            }
            prevElev = elev;
          }

          profilePoints.push({
            distanceKm: Number(d.toFixed(3)),
            elevationM: elev,
            coord: [sampleLng, sampleLat]
          });
        }
        cumulativeDist += seg.lenKm;
      }

      if (profilePoints.length === 0 || validElevationCount === 0) {
        return null;
      }

      return {
        minElevation: minElevation === Infinity ? 0 : minElevation,
        maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
        totalGain: Math.round(totalGain),
        totalLoss: Math.round(totalLoss),
        points: profilePoints
      };
    } catch (e) {
      logger.warn('[MeasureTool] Failed to compute elevation profile:', e);
      return null;
    }
  }

  /** Highlight a specific point along the elevation chart onto the live map canvas */
  public highlightProfileCoordinate(coord: [number, number] | null) {
    if (!this.map) return;
    if (!coord) {
      if (this.hoverMarker) {
        try {
          this.hoverMarker.remove();
        } catch {}
        this.hoverMarker = null;
      }
      return;
    }

    try {
      if (!this.hoverMarker) {
        const el = document.createElement('div');
        el.className = 'measure-profile-marker';
        el.innerHTML = '<div class="measure-marker-pulse"></div><div class="measure-marker-core"></div>';
        this.hoverMarker = new maplibregl.Marker({ element: el, anchor: 'center' });
      }

      this.hoverMarker.setLngLat(coord).addTo(this.map);
    } catch {
      // Gracefully handle mock or unmounted maps
    }
  }

  private updateTooltip(position: [number, number], coords: [number, number][]) {
    let text = '';

    if (this.mode === 'distance' && coords.length >= 2) {
      const line = lineString(coords);
      const lengthKm = length(line, { units: 'kilometers' });
      text = lengthKm >= 1 ? `${lengthKm.toFixed(2)} km` : `${(lengthKm * 1000).toFixed(0)} m`;
    } else if (this.mode === 'area' && coords.length >= 3) {
      const poly = polygon([[...coords, coords[0]]]);
      const areaSqM = area(poly);
      if (areaSqM >= 1000000) {
        text = `${(areaSqM / 1000000).toFixed(2)} km²`;
      } else if (areaSqM >= 10000) {
        text = `${(areaSqM / 10000).toFixed(2)} ha`;
      } else {
        text = `${areaSqM.toFixed(0)} m²`;
      }
    } else {
      text = 'Klik peta untuk mengukur (Klik-ganda / Klik-kanan untuk selesai)';
    }

    try {
      if (!this.tooltip) {
        this.tooltip = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'measure-tooltip'
        });
      }

      this.tooltip
        .setLngLat(position)
        .setHTML(`<div style="padding: 6px 10px; font-weight: 600; font-size: 12px; color: #0f172a; background: white; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">${text}</div>`)
        .addTo(this.map);
    } catch {
      // Gracefully handle headless/mock environments where map container is unmounted
    }

    const profile = this.computeElevationProfile(coords);

    if (this.onResultCallback) {
      this.onResultCallback({ text, mode: this.mode, profile });
    }
  }

  public onResult(callback: (result: MeasureResult) => void) {
    this.onResultCallback = callback;
  }

  public getAllMapLayerIds(): string[] {
    return [
      'measure-fill',
      'measure-line-casing',
      'measure-line',
      'measure-points'
    ];
  }

  public hasActiveMeasurement(): boolean {
    return this.geojson.features.length > 0 || this.points.length > 0;
  }

  public getGeoJSON(): GeoJSON.FeatureCollection {
    return this.geojson;
  }

  public exportGeoJSON() {
    if (!this.geojson || this.geojson.features.length === 0) {
      return false;
    }

    const jsonStr = JSON.stringify(this.geojson, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurement-${this.mode || 'geodesic'}-${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  public exportKML() {
    if (!this.geojson || this.geojson.features.length === 0) {
      return false;
    }

    try {
      import('../utils/kml-exporter').then(({ geoJsonToKml, downloadKml }) => {
        const kmlString = geoJsonToKml(this.geojson, `Measurement ${this.mode || 'Geodesic'}`);
        downloadKml(kmlString, `measurement-${this.mode || 'geodesic'}-${Date.now()}.kml`);
      });
      return true;
    } catch {
      return false;
    }
  }
}


