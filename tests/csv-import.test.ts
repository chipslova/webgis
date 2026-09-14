// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  parseCSVRows,
  detectLatLonColumns,
  parseCSVToGeoJSON
} from '../src/utils/csv-parser';
import { GeoJsonLoader } from '../src/tools/geojson-loader';

describe('Spatial CSV / TSV Parser Utility', () => {
  describe('Delimiter Detection & Row Tokenization', () => {
    it('should accurately detect comma, semicolon, tab, and pipe delimiters', () => {
      expect(detectDelimiter('id,name,lat,lon\n1,A,-6.2,106.8')).toBe(',');
      expect(detectDelimiter('id;name;lat;lon\n1;A;-6.2;106.8')).toBe(';');
      expect(detectDelimiter('id\tname\tlat\tlon\n1\tA\t-6.2\t106.8')).toBe('\t');
      expect(detectDelimiter('id|name|lat|lon\n1|A|-6.2|106.8')).toBe('|');
    });

    it('should parse quoted cells containing commas and escaped quotes correctly', () => {
      const csv = `id,name,category,lat,lon
1,"Hotel Indonesia, Bundaran HI",Landmark,-6.195,106.823
2,"Pusat ""Oleh-Oleh"" Wisata",Culinary,-6.200,106.830`;

      const rows = parseCSVRows(csv, ',');
      expect(rows.length).toBe(3);
      expect(rows[1][1]).toBe('Hotel Indonesia, Bundaran HI');
      expect(rows[2][1]).toBe('Pusat "Oleh-Oleh" Wisata');
    });
  });

  describe('Coordinate Column Auto-Detection', () => {
    it('should detect standard English latitude/longitude headers', () => {
      const res = detectLatLonColumns(['id', 'station_name', 'latitude', 'longitude', 'elevation']);
      expect(res.latCol).toBe('latitude');
      expect(res.lonCol).toBe('longitude');
      expect(res.latIndex).toBe(2);
      expect(res.lonIndex).toBe(3);
    });

    it('should detect Indonesian lintang/bujur headers', () => {
      const res = detectLatLonColumns(['no', 'nama_lokasi', 'lintang', 'bujur', 'kategori']);
      expect(res.latCol).toBe('lintang');
      expect(res.lonCol).toBe('bujur');
    });

    it('should detect short y/x and coord_y/coord_x headers', () => {
      const res1 = detectLatLonColumns(['id', 'y', 'x', 'val']);
      expect(res1.latCol).toBe('y');
      expect(res1.lonCol).toBe('x');

      const res2 = detectLatLonColumns(['id', 'coord_y', 'coord_x']);
      expect(res2.latCol).toBe('coord_y');
      expect(res2.lonCol).toBe('coord_x');
    });
  });

  describe('CSV to GeoJSON Conversion', () => {
    it('should convert standard CSV data to GeoJSON Point FeatureCollection', () => {
      const csv = `id,city,lat,lon,population
1,Jakarta,-6.2088,106.8456,10500000
2,Surabaya,-7.2575,112.7521,2900000
3,Bandung,-6.9175,107.6191,2500000`;

      const res = parseCSVToGeoJSON(csv);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.features.length).toBe(3);
      expect(res.importedCount).toBe(3);
      expect(res.skippedCount).toBe(0);

      const jkt = res.data!.features[0];
      expect(jkt.geometry.type).toBe('Point');
      expect((jkt.geometry as GeoJSON.Point).coordinates).toEqual([106.8456, -6.2088]);
      expect(jkt.properties?.city).toBe('Jakarta');
      expect(jkt.properties?.population).toBe(10500000); // numeric casting
    });

    it('should parse semicolon-delimited CSV with European comma decimals', () => {
      const csv = `id;lokasi;lat;lng;kapasitas
1;Pos Pantau Merapi;-7,5400;110,4460;50
2;Pos Pantau Kaliurang;-7,5950;110,4280;100`;

      const res = parseCSVToGeoJSON(csv);
      expect(res.success).toBe(true);
      expect(res.data?.features.length).toBe(2);

      const pos1 = res.data!.features[0];
      expect((pos1.geometry as GeoJSON.Point).coordinates[0]).toBeCloseTo(110.446);
      expect((pos1.geometry as GeoJSON.Point).coordinates[1]).toBeCloseTo(-7.54);
    });

    it('should skip rows with invalid coordinates and report skippedCount', () => {
      const csv = `id,name,lat,lon
1,Valid Point,-6.2,106.8
2,Corrupted Point,N/A,106.8
3,Out of bounds lat,999.0,106.8
4,Another Valid,-7.0,110.0`;

      const res = parseCSVToGeoJSON(csv);
      expect(res.success).toBe(true);
      expect(res.importedCount).toBe(2);
      expect(res.skippedCount).toBe(2);
      expect(res.data?.features.length).toBe(2);
    });

    it('should return failure if no coordinate columns can be detected', () => {
      const csv = `id,name,address,phone
1,Kantor A,Jl Sudirman,08123
2,Kantor B,Jl Thamrin,08124`;

      const res = parseCSVToGeoJSON(csv);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Kolom koordinat tidak ditemukan');
    });

    it('should return failure for empty text', () => {
      const res = parseCSVToGeoJSON('');
      expect(res.success).toBe(false);
      expect(res.error).toContain('kosong');
    });
  });
});

describe('GeoJsonLoader CSV Integration', () => {
  const createMockMap = () =>
    ({
      getSource: () => null,
      addSource: () => {},
      getLayer: () => null,
      addLayer: () => {},
      removeLayer: () => {},
      removeSource: () => {},
      setPaintProperty: () => {},
      setLayoutProperty: () => {},
      on: () => {},
      off: () => {},
      setFilter: () => {},
      flyTo: () => {},
      fitBounds: () => {},
      loaded: () => true,
      isMoving: () => false,
      getStyle: () => ({ layers: [] }),
      getCanvasContainer: () => document.createElement('div')
    } as any);

  it('should load CSV string correctly and register layer with point geometry', () => {
    const mockMap = createMockMap();
    const loader = new GeoJsonLoader(mockMap);

    const csvContent = `facility,lat,lon,status
Puskesmas Gambir,-6.175,106.828,Aktif
Puskesmas Menteng,-6.195,106.835,Aktif
Puskesmas Senen,-6.185,106.845,Aktif`;

    const res = loader.loadFromFileText('puskesmas_jakarta.csv', csvContent, '#10b981');
    expect(res.success).toBe(true);
    expect(res.layerId).toBeDefined();
    expect(res.featureCount).toBe(3);
    expect(res.detectedColumns).toBeDefined();

    const layer = loader.getLayer(res.layerId!);
    expect(layer).toBeDefined();
    expect(layer?.name).toBe('puskesmas_jakarta');
    expect(layer?.type).toBe('point');
    expect(layer?.featureCount).toBe(3);
  });
});
