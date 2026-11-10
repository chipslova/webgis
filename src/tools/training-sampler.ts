// Ground Truth & Training Sample Studio Engine
// Manages ML sample collection for LULC / Remote Sensing classification
import * as maplibregl from 'maplibre-gl';
import { exportRowsToExcel } from '../utils/excel-parser';
import { logger } from '../utils/logger';

export interface TrainingClass {
  id: number;
  name: string;
  color: string;
}

export interface TrainingSamplePoint {
  id: string;
  classId: number;
  className: string;
  color: string;
  coordinates: [number, number]; // [lon, lat]
  timestamp: string;
  confidence: number;
  source: 'manual' | 'file';
  notes?: string;
}

export const DEFAULT_TRAINING_CLASSES: TrainingClass[] = [
  { id: 1, name: 'Air / Badan Air', color: '#0284c7' },
  { id: 2, name: 'Hutan / Vegetasi', color: '#15803d' },
  { id: 3, name: 'Pertanian / Sawah', color: '#84cc16' },
  { id: 4, name: 'Lahan Terbangun', color: '#dc2626' },
  { id: 5, name: 'Tanah Terbuka / Tambang', color: '#d97706' }
];

export class TrainingSampler {
  private map: maplibregl.Map | null = null;
  private classes: TrainingClass[] = [...DEFAULT_TRAINING_CLASSES];
  private activeClassId: number = 1;
  private samples: TrainingSamplePoint[] = [];
  private isSamplingActive: boolean = false;
  private onChangeCallbacks: Array<() => void> = [];

  private sourceId = 'training-samples-source';
  private layerId = 'training-samples-layer';
  private labelLayerId = 'training-samples-labels';

  private mapClickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;

  constructor(map?: maplibregl.Map) {
    if (map) {
      this.attachMap(map);
    }
  }

  public attachMap(map: maplibregl.Map) {
    this.map = map;
    this.initMapLayers();
    this.setupMapClick();
  }

  public onSamplesChange(cb: () => void) {
    this.onChangeCallbacks.push(cb);
  }

