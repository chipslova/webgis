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
  contourLines: boolean;
  terrainHillshade: boolean;

  // 3D Terrain & Extrusions
  terrain3D: boolean;
  terrainExaggeration: number;
  buildings3D: boolean;

  // Vector Sublayers Visibility
  sublayers: Record<VectorSublayerKey, boolean>;
}

export const DEFAULT_CUSTOMIZER_STATE: BasemapCustomizerState = {
  contourLines: false,
  terrainHillshade: false,
  terrain3D: false,
  terrainExaggeration: 1.5,
  buildings3D: false,
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

    // 3. Re-apply Global Overlays (Hillshade & Contours)
    this.applyHillshadeOverlay();
    this.applyContourOverlay();

    // 4. Re-apply 3D Buildings & Vector Sublayers
    this.apply3DBuildings();
    this.applyVectorSublayers();
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
      // Return camera smoothly if currently tilted
      const currentPitch = this.map.getPitch();
      if (currentPitch > 50) {
        this.map.easeTo({
          pitch: 0,
          duration: 1000
        });
      }
    }

    this.notify();
  }

  public setTerrainExaggeration(exaggeration: number) {
    this.state.terrainExaggeration = Math.max(0.1, Math.min(3.5, exaggeration));
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
        (this.map as any).setTerrain({
          source: 'terrarium-dem-source',
          exaggeration: this.state.terrainExaggeration
        });
      } else {
        (this.map as any).setTerrain(null);
      }
    } catch (e) {
      console.warn('[BasemapCustomizer] Error setting 3D terrain:', e);
    }
  }

  // --- 2. GLOBAL OVERLAYS (HILLSHADE & CONTOUR LINES) ---

  public toggleTerrainHillshade(enabled?: boolean) {
    this.state.terrainHillshade = enabled !== undefined ? enabled : !this.state.terrainHillshade;
    this.applyHillshadeOverlay();
    this.notify();
  }

  public toggleContourLines(enabled?: boolean) {
    this.state.contourLines = enabled !== undefined ? enabled : !this.state.contourLines;
    this.applyContourOverlay();
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

  private applyContourOverlay() {
    if (!this.map || !this.map.getStyle()) return;

    const sourceId = 'overlay-contour-source';
    const layerId = 'overlay-contour-lines';

    try {
      if (this.state.contourLines) {
        if (!this.map.getSource(sourceId)) {
          this.map.addSource(sourceId, {
            type: 'raster',
            tiles: [
              'https://tile.opentopomap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            maxzoom: 17,
            attribution: '© OpenTopoMap (CC-BY-SA)'
          });
        }

        if (!this.map.getLayer(layerId)) {
          this.map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': 0.7,
              'raster-contrast': 0.25,
              'raster-fade-duration': 200
            }
          });
        } else {
          this.map.setLayoutProperty(layerId, 'visibility', 'visible');
        }
      } else if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    } catch (e) {
      console.warn('[BasemapCustomizer] Error applying contour overlay:', e);
    }
  }

  // --- 3. 3D EXTRUDED BUILDINGS ---

  public toggle3DBuildings(enabled?: boolean) {
    this.state.buildings3D = enabled !== undefined ? enabled : !this.state.buildings3D;
    this.apply3DBuildings();
    this.notify();
  }

  /**
   * Resolves vector building source from current style or dynamically injects
   * global OpenFreeMap planet vector building tiles (OpenMapTiles schema).
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
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['to-number', ['get', 'render_height']], ['to-number', ['get', 'height']], ['*', ['to-number', ['coalesce', ['get', 'building:levels'], ['get', 'levels'], 2]], 3.5], 15],
                  0, '#1e293b',
                  25, '#334155',
                  60, '#0284c7',
                  120, '#00f0ff',
                  250, '#38bdf8'
                ],
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
