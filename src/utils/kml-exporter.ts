/**
 * OGC KML 2.2 Exporter for WebGIS Geometries & Layers
 * Converts GeoJSON FeatureCollections to standard KML for Google Earth & ArcGIS Desktop.
 */

import { escapeHtml } from './sanitize';

export function geoJsonToKml(
  geojson: GeoJSON.FeatureCollection | GeoJSON.Feature,
  documentName: string = 'WebGIS Export'
): string {
  const features: GeoJSON.Feature[] =
    geojson.type === 'FeatureCollection' ? geojson.features : [geojson];

  const placemarks = features
    .map((feature, index) => featureToKmlPlacemark(feature, index))
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeHtml(documentName)}</name>
    <description>Diekspor dari Digital Earth Indonesia WebGIS</description>
    <Style id="webgis-line">
      <LineStyle>
        <color>ffffff00</color>
        <width>3.5</width>
      </LineStyle>
      <PolyStyle>
        <color>40ffff00</color>
      </PolyStyle>
    </Style>
    <Style id="webgis-point">
      <IconStyle>
        <scale>1.1</scale>
        <Icon>
          <href>https://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
${placemarks}
  </Document>
</kml>`;
}

function featureToKmlPlacemark(feature: GeoJSON.Feature, index: number): string {
  if (!feature || !feature.geometry) return '';

  const props = feature.properties || {};
  const name = escapeHtml(props.name || props.NAMOBJ || props.nama_obj || `Objek ${index + 1}`);
  
  const descItems = Object.entries(props)
    .filter(([k]) => k !== 'name' && k !== 'NAMOBJ' && k !== 'nama_obj')
    .slice(0, 8)
    .map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`)
    .join('<br/>');

  const desc = descItems ? `<description><![CDATA[${descItems}]]></description>` : '';
  const geomXml = geometryToKml(feature.geometry);
  if (!geomXml) return '';

  const styleUrl = feature.geometry.type === 'Point' ? '#webgis-point' : '#webgis-line';

  return `    <Placemark>
      <name>${name}</name>
      ${desc}
      <styleUrl>${styleUrl}</styleUrl>
      ${geomXml}
    </Placemark>`;
}

function geometryToKml(geometry: GeoJSON.Geometry): string {
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat, alt = 0] = geometry.coordinates;
      return `<Point><coordinates>${lng},${lat},${alt}</coordinates></Point>`;
    }
    case 'LineString': {
      const coords = geometry.coordinates
        .map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`)
        .join(' ');
      return `<LineString><extrude>0</extrude><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>`;
    }
    case 'Polygon': {
      const rings = geometry.coordinates.map((ring, i) => {
        const coords = ring
          .map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`)
          .join(' ');
        const ringXml = `<LinearRing><coordinates>${coords}</coordinates></LinearRing>`;
        return i === 0
          ? `<outerBoundaryIs>${ringXml}</outerBoundaryIs>`
          : `<innerBoundaryIs>${ringXml}</innerBoundaryIs>`;
      }).join('');
      return `<Polygon><extrude>0</extrude><tessellate>1</tessellate>${rings}</Polygon>`;
    }
    case 'MultiPoint': {
      const points = geometry.coordinates
        .map(([lng, lat, alt = 0]) => `<Point><coordinates>${lng},${lat},${alt}</coordinates></Point>`)
        .join('');
      return `<MultiGeometry>${points}</MultiGeometry>`;
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates
        .map(line => {
          const coords = line.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ');
          return `<LineString><extrude>0</extrude><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>`;
        })
        .join('');
      return `<MultiGeometry>${lines}</MultiGeometry>`;
    }
    case 'MultiPolygon': {
      const polys = geometry.coordinates
        .map(poly => {
          const rings = poly.map((ring, i) => {
            const coords = ring.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ');
            const ringXml = `<LinearRing><coordinates>${coords}</coordinates></LinearRing>`;
            return i === 0
              ? `<outerBoundaryIs>${ringXml}</outerBoundaryIs>`
              : `<innerBoundaryIs>${ringXml}</innerBoundaryIs>`;
          }).join('');
          return `<Polygon><extrude>0</extrude><tessellate>1</tessellate>${rings}</Polygon>`;
        })
        .join('');
      return `<MultiGeometry>${polys}</MultiGeometry>`;
    }
    default:
      return '';
  }
}

export function downloadKml(kmlString: string, filename: string = 'webgis-export.kml'): void {
  const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.kml') ? filename : `${filename}.kml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