  private notifyChange() {
    this.updateMapSource();
    this.onChangeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        logger.error('Error in sample callback:', err);
      }
    });
  }

  private initMapLayers() {
    if (!this.map) return;

    if (!this.map.getSource(this.sourceId)) {
      this.map.addSource(this.sourceId, {
        type: 'geojson',
        data: this.toGeoJSON()
      });
    }

    if (!this.map.getLayer(this.layerId)) {
      this.map.addLayer({
        id: this.layerId,
        type: 'circle',
        source: this.sourceId,
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95
        }
      });
    }

    if (!this.map.getLayer(this.labelLayerId)) {
      this.map.addLayer({
        id: this.labelLayerId,
        type: 'symbol',
        source: this.sourceId,
        layout: {
          'text-field': ['get', 'className'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5
        }
      });
    }
  }

  private updateMapSource() {
    if (!this.map) return;
    const source = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(this.toGeoJSON());
    }
  }

  private setupMapClick() {
    if (!this.map) return;

    this.mapClickHandler = (e: maplibregl.MapMouseEvent) => {
      if (!this.isSamplingActive) return;

      const lon = parseFloat(e.lngLat.lng.toFixed(6));
      const lat = parseFloat(e.lngLat.lat.toFixed(6));
      this.addSample([lon, lat], 'manual');
    };

    this.map.on('click', this.mapClickHandler);
  }

  public setSamplingActive(active: boolean) {
    this.isSamplingActive = active;
    if (this.map) {
      this.map.getCanvas().style.cursor = active ? 'crosshair' : '';
    }
    this.notifyChange();
  }

  public getSamplingActive(): boolean {
    return this.isSamplingActive;
  }

  public setActiveClass(classId: number) {
    this.activeClassId = classId;
    this.notifyChange();
  }

  public getActiveClassId(): number {
    return this.activeClassId;
  }

  public getClasses(): TrainingClass[] {
    return this.classes;
  }

  public addClass(name: string, color: string): TrainingClass {
    const nextId = this.classes.length > 0 ? Math.max(...this.classes.map((c) => c.id)) + 1 : 1;
    const newClass: TrainingClass = { id: nextId, name, color };
    this.classes.push(newClass);
    this.notifyChange();
    return newClass;
  }

  public addSample(
    coords: [number, number],
    source: 'manual' | 'file' = 'manual',
    customClassId?: number,
    notes?: string
  ): TrainingSamplePoint {
    const classId = customClassId ?? this.activeClassId;
    const classObj = this.classes.find((c) => c.id === classId) || this.classes[0];

    const sample: TrainingSamplePoint = {
      id: `sample_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      classId: classObj.id,
      className: classObj.name,
      color: classObj.color,
      coordinates: coords,
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      source,
      notes
    };

    this.samples.push(sample);
    this.notifyChange();
    return sample;
  }

  public removeSample(id: string) {
    this.samples = this.samples.filter((s) => s.id !== id);
    this.notifyChange();
  }

  public clearSamples(classId?: number) {
    if (typeof classId === 'number') {
      this.samples = this.samples.filter((s) => s.classId !== classId);
    } else {
      this.samples = [];
    }
    this.notifyChange();
  }

  public getSamples(): TrainingSamplePoint[] {
    return this.samples;
  }

  public getClassCounts(): Record<number, number> {
    const counts: Record<number, number> = {};
    this.classes.forEach((c) => {
      counts[c.id] = 0;
    });
    this.samples.forEach((s) => {
      counts[s.classId] = (counts[s.classId] || 0) + 1;
    });
    return counts;
  }

  public importFromFeatureCollection(
    fc: GeoJSON.FeatureCollection,
    classCol?: string
  ): number {
    let imported = 0;
    if (!fc || !fc.features) return 0;

    fc.features.forEach((feature) => {
      if (!feature.geometry) return;

      let coords: [number, number] | null = null;
      if (feature.geometry.type === 'Point') {
        coords = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
      }

      if (!coords) return;

      // Extract class name
      let label: string | null = null;
      if (classCol && feature.properties && feature.properties[classCol]) {
        label = String(feature.properties[classCol]).trim();
      } else if (feature.properties) {
        const foundKey = Object.keys(feature.properties).find((k) =>
          ['class', 'kelas', 'label', 'kategori', 'category', 'tutupan'].includes(k.toLowerCase())
        );
        if (foundKey) {
          label = String(feature.properties[foundKey]).trim();
        }
      }

      let targetClass: TrainingClass | undefined;
      if (label) {
        targetClass = this.classes.find(
          (c) => c.name.toLowerCase() === label?.toLowerCase() || String(c.id) === label
        );
        if (!targetClass) {
          // Generate nice random color for new class
          const hue = (this.classes.length * 137.508) % 360;
          targetClass = this.addClass(label, `hsl(${Math.round(hue)}, 70%, 50%)`);
        }
      } else {
        targetClass = this.classes.find((c) => c.id === this.activeClassId) || this.classes[0];
      }

      this.addSample(coords, 'file', targetClass.id);
      imported++;
    });

    return imported;
  }

  public toGeoJSON(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.samples.map((s) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: s.coordinates
        },
        properties: {
          id: s.id,
          classId: s.classId,
          className: s.className,
          color: s.color,
          timestamp: s.timestamp,
          confidence: s.confidence,
          source: s.source,
          notes: s.notes || ''
        }
      }))
    };
  }

  public toCSV(): string {
    const headers = ['id', 'class_id', 'class_name', 'latitude', 'longitude', 'timestamp', 'confidence', 'source', 'notes'];
    const rows = this.samples.map((s) => [
      `"${s.id}"`,
      s.classId,
      `"${s.className.replace(/"/g, '""')}"`,
      s.coordinates[1],
      s.coordinates[0],
      `"${s.timestamp}"`,
      s.confidence,
      `"${s.source}"`,
      `"${(s.notes || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }

  public toExcelBuffer(): Uint8Array {
    const rows = this.samples.map((s) => ({
      ID: s.id,
      Class_ID: s.classId,
      Class_Name: s.className,
      Latitude: s.coordinates[1],
      Longitude: s.coordinates[0],
      Confidence: s.confidence,
      Source: s.source,
      Timestamp: s.timestamp,
      Notes: s.notes || ''
    }));

    return exportRowsToExcel(rows, 'Training_Samples');
  }

  public downloadSamples(format: 'csv' | 'xlsx' | 'geojson') {
    if (this.samples.length === 0) {
      throw new Error('Belum ada titik sampel untuk diekspor.');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let blob: Blob;
    let fileName: string;

    if (format === 'csv') {
      const csvStr = this.toCSV();
      blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      fileName = `training_samples_${timestamp}.csv`;
    } else if (format === 'xlsx') {
      const excelBytes = this.toExcelBuffer();
      blob = new Blob([excelBytes as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      fileName = `training_samples_${timestamp}.xlsx`;
    } else {
      const geojsonStr = JSON.stringify(this.toGeoJSON(), null, 2);
      blob = new Blob([geojsonStr], { type: 'application/geo+json;charset=utf-8;' });
      fileName = `training_samples_${timestamp}.geojson`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public destroy() {
    if (this.map && this.mapClickHandler) {
      this.map.off('click', this.mapClickHandler);
    }
  }
}

