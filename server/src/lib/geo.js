/** Small geo toolkit. No dependencies - all coordinates are [lat, lng]. */

const R = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function distanceM(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Shortest distance in metres from p to segment ab, on a local flat projection. */
function distanceToSegmentM(p, a, b) {
  const latRef = toRad((a[0] + b[0]) / 2);
  const mx = (deg) => (deg * Math.PI / 180) * R * Math.cos(latRef);
  const my = (deg) => toRad(deg) * R;

  const px = mx(p[1]);
  const py = my(p[0]);
  const ax = mx(a[1]);
  const ay = my(a[0]);
  const bx = mx(b[1]);
  const by = my(b[0]);

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { metres: Math.hypot(px - cx, py - cy), t };
}

/** Distance in metres from p to the nearest point on a polyline. */
export function distanceToPolylineM(p, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const { metres } = distanceToSegmentM(p, points[i - 1], points[i]);
    if (metres < best) best = metres;
    if (best === 0) break;
  }
  return best;
}

/** Ray-casting point-in-polygon. Polygon is [[lat,lng], ...]. */
export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersects = yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Walk `metres` along `points` starting at fractional index `pos`.
 * Returns the new index, the [lat,lng] and the compass heading in degrees.
 */
export function advanceAlongPath(points, pos, dir, metres) {
  let i = Math.max(0, Math.min(points.length - 1, Math.floor(pos)));
  let frac = Math.max(0, Math.min(1, pos - i));
  if (i >= points.length - 1) {
    i = points.length - 2;
    frac = 1;
  }

  let remaining = metres;
  let guard = 0;
  while (remaining > 0 && guard < 20000) {
    guard += 1;
    const a = points[i];
    const b = points[Math.min(i + 1, points.length - 1)];
    const segLen = distanceM(a, b) || 0.0001;
    const left = segLen * (1 - frac);
    if (remaining <= left) {
      frac += remaining / segLen;
      break;
    }
    remaining -= left;
    i += 1;
    frac = 0;
    if (i >= points.length - 1) {
      i = points.length - 2;
      frac = 0;
      return {
        finished: true,
        pos: points.length - 1 + dir,
        point: points[points.length - 1],
        heading: bearingDeg(a, b),
      };
    }
  }

  const idx = Math.min(points.length - 1, i);
  const a = points[idx];
  const b = points[Math.min(idx + 1, points.length - 1)];
  const pos2 = idx + frac;
  return {
    finished: false,
    pos: pos2,
    point: lerp(a, b, frac),
    heading: bearingDeg(a, b),
  };
}

export function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Compass heading in degrees (0 = north, 90 = east). */
export function bearingDeg(a, b) {
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Offset a point perpendicular to a heading, in metres. */
export function offsetM(point, headingDeg, metres) {
  const brg = toRad(headingDeg);
  const lat = point[0] + toDeg((metres * Math.cos(brg)) / R);
  const lng = point[1] + toDeg((metres * Math.sin(brg)) / (R * Math.cos(toRad(point[0]))));
  return [lat, lng];
}

export function centroid(polygon) {
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += p[0];
    lng += p[1];
  }
  return [lat / polygon.length, lng / polygon.length];
}

/** [south, west, north, east] for Leaflet's L.latLngBounds. */
export function boundsOf(polygon) {
  let s = 90;
  let w = 180;
  let n = -90;
  let e = -180;
  for (const [lat, lng] of polygon) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    w = Math.min(w, lng);
    e = Math.max(e, lng);
  }
  return [s, w, n, e];
}