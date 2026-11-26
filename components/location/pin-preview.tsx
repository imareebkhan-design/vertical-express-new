"use client";

import { useEffect, useRef, useState } from "react";
import { mapsKey, type GMaps } from "@/lib/tracking/maps-loader";

/**
 * A small, still map with one pin — "is this the right place?" at a glance.
 *
 * Loaded only when a place is on screen to be confirmed, never while typing.
 * No key, or the script fails: nothing is drawn and the address text carries
 * the confirmation alone, as it did before there was a map.
 */
export function PinPreview({
  lat,
  lng,
  loadMaps,
  enabled = mapsKey() !== null,
}: {
  lat: number;
  lng: number;
  loadMaps: () => Promise<GMaps | null>;
  /** Whether a browser Maps key is configured. Without one there is no box at all, not an empty one. */
  enabled?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadMaps()
      .then((g) => {
        if (!live) return;
        if (!g || !el.current) {
          setFailed(true);
          return;
        }
        const center = { lat, lng };
        const map = new g.Map(el.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
        });
        new g.Marker({ map, position: center, title: "Delivery location" });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [lat, lng, loadMaps, enabled]);

  if (!enabled || failed) return null;
  return <div ref={el} role="img" aria-label="Map of the delivery location" className="h-36 w-full overflow-hidden rounded-2xl bg-hush" />;
}
