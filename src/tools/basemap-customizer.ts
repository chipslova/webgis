import * as maplibregl from 'maplibre-gl';

export type VectorSublayerKey =
  | 'poi'
  | 'road_names'
  | 'place_names'
  | 'admin_boundaries'
  | 'landcover'
  | 'water'
  | 'buildings'
  | 'roads';

export interface BasemapCustomizerState {
  // Global Overlays
  terrainHillshade: boolean;

  // 3D Terrain & Extrusions
  terrain3D: boolean;
  terrainExaggeration: number;
  buildings3D: boolean;

  // Vector Sublayers Visibility
  sublayers: Record<VectorSublayerKey, boolean>;
}

export const DEFAULT_CUSTOMIZER_STATE: BasemapCustomizerState = {
  terrainHillshade: false,
  terrain3D: false,
  terrainExaggeration: 1.5,
  buildings3D: true,
  sublayers: {
    poi: true,
    road_names: true,
    place_names: true,
    admin_boundaries: true,
    landcover: true,
    water: true,
    buildings: true,
    roads: true
  }
};

export class BasemapCustomizer {
  private map: maplibregl.Map;
  private currentBasemapId: string = 'google-hybrid';
  private state: BasemapCustomizerState = { ...DEFAULT_CUSTOMIZER_STATE, sublayers: { ...DEFAULT_CUSTOMIZER_STATE.sublayers } };
  private onChangeCallbacks: Array<(state: BasemapCustomizerState) => void> = [];

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.initListeners();
  }

  private initListeners() {
    this.map.on('style.load', () => {
      this.reapplyAll();
    });
  }

  public setBasemapId(basemapId: string) {
    this.currentBasemapId = basemapId;
    this.apply3DBuildings();
  }

  public onChange(callback: (state: BasemapCustomizerState) => void) {
    this.onChangeCallbacks.push(callback);
  }

  private notify() {
    this.onChangeCallbacks.forEach(cb => {
      try {
        cb(this.getState());
      } catch (e) {
        console.warn('[BasemapCustomizer] Error in change callback:', e);
      }
    });
  }

  public getState(): BasemapCustomizerState {
    return {
      ...this.state,
      sublayers: { ...this.state.sublayers }
    };
  }

  /**
   * Re-apply all sublayer visibilities, global overlays, and 3D terrain
   */
  public reapplyAll() {
    if (!this.map || !this.map.getStyle()) return;

    // 1. Setup Terrarium DEM Source
    this.ensureDemSource();

    // 2. Re-apply 3D Terrain
    this.apply3DTerrain();

    // 3. Re-apply Global Overlays (Hillshade)
    this.applyHillshadeOverlay();

    // 4. Re-apply 3D Buildings & Vector Sublayers
    this.apply3DBuildings();
    this.applyVectorSublayers();
  }

  /**
   * Generates a height-interpolated color ramp matching the aesthetic palette of each of the 16 basemaps
   */
  public getBuildingColorExpression(basemapId: string = this.currentBasemapId): any {
    let colors: [string, string, string, string, string];

    switch (basemapId) {
      // 1. Google Satellite
      case 'google-satellite':
        colors = ['#0f172a', '#1e293b', '#334155', '#38bdf8', '#7dd3fc'];
        break;

      // 2. Google Hybrid
      case 'google-hybrid':
        colors = ['#064e3b', '#0f766e', '#14b8a6', '#2dd4bf', '#a7f3d0'];
        break;

      // 3. Google Streets (Navigation)
      case 'google-streets':
        colors = ['#f0f9ff', '#bae6fd', '#38bdf8', '#0284c7', '#0369a1'];
        break;

      // 4. Esri World Imagery
      case 'esri-imagery':
        colors = ['#111827', '#1f2937', '#374151', '#60a5fa', '#93c5fd'];
        break;

      // 5. Esri World Topographic
      case 'esri-topographic':
        colors = ['#f7fee7', '#d9f99d', '#84cc16', '#65a30d', '#3f6212'];
        break;

      // 6. Esri World Streets
      case 'esri-streets':
        colors = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e40af'];
        break;

      // 7. Esri National Geographic
      case 'esri-natgeo':
        colors = ['#fefce8', '#fef08a', '#eab308', '#84cc16', '#4d7c0f'];
        break;

      // 8. Esri Light Gray Canvas
      case 'esri-light-grey':
        colors = ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'];
        break;

      // 9. Esri Dark Gray Canvas
      case 'esri-dark-grey':
        colors = ['#020617', '#0f172a', '#1e293b', '#00f0ff', '#38bdf8'];
        break;

      // 10. Esri Ocean Basemap
      case 'esri-ocean':
        colors = ['#042f2e', '#115e59', '#14b8a6', '#2dd4bf', '#99f6e4'];
        break;

      // 11. Esri World Shaded Relief
      case 'esri-relief':
        colors = ['#fafaf9', '#e7e5e4', '#a8a29e', '#78716c', '#44403c'];
        break;

      // 12. Esri Colored Pencil
      case 'esri-colorpencil':
        colors = ['#fffbeb', '#fef3c7', '#fde68a', '#f59e0b', '#d97706'];
        break;

      // 13. Rupabumi Indonesia (BIG)
      case 'big-rbi':
        colors = ['#ecfeff', '#cffafe', '#67e8f9', '#06b6d4', '#0e7490'];
        break;

      // 14. OpenStreetMap Standard
      case 'osm-standard':
        colors = ['#f8fafc', '#e2e8f0', '#fbbf24', '#f59e0b', '#b45309'];
        break;

      // 15. OpenStreetMap Humanitarian
      case 'osm-humanitarian':
        colors = ['#fff1f2', '#fecdd3', '#fda4af', '#f43f5e', '#be123c'];
        break;

      // 16. OpenTopoMap
      case 'open-topo':
        colors = ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'];
        break;

      default:
        colors = ['#1e293b', '#334155', '#0284c7', '#00f0ff', '#38bdf8'];
        break;
    }

    return [
      'interpolate',
      ['linear'],
      ['coalesce', ['to-number', ['get', 'render_height']], ['to-number', ['get', 'height']], ['*', ['to-number', ['coalesce', ['get', 'building:levels'], ['get', 'levels'], 2]], 3.5], 15],
      0, colors[0],
      25, colors[1],
      60, colors[2],
      120, colors[3],
      250, colors[4]
    ];
  }

  /**
   * Add AWS Terrarium Raster-DEM source if missing
   */
  private ensureDemSource() {
    if (!this.map || !this.map.getStyle()) return;

    try {
      if (!this.map.getSource('terrarium-dem-source')) {
        this.map.addSource('terrarium-dem-source', {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15,
          attribution: '© Mapzen / AWS Open Data Elevation'
        });
      }
    } catch (e) {
      console.warn('[BasemapCustomizer] Notice adding DEM source:', e);
    }
  }

  // --- 1. 3D TERRAIN CONTROLS ---

  public toggle3DTerrain(enabled?: boolean) {
    this.state.terrain3D = enabled !== undefined ? enabled : !this.state.terrain3D;
    this.apply3DTerrain();
    this.apply3DBuildings();

    if (this.state.terrain3D) {
      // Smoothly tilt camera into dramatic 3D perspective
      const currentPitch = this.map.getPitch();
      if (currentPitch < 40) {
        this.map.easeTo({
          pitch: 60,
          duration: 1200
        });
      }
    } else {
      // Revert pitch back to top-down 2D
      const currentPitch = this.map.getPitch();
      if (currentPitch > 10) {
        this.map.easeTo({
          pitch: 0,
          duration: 800
        });
      }
    }

    this.notify();
  }

  public setTerrainExaggeration(factor: number) {
    this.state.terrainExaggeration = Math.max(0.1, Math.min(3.0, factor));
    if (this.state.terrain3D) {
      this.apply3DTerrain();
    }
    this.notify();
  }

  private apply3DTerrain() {
    if (!this.map || !this.map.getStyle()) return;
    this.ensureDemSource();

    try {
      if (this.state.terrain3D) {
        this.map.setTerrain({
          source: 'terrarium-dem-source',
          exaggeration: this.state.terrainExaggeration
        });
      } else {
        this.map.setTerrain(null as any);
      }
    } catch (e) {
      console.warn('[BasemapCustomizer] Error applying 3D terrain:', e);
    }
  }

  // --- 2. GLOBAL OVERLAYS (HILLSHADE) ---

  public toggleTerrainHillshade(enabled?: boolean) {
    this.state.terrainHillshade = enabled !== undefined ? enabled : !this.state.terrainHillshade;
    this.applyHillshadeOverlay();
    this.notify();
  }

  private applyHillshadeOverlay() {
    if (!this.map || !this.map.getStyle()) return;
    this.ensureDemSource();

    const layerId = 'overlay-terrain-hillshade';
    try {
      if (this.state.terrainHillshade) {
        if (!this.map.getLayer(layerId)) {
          // Insert above lowest background/raster layers
          this.map.addLayer({
            id: layerId,
            type: 'hillshade',
            source: 'terrarium-dem-source',
            paint: {
              'hillshade-shadow-color': '#090d16',
              'hillshade-highlight-color': '#ffffff',
              'hillshade-accent-color': '#00f0ff',
              'hillshade-illumination-direction': 315,
              'hillshade-illumination-anchor': 'viewport',
              'hillshade-exaggeration': 0.65
            }
          });
        } else {
          this.map.setLayoutProperty(layerId, 'visibility', 'visible');
        }
      } else if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    } catch (e) {
      console.warn('[BasemapCustomizer] Error applying hillshade overlay:', e);
    }
  }

  // --- 3. 3D EXTRUDED BUILDINGS ---

  public toggle3DBuildings(enabled?: boolean) {
    this.state.buildings3D = enabled !== undefined ? enabled : !this.state.buildings3D;
    this.apply3DBuildings();
    this.notify();
  }

  /**
   * Resolves the best vector building source for the active basemap.
   * If the basemap style already contains building polygons, it uses its native source.
   * Otherwise, it loads planet vector tiles from OpenFreeMap.
   */
  private ensureBuildingVectorSource(): { source: string; sourceLayer?: string } | null {
    if (!this.map || !this.map.getStyle()) return null;

    const style = this.map.getStyle();
    if (!style || !style.layers) return null;

    // 1. Check if the active basemap style already provides a vector building layer
    for (const layer of style.layers) {
      const lId = layer.id.toLowerCase();
      const sLayer = (layer as any)['source-layer']?.toLowerCase() || '';
      if (
        (lId.includes('building') || sLayer.includes('building') || sLayer.includes('structure')) &&
        layer.type === 'fill' &&
        layer.source &&
        layer.id !== '3d-extruded-buildings-layer'
      ) {
        return {
          source: layer.source,
          sourceLayer: (layer as any)['source-layer'] || undefined
        };
      }
    }

    // 2. Fallback: Dynamically provide global OpenFreeMap 3D Vector Building tiles
    const globalSourceId = 'global-3d-buildings-source';
    try {
      if (!this.map.getSource(globalSourceId)) {
        this.map.addSource(globalSourceId, {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet'
        });
      }
      return {
        source: globalSourceId,
        sourceLayer: 'building'
      };
    } catch (e) {
      console.warn('[BasemapCustomizer] Notice adding global 3D buildings source:', e);
      return null;
    }
  }

  private apply3DBuildings() {
    if (!this.map || !this.map.getStyle()) return;

    const custom3DLayerId = '3d-extruded-buildings-layer';
    const isBuildingSublayerOn = this.state.sublayers.buildings !== false;
    const shouldExtrude = isBuildingSublayerOn && (this.state.terrain3D || this.state.buildings3D);
    const colorExpr = this.getBuildingColorExpression(this.currentBasemapId);

    try {
      if (shouldExtrude) {
        const buildingSrc = this.ensureBuildingVectorSource();

        if (buildingSrc) {
          if (!this.map.getLayer(custom3DLayerId)) {
            const layerDef: any = {
              id: custom3DLayerId,
              type: 'fill-extrusion',
              source: buildingSrc.source,
              minzoom: 13,
              paint: {
                'fill-extrusion-color': colorExpr,
                'fill-extrusion-height': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13, 0,
                  14.5, ['coalesce', ['to-number', ['get', 'render_height']], ['to-number', ['get', 'height']], ['*', ['to-number', ['coalesce', ['get', 'building:levels'], ['get', 'levels'], 2]], 3.5], 12]
                ],
                'fill-extrusion-base': [
                  'coalesce',
                  ['to-number', ['get', 'render_min_height']],
                  ['to-number', ['get', 'min_height']],
                  0
                ],
                'fill-extrusion-opacity': 0.88
              }
            };
            if (buildingSrc.sourceLayer) {
              layerDef['source-layer'] = buildingSrc.sourceLayer;
            }
            this.map.addLayer(layerDef);
          } else {
            this.map.setLayoutProperty(custom3DLayerId, 'visibility', 'visible');
            this.map.setPaintProperty(custom3DLayerId, 'fill-extrusion-color', colorExpr);
          }
        }
      } else if (this.map.getLayer(custom3DLayerId)) {
        this.map.setLayoutProperty(custom3DLayerId, 'visibility', 'none');
      }
    } catch (e) {
      console.warn('[BasemapCustomizer] Notice configuring 3D buildings:', e);
    }
  }

  // --- 4. VECTOR SUBLAYERS VISIBILITY ---

  public toggleSublayer(key: VectorSublayerKey, visible?: boolean) {
    this.state.sublayers[key] = visible !== undefined ? visible : !this.state.sublayers[key];
    if (key === 'buildings') {
      this.apply3DBuildings();
    }
    this.applyVectorSublayers();
    this.notify();
  }

  public setAllSublayers(visible: boolean) {
    Object.keys(this.state.sublayers).forEach(k => {
      this.state.sublayers[k as VectorSublayerKey] = visible;
    });
    this.apply3DBuildings();
    this.applyVectorSublayers();
    this.notify();
  }

  private applyVectorSublayers() {
    if (!this.map || !this.map.getStyle()) return;

    const style = this.map.getStyle();
    if (!style || !style.layers) return;

    for (const layer of style.layers) {
      // Don't modify system custom layers (measure, piksel, GEE, overlays)
      if (
        layer.id.startsWith('measure-') ||
        layer.id.startsWith('piksel-') ||
        layer.id.startsWith('gee-') ||
        layer.id.startsWith('geojson-') ||
        layer.id.startsWith('overlay-') ||
        layer.id === '3d-extruded-buildings-layer'
      ) {
        continue;
      }

      const category = this.detectLayerCategory(layer);
      if (category) {
        const isVisible = this.state.sublayers[category];
        try {
          this.map.setLayoutProperty(layer.id, 'visibility', isVisible ? 'visible' : 'none');
        } catch (_) {}
      }
    }
  }

  /**
   * Deterministically detect vector sublayer category from MapLibre Layer specification
   */
  public detectLayerCategory(layer: any): VectorSublayerKey | null {
    const lId = (layer.id || '').toLowerCase();
    const sLayer = (layer['source-layer'] || '').toLowerCase();
    const lType = layer.type || '';

    // 1. POI & Amenities
    if (
      lId.includes('poi') ||
      sLayer.includes('poi') ||
      lId.includes('amenity') ||
      sLayer.includes('amenity') ||
      lId.includes('shop') ||
      lId.includes('attraction') ||
      lId.includes('restaurant') ||
      lId.includes('hotel')
    ) {
      return 'poi';
    }

    // 2. Road Names & Street Labels (Symbol type)
    if (
      lType === 'symbol' &&
      (lId.includes('road') ||
        lId.includes('street') ||
        lId.includes('highway') ||
        lId.includes('transportation-name') ||
        sLayer.includes('transportation_name') ||
        sLayer.includes('road_label'))
    ) {
      return 'road_names';
    }

    // 3. Place & City Names (Symbol type)
    if (
      lType === 'symbol' &&
      (lId.includes('place') ||
        sLayer.includes('place') ||
        lId.includes('settlement') ||
        lId.includes('city-label') ||
        lId.includes('town-label') ||
        lId.includes('country-label') ||
        lId.includes('state-label'))
    ) {
      return 'place_names';
    }

    // 4. Admin Boundaries (Line type)
    if (
      lType === 'line' &&
      (lId.includes('admin') ||
        sLayer.includes('admin') ||
        lId.includes('boundary') ||
        sLayer.includes('boundary') ||
        lId.includes('border') ||
        lId.includes('batas'))
    ) {
      return 'admin_boundaries';
    }

    // 5. Land Cover & Vegetation (Fill type)
    if (
      (lType === 'fill' || lType === 'background') &&
      (lId.includes('landcover') ||
        sLayer.includes('landcover') ||
        lId.includes('landuse') ||
        sLayer.includes('landuse') ||
        lId.includes('park') ||
        lId.includes('forest') ||
        lId.includes('grass') ||
        lId.includes('wood'))
    ) {
      return 'landcover';
    }

    // 6. Water Bodies (Fill/Line type)
    if (
      lId.includes('water') ||
      sLayer.includes('water') ||
      lId.includes('ocean') ||
      lId.includes('river') ||
      lId.includes('lake') ||
      lId.includes('laut') ||
      lId.includes('sungai')
    ) {
      return 'water';
    }

    // 7. Buildings (Fill / Fill-extrusion)
    if (
      lId.includes('building') ||
      sLayer.includes('building') ||
      lId.includes('structure') ||
      lId.includes('bangunan')
    ) {
      return 'buildings';
    }

    // 8. Roads & Transport (Line type)
    if (
      (lType === 'line' || lType === 'fill') &&
      (lId.includes('road') ||
        lId.includes('highway') ||
        lId.includes('street') ||
        lId.includes('transport') ||
        sLayer.includes('transport') ||
        lId.includes('bridge') ||
        lId.includes('tunnel') ||
        lId.includes('jalan'))
    ) {
      return 'roads';
    }

    return null;
  }
}
