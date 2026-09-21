/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MapExporter, type MapExportOptions } from '../src/tools/map-exporter';
import { BufferAnalysisUI } from '../src/ui/buffer-analysis-ui';
import { GeoJsonLoader } from '../src/tools/geojson-loader';
import * as fs from 'fs';
import * as path from 'path';

describe('Priority 4 & 5: Cartographic Export Modal & Buffer Customization', () => {
  describe('MapExporter with Flexible Layout & Options', () => {
    let mockMap: any;
    let exporter: MapExporter;

    beforeEach(() => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 1920;
      mockCanvas.height = 1080;

      mockMap = {
        getCanvas: () => mockCanvas,
        getBearing: () => 15,
        getCenter: () => ({ lat: -6.2, lng: 106.8 }),
        getZoom: () => 11.5,
        once: vi.fn((event: string, cb: () => void) => cb()),
        triggerRepaint: vi.fn()
      };

      exporter = new MapExporter(mockMap);
    });

    it('should export with 16:9 aspect ratio and ultra HD resolution scale without crashing', () => {
      const options: MapExportOptions = {
        title: 'Peta Analisis IKN 2025',
        subtitle: 'Kawasan Inti Pusat Pemerintahan',
        aspectRatio: '16:9',
        resolutionScale: 2,
        includeNorthArrow: true,
        includeScaleBar: true,
        includeLegend: true,
        includeMetadata: true,
        format: 'image/png',
        legendItems: [
          { label: 'Zona Penyangga 5 km', color: '#ef4444' },
          { label: 'Titik Penting', color: '#38bdf8' }
        ]
      };

      expect(() => exporter.exportWithOptions(options)).not.toThrow();
    });

    it('should export with A4 landscape and JPEG format without crashing', () => {
      const options: MapExportOptions = {
        title: 'Peta Topografi Bromo',
        aspectRatio: 'a4-landscape',
        format: 'image/jpeg',
        includeLegend: false
      };

      expect(() => exporter.exportWithOptions(options)).not.toThrow();
    });
  });

  describe('Buffer Customization (Color & Opacity)', () => {
    let mockLoader: any;
    let bufferUI: BufferAnalysisUI;

    beforeEach(() => {
      mockLoader = {
        getLayers: () => [
          {
            id: 'layer-cities',
            name: 'Kota Jawa',
            featureCount: 3,
            data: {
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [106.8, -6.2] }, properties: {} }
              ]
            }
          }
        ],
        createBufferForLayer: vi.fn().mockResolvedValue({
          success: true,
          bufferLayerId: 'buffer-123',
          areaKm2: 78.5
        }),
        removeBufferLayers: vi.fn().mockReturnValue(1)
      };

      bufferUI = new BufferAnalysisUI(mockLoader);
    });

    it('should support getting and setting custom buffer color and opacity', () => {
      expect(bufferUI.getColor()).toBe('#8b5cf6');
      expect(bufferUI.getOpacity()).toBe(0.45);

      bufferUI.setColor('#ef4444');
      bufferUI.setOpacity(0.8);

      expect(bufferUI.getColor()).toBe('#ef4444');
      expect(bufferUI.getOpacity()).toBe(0.8);
    });

    it('should pass customColor and customOpacity to createBufferForLayer in GeoJsonLoader', async () => {
      const loader = new GeoJsonLoader({
        getSource: () => null,
        getLayer: () => null,
        addSource: () => {},
        addLayer: () => {},
        setLayoutProperty: () => {},
        setPaintProperty: () => {}
      } as any);

      // Add a dummy custom layer
      (loader as any).customLayers.set('layer-test', {
        id: 'layer-test',
        name: 'Test Points',
        featureCount: 1,
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [110.0, -7.0] }, properties: {} }
          ]
        }
      });

      const spyAdd = vi.spyOn(loader, 'addGeoJSONLayer').mockReturnValue(true);
      const spyOpacity = vi.spyOn(loader, 'setLayerOpacity').mockImplementation(() => {});

      const res = await loader.createBufferForLayer('layer-test', 5, 'kilometers', undefined, '#10b981', 0.65);

      expect(res.success).toBe(true);
      expect(spyAdd).toHaveBeenCalledWith(
        expect.stringContaining('buffer-'),
        expect.stringContaining('Buffer (5 kilometers)'),
        expect.anything(),
        '#10b981'
      );
      expect(spyOpacity).toHaveBeenCalledWith(expect.stringContaining('buffer-'), 0.65);
    });
  });

  describe('HTML DOM Elements for Export Modal and Buffer Swatches', () => {
    it('should contain all required Map Export modal and buffer styling controls in index.html', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');

      // Export modal elements
      expect(html).toContain('id="modal-map-export"');
      expect(html).toContain('id="export-input-title"');
      expect(html).toContain('id="export-select-ratio"');
      expect(html).toContain('id="export-select-resolution"');
      expect(html).toContain('id="export-select-format"');
      expect(html).toContain('id="export-chk-north"');
      expect(html).toContain('id="export-chk-scale"');
      expect(html).toContain('id="export-chk-legend"');
      expect(html).toContain('id="btn-confirm-export-modal"');

      // Buffer styling elements
      expect(html).toContain('class="buffer-color-swatches"');
      expect(html).toContain('id="buffer-color-custom"');
      expect(html).toContain('id="buffer-opacity-slider"');
      expect(html).toContain('id="buffer-opacity-val"');
    });
  });
});
