import { describe, it, expect } from 'vitest';
import { BasemapCustomizer, DEFAULT_CUSTOMIZER_STATE } from '../src/tools/basemap-customizer';
import { PermalinkManager } from '../src/tools/permalink';

describe('Basemap Customizer - Sublayer Detection & State Management', () => {
  // Mock minimal MapLibre Map instance
  const mockMap: any = {
    on: () => {},
    getStyle: () => ({ layers: [] }),
    getSource: () => null,
    addSource: () => {},
    getLayer: () => null,
    addLayer: () => {},
    setLayoutProperty: () => {},
    setPaintProperty: () => {},
    getPitch: () => 0,
    easeTo: () => {},
    setTerrain: () => {}
  };

  const customizer = new BasemapCustomizer(mockMap);

  it('should initialize with default states', () => {
    const state = customizer.getState();
    expect(state.terrain3D).toBe(false);
    expect(state.terrainExaggeration).toBe(1.5);
    expect(state.terrainHillshade).toBe(false);
    expect(state.buildings3D).toBe(true);

    expect(state.sublayers.poi).toBe(true);
    expect(state.sublayers.road_names).toBe(true);
    expect(state.sublayers.place_names).toBe(true);
    expect(state.sublayers.admin_boundaries).toBe(true);
    expect(state.sublayers.landcover).toBe(true);
    expect(state.sublayers.water).toBe(true);
    expect(state.sublayers.buildings).toBe(true);
    expect(state.sublayers.roads).toBe(true);
  });

  it('should accurately detect layer categories from MapLibre Layer specifications', () => {
    // 1. POI
    expect(customizer.detectLayerCategory({ id: 'poi-level-1', type: 'symbol' })).toBe('poi');
    expect(customizer.detectLayerCategory({ id: 'amenity_hospital', type: 'circle' })).toBe('poi');

    // 2. Road Names
    expect(customizer.detectLayerCategory({ id: 'road-label-primary', type: 'symbol' })).toBe('road_names');
    expect(customizer.detectLayerCategory({ id: 'highway-street-name', type: 'symbol' })).toBe('road_names');

    // 3. Place Names
    expect(customizer.detectLayerCategory({ id: 'place-city-major', type: 'symbol' })).toBe('place_names');
    expect(customizer.detectLayerCategory({ id: 'country-label-lg', type: 'symbol' })).toBe('place_names');

    // 4. Admin Boundaries
    expect(customizer.detectLayerCategory({ id: 'admin-boundary-province', type: 'line' })).toBe('admin_boundaries');
    expect(customizer.detectLayerCategory({ id: 'border-country-disputed', type: 'line' })).toBe('admin_boundaries');

    // 5. Land Cover
    expect(customizer.detectLayerCategory({ id: 'landcover-forest', type: 'fill' })).toBe('landcover');
    expect(customizer.detectLayerCategory({ id: 'park-national', type: 'fill' })).toBe('landcover');

    // 6. Water
    expect(customizer.detectLayerCategory({ id: 'water-ocean-polygon', type: 'fill' })).toBe('water');
    expect(customizer.detectLayerCategory({ id: 'river-waterway-line', type: 'line' })).toBe('water');

    // 7. Buildings
    expect(customizer.detectLayerCategory({ id: 'building-commercial-fill', type: 'fill' })).toBe('buildings');
    expect(customizer.detectLayerCategory({ id: 'structure-industrial', type: 'fill' })).toBe('buildings');

    // 8. Roads
    expect(customizer.detectLayerCategory({ id: 'road-primary-casing', type: 'line' })).toBe('roads');
    expect(customizer.detectLayerCategory({ id: 'transportation-motorway', type: 'line' })).toBe('roads');
  });

  it('should toggle sublayers individually and bulk update', () => {
    customizer.toggleSublayer('poi', false);
    expect(customizer.getState().sublayers.poi).toBe(false);
    expect(customizer.getState().sublayers.roads).toBe(true);

    // Mute all (Clean Map)
    customizer.setAllSublayers(false);
    Object.values(customizer.getState().sublayers).forEach((v) => {
      expect(v).toBe(false);
    });

    // Unmute all
    customizer.setAllSublayers(true);
    Object.values(customizer.getState().sublayers).forEach((v) => {
      expect(v).toBe(true);
    });
  });

  it('should generate distinct aesthetic 3D building color ramps for all 16 basemaps', () => {
    const all16Basemaps = [
      'esri-imagery', 'esri-streets', 'big-rbi', 'osm-standard',
      'esri-topographic', 'open-topo', 'esri-relief', 'esri-natgeo',
      'esri-ocean', 'esri-light-grey', 'esri-dark-grey', 'openfreemap-liberty',
      'openfreemap-positron', 'esri-clarity', 'osm-humanitarian', 'esri-colorpencil'
    ];

    expect(all16Basemaps.length).toBe(16);

    all16Basemaps.forEach((id) => {
      const expr = customizer.getBuildingColorExpression(id);
      expect(expr, `Basemap ${id} should return an interpolation expression`).toBeDefined();
      expect(expr[0]).toBe('interpolate');
      expect(expr[1]).toEqual(['linear']);
      expect(expr.length).toBeGreaterThanOrEqual(13);
    });

    // Verify key distinct color signatures
    expect(JSON.stringify(customizer.getBuildingColorExpression('esri-dark-grey'))).toContain('#00f0ff');
    expect(JSON.stringify(customizer.getBuildingColorExpression('esri-ocean'))).toContain('#14b8a6');
    expect(JSON.stringify(customizer.getBuildingColorExpression('osm-humanitarian'))).toContain('#f43f5e');
    expect(JSON.stringify(customizer.getBuildingColorExpression('big-rbi'))).toContain('#06b6d4');
    expect(JSON.stringify(customizer.getBuildingColorExpression('esri-colorpencil'))).toContain('#fb923c');
    expect(JSON.stringify(customizer.getBuildingColorExpression('open-topo'))).toContain('#10b981');
  });

  it('should parse 3D terrain and overlays in PermalinkManager URL hash', () => {
    const hash = '#map=9.00/-7.5400/110.4400/60/15&terrain=1&hillshade=1';
    const state = PermalinkManager.parseHash(hash);

    expect(state.zoom).toBe(9.0);
    expect(state.lat).toBe(-7.54);
    expect(state.lng).toBe(110.44);
    expect(state.pitch).toBe(60);
    expect(state.bearing).toBe(15);
    expect(state.terrain3D).toBe(true);
    expect(state.terrainHillshade).toBe(true);
  });
});
