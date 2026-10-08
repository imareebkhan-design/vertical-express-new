/**
 * Loads the Google Maps JavaScript API once, on demand, in the browser.
 *
 * Only the tracking screen uses it, so it is not in the page bundle or the
 * document head: it is fetched when a delivery is actually on the road. The key
 * is `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — browser-visible by design, and
 * restricted in Google Cloud to the Maps JavaScript API and to our own
 * referrers, so lifting it from the page buys nothing.
 *
 * Resolves null when there is no key or the script fails: the tracking card
 * then shows its text panel without a map rather than a broken one.
 */

/* The slice of `google.maps` the tracking map uses — declared here rather than
   adding a types package for five classes. */
export interface GLatLngLiteral {
  lat: number;
  lng: number;
}
export interface GMap {
  fitBounds(bounds: GLatLngBounds, padding?: number): void;
  setCenter(p: GLatLngLiteral): void;
  setZoom(z: number): void;
}
export interface GLatLngBounds {
  extend(p: GLatLngLiteral): void;
}
export interface GMarker {
  setPosition(p: GLatLngLiteral): void;
  setIcon(icon: object): void;
  setMap(map: GMap | null): void;
}
export interface GPolyline {
  setPath(path: GLatLngLiteral[]): void;
  setMap(map: GMap | null): void;
}
export interface GMaps {
  Map: new (el: HTMLElement, opts: object) => GMap;
  Marker: new (opts: object) => GMarker;
  Polyline: new (opts: object) => GPolyline;
  LatLngBounds: new () => GLatLngBounds;
  SymbolPath: { CIRCLE: number; FORWARD_CLOSED_ARROW: number };
}

declare global {
  interface Window {
    google?: { maps?: GMaps };
    __veMapsReady?: () => void;
  }
}

let loading: Promise<GMaps | null> | null = null;

export function mapsKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim() || null;
}

export function loadGoogleMaps(): Promise<GMaps | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  const key = mapsKey();
  if (!key) return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    window.__veMapsReady = () => resolve(window.google?.maps?.Map ? window.google.maps : null);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__veMapsReady`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return loading;
}
