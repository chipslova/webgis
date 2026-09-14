// OGC KML 2.2 Parser to GeoJSON FeatureCollection (Zero External Dependencies)
// Parses Point, LineString, Polygon, MultiGeometry, ExtendedData, and Placemarks

export function parseKMLToGeoJSON(kmlText: string): GeoJSON.FeatureCollection {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Format XML / KML tidak valid atau rusak: ' + parseError.textContent?.slice(0, 100));
  }

  const placemarks = xmlDoc.querySelectorAll('Placemark');
  const features: GeoJSON.Feature[] = [];

  placemarks.forEach((pm) => {
    const properties: Record<string, any> = {};

    // 1. Basic Metadata
    const nameEl = pm.querySelector('name');
    if (nameEl && nameEl.textContent) {
      properties.name = nameEl.textContent.trim();
    }

    const descEl = pm.querySelector('description');
    if (descEl && descEl.textContent) {
      properties.description = descEl.textContent.trim();
    }

    // 2. ExtendedData
    const simpleDataEls = pm.querySelectorAll('ExtendedData SimpleData, ExtendedData Data');
    simpleDataEls.forEach((dataEl) => {
      const key = dataEl.getAttribute('name');
      const val = dataEl.querySelector('value')?.textContent || dataEl.textContent;
      if (key && val) {
        properties[key] = val.trim();
      }
    });

    // 3. Geometries
    const geometry = parsePlacemarkGeometry(pm);
    if (geometry) {
      features.push({
        type: 'Feature',
        geometry,
        properties
      });
    }
  });

  return {
    type: 'FeatureCollection',
    features
  };
}

function parseCoordinatesString(coordStr: string): number[][] {
  const points = coordStr.trim().split(/\s+/);
  const coords: number[][] = [];

  for (const pt of points) {
    if (!pt) continue;
    const parts = pt.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      coords.push(parts.length >= 3 ? [parts[0], parts[1], parts[2]] : [parts[0], parts[1]]);
    }
  }
  return coords;
}

function parsePlacemarkGeometry(pm: Element): GeoJSON.Geometry | null {
  // Check Point
  const pointEl = pm.querySelector('Point');
  if (pointEl) {
    const coordEl = pointEl.querySelector('coordinates');
    if (coordEl && coordEl.textContent) {
      const coords = parseCoordinatesString(coordEl.textContent);
      if (coords.length > 0) {
        return {
          type: 'Point',
          coordinates: coords[0]
        };
      }
    }
  }

  // Check LineString
  const lineEl = pm.querySelector('LineString');
  if (lineEl) {
    const coordEl = lineEl.querySelector('coordinates');
    if (coordEl && coordEl.textContent) {
      const coords = parseCoordinatesString(coordEl.textContent);
      if (coords.length > 0) {
        return {
          type: 'LineString',
          coordinates: coords
        };
      }
    }
  }

  // Check Polygon
  const polyEl = pm.querySelector('Polygon');
  if (polyEl) {
    const outerRingEl = polyEl.querySelector('outerBoundaryIs LinearRing coordinates');
    if (outerRingEl && outerRingEl.textContent) {
      const outerCoords = parseCoordinatesString(outerRingEl.textContent);
      if (outerCoords.length > 0) {
        // Ensure polygon ring is closed
        if (
          outerCoords[0][0] !== outerCoords[outerCoords.length - 1][0] ||
          outerCoords[0][1] !== outerCoords[outerCoords.length - 1][1]
        ) {
          outerCoords.push([...outerCoords[0]]);
        }

        const rings: number[][][] = [outerCoords];

        // Inner rings (holes)
        const innerRingEls = polyEl.querySelectorAll('innerBoundaryIs LinearRing coordinates');
        innerRingEls.forEach((innerEl) => {
          if (innerEl.textContent) {
            const innerCoords = parseCoordinatesString(innerEl.textContent);
            if (innerCoords.length > 0) {
              if (
                innerCoords[0][0] !== innerCoords[innerCoords.length - 1][0] ||
                innerCoords[0][1] !== innerCoords[innerCoords.length - 1][1]
              ) {
                innerCoords.push([...innerCoords[0]]);
              }
              rings.push(innerCoords);
            }
          }
        });

        return {
          type: 'Polygon',
          coordinates: rings
        };
      }
    }
  }

  return null;
}
