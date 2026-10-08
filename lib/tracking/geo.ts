/**
 * Plain geometry for delivery tracking. No I/O, no Google — so the rules built
 * on it (lib/tracking/policy.ts) are testable without a key or a network.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function validLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Decodes a Google encoded polyline (precision 5) — the format the Routes API
 * returns in `polyline.encodedPolyline`. Returns [] for anything malformed
 * rather than a half-decoded path.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return [];
        byte = encoded.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Shortest distance from `p` to a path, in metres. Uses a local equirectangular
 * projection per segment — accurate to well under a metre over the few
 * kilometres of a city delivery, which is all it is for. Infinity for an empty
 * path.
 */
export function distanceToPathM(p: LatLng, path: LatLng[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return haversineM(p, path[0]);
  const kx = EARTH_RADIUS_M * Math.cos(rad(p.lat)) * (Math.PI / 180);
  const ky = EARTH_RADIUS_M * (Math.PI / 180);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = (path[i].lng - p.lng) * kx;
    const ay = (path[i].lat - p.lat) * ky;
    const bx = (path[i + 1].lng - p.lng) * kx;
    const by = (path[i + 1].lat - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}
