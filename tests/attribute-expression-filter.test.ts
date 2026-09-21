/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseExpressionQuery,
  evaluateFeatureWithFilter,
  AttributeTableUI,
  type AttributeFilter
} from '../src/ui/attribute-table-panel';

describe('Attribute Expression Query & Filter Builder (Priority 3)', () => {
  const sampleFields = ['nama', 'populasi', 'provinsi', 'luas_ha', 'keterangan'];

  describe('parseExpressionQuery', () => {
    it('should parse numeric comparison expressions correctly', () => {
      const q1 = parseExpressionQuery('populasi > 500000', sampleFields);
      expect(q1).toEqual({
        field: 'populasi',
        operator: 'gt',
        value: '500000'
      });

      const q2 = parseExpressionQuery('luas_ha >= 120.5', sampleFields);
      expect(q2).toEqual({
        field: 'luas_ha',
        operator: 'gte',
        value: '120.5'
      });

      const q3 = parseExpressionQuery('populasi < 100000', sampleFields);
      expect(q3).toEqual({
        field: 'populasi',
        operator: 'lt',
        value: '100000'
      });

      const q4 = parseExpressionQuery('luas_ha <= 50', sampleFields);
      expect(q4).toEqual({
        field: 'luas_ha',
        operator: 'lte',
        value: '50'
      });
    });

    it('should parse equality and string expressions with or without quotes', () => {
      const q1 = parseExpressionQuery("provinsi = 'Jawa Barat'", sampleFields);
      expect(q1).toEqual({
        field: 'provinsi',
        operator: 'equals',
        value: 'Jawa Barat'
      });

      const q2 = parseExpressionQuery('provinsi != "Bali"', sampleFields);
      expect(q2).toEqual({
        field: 'provinsi',
        operator: 'not_equals',
        value: 'Bali'
      });

      const q3 = parseExpressionQuery('nama contains "Kota"', sampleFields);
      expect(q3).toEqual({
        field: 'nama',
        operator: 'contains',
        value: 'Kota'
      });
    });

    it('should return null for non-expression free text searches', () => {
      expect(parseExpressionQuery('Bandung', sampleFields)).toBeNull();
      expect(parseExpressionQuery('Jawa Tengah', sampleFields)).toBeNull();
      expect(parseExpressionQuery('', sampleFields)).toBeNull();
      expect(parseExpressionQuery('unknown_field > 100', sampleFields)).toBeNull();
    });
  });

  describe('evaluateFeatureWithFilter', () => {
    const featCity: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [107.6, -6.9] },
      properties: {
        nama: 'Kota Bandung',
        populasi: 2500000,
        provinsi: 'Jawa Barat',
        luas_ha: 167.3,
        keterangan: null
      }
    };

    it('should filter by numeric comparisons correctly', () => {
      const filterGt: AttributeFilter = { field: 'populasi', operator: 'gt', value: '1000000' };
      expect(evaluateFeatureWithFilter(featCity, filterGt, '')).toBe(true);

      const filterGtFail: AttributeFilter = { field: 'populasi', operator: 'gt', value: '3000000' };
      expect(evaluateFeatureWithFilter(featCity, filterGtFail, '')).toBe(false);

      const filterLt: AttributeFilter = { field: 'luas_ha', operator: 'lt', value: '200' };
      expect(evaluateFeatureWithFilter(featCity, filterLt, '')).toBe(true);

      const filterLtFail: AttributeFilter = { field: 'luas_ha', operator: 'lt', value: '100' };
      expect(evaluateFeatureWithFilter(featCity, filterLtFail, '')).toBe(false);
    });

    it('should filter by string equality, inequality, and contains', () => {
      const filterEq: AttributeFilter = { field: 'provinsi', operator: 'equals', value: 'jawa barat' };
      expect(evaluateFeatureWithFilter(featCity, filterEq, '')).toBe(true);

      const filterNotEq: AttributeFilter = { field: 'provinsi', operator: 'not_equals', value: 'Bali' };
      expect(evaluateFeatureWithFilter(featCity, filterNotEq, '')).toBe(true);

      const filterContains: AttributeFilter = { field: 'nama', operator: 'contains', value: 'Bandung' };
      expect(evaluateFeatureWithFilter(featCity, filterContains, '')).toBe(true);
    });

    it('should handle is_empty and not_empty checks', () => {
      const filterEmpty: AttributeFilter = { field: 'keterangan', operator: 'is_empty', value: '' };
      expect(evaluateFeatureWithFilter(featCity, filterEmpty, '')).toBe(true);

      const filterNotEmpty: AttributeFilter = { field: 'nama', operator: 'not_empty', value: '' };
      expect(evaluateFeatureWithFilter(featCity, filterNotEmpty, '')).toBe(true);
    });

    it('should fallback to global text search if no explicit filter is given', () => {
      expect(evaluateFeatureWithFilter(featCity, null, 'Bandung')).toBe(true);
      expect(evaluateFeatureWithFilter(featCity, null, 'Surabaya')).toBe(false);
    });
  });

  describe('AttributeTableUI Integration', () => {
    let mockMap: any;
    let mockLoader: any;
    let ui: AttributeTableUI;

    beforeEach(() => {
      mockMap = {
        flyTo: () => {},
        fitBounds: () => {},
        getCanvas: () => ({ style: {}, addEventListener: () => {} }),
        getCanvasContainer: () => document.createElement('div')
      };

      mockLoader = {
        getLayers: () => [
          {
            id: 'layer-sample-1',
            name: 'Sample Layer',
            featureCount: 2,
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [106.8, -6.2] },
                  properties: { nama: 'Jakarta', populasi: 10000000 }
                },
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [112.7, -7.2] },
                  properties: { nama: 'Surabaya', populasi: 3000000 }
                }
              ]
            }
          }
        ],
        onLayersChange: () => {}
      };

      ui = new AttributeTableUI(mockMap, mockLoader);
    });

    it('should open and render table and filter builder controls', () => {
      ui.open('layer-sample-1');
      expect(ui.isVisible()).toBe(true);

      const searchInput = document.getElementById('attr-table-search');
      expect(searchInput).not.toBeNull();

      const toggleFilterBtn = document.getElementById('btn-toggle-filter-builder');
      expect(toggleFilterBtn).not.toBeNull();

      const zoomAllBtn = document.getElementById('btn-zoom-all-filtered');
      expect(zoomAllBtn).not.toBeNull();
    });

    it('should allow setting programmatically and filtering features', () => {
      ui.open('layer-sample-1');
      ui.setFilter({ field: 'populasi', operator: 'gt', value: '5000000' });
      expect(ui.getFilter()?.field).toBe('populasi');

      // Table should now display 1 matching feature (Jakarta)
      const rows = document.querySelectorAll('.attr-table tbody tr');
      expect(rows.length).toBe(1);
    });

    it('should zoom to all filtered features without throwing', () => {
      ui.open('layer-sample-1');
      const features = mockLoader.getLayers()[0].data.features;
      expect(() => ui.zoomToAllFeatures(features)).not.toThrow();
    });
  });
});
