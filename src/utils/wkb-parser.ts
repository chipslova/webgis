// Simple, robust zero-dependency WKB (Well-Known Binary) to GeoJSON Geometry parser
// Supports Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon
// Handles both standard WKB, EWKB (with SRID), and ISO WKB (Z/M coordinates)

export function parseWKBToGeoJSON(buffer: ArrayBuffer | Uint8Array): GeoJSON.Geometry | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 5) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function readGeometry(): GeoJSON.Geometry | null {
    if (offset + 5 > bytes.length) return null;

    const littleEndian = view.getUint8(offset) === 1;
    offset += 1;

    let rawType = view.getUint32(offset, littleEndian);
    offset += 4;

    // Check EWKB SRID flag
    const hasSRID = (rawType & 0x20000000) !== 0;
    const hasZ = (rawType & 0x80000000) !== 0 || (rawType >= 1000 && rawType < 2000) || (rawType >= 3000 && rawType < 4000);

    if (hasSRID) {
      offset += 4; // Skip 4-byte SRID
    }

    // Normalize geometry type code
    let geomType = rawType & 0x000000ff;
    if (rawType >= 1000 && rawType < 2000) geomType = rawType - 1000;
    else if (rawType >= 2000 && rawType < 3000) geomType = rawType - 2000;
    else if (rawType >= 3000 && rawType < 4000) geomType = rawType - 3000;

    function readCoordinates(): [number, number] | [number, number, number] {
      const x = view.getFloat64(offset, littleEndian);
      offset += 8;
      const y = view.getFloat64(offset, littleEndian);
      offset += 8;
      if (hasZ) {
        const z = view.getFloat64(offset, littleEndian);
        offset += 8;
        return [x, y, z];
      }
      return [x, y];
    }

    function readPointArray(count: number): number[][] {
      const pts: number[][] = [];
      for (let i = 0; i < count; i++) {
        pts.push(readCoordinates());
      }
      return pts;
    }

    switch (geomType) {
      case 1: { // Point
        const coords = readCoordinates();
        return { type: 'Point', coordinates: coords };
      }
      case 2: { // LineString
        const numPoints = view.getUint32(offset, littleEndian);
        offset += 4;
        const coords = readPointArray(numPoints);
        return { type: 'LineString', coordinates: coords };
      }
      case 3: { // Polygon
        const numRings = view.getUint32(offset, littleEndian);
        offset += 4;
        const rings: number[][][] = [];
        for (let r = 0; r < numRings; r++) {
          const numPoints = view.getUint32(offset, littleEndian);
          offset += 4;
          rings.push(readPointArray(numPoints));
        }
        return { type: 'Polygon', coordinates: rings };
      }
      case 4: { // MultiPoint
        const numPoints = view.getUint32(offset, littleEndian);
        offset += 4;
        const pts: number[][] = [];
        for (let i = 0; i < numPoints; i++) {
          const sub = readGeometry();
          if (sub && sub.type === 'Point') {
            pts.push(sub.coordinates);
          }
        }
        return { type: 'MultiPoint', coordinates: pts };
      }
      case 5: { // MultiLineString
        const numLines = view.getUint32(offset, littleEndian);
        offset += 4;
        const lines: number[][][] = [];
        for (let i = 0; i < numLines; i++) {
          const sub = readGeometry();
          if (sub && sub.type === 'LineString') {
            lines.push(sub.coordinates);
          }
        }
        return { type: 'MultiLineString', coordinates: lines };
      }
      case 6: { // MultiPolygon
        const numPolys = view.getUint32(offset, littleEndian);
        offset += 4;
        const polys: number[][][][] = [];
        for (let i = 0; i < numPolys; i++) {
          const sub = readGeometry();
          if (sub && sub.type === 'Polygon') {
            polys.push(sub.coordinates);
          }
        }
        return { type: 'MultiPolygon', coordinates: polys };
      }
      default:
        return null;
    }
  }

  try {
    return readGeometry();
  } catch {
    return null;
  }
}
