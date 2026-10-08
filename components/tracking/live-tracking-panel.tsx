"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderTracking, ShipmentTracking } from "@/lib/services/tracking";
import { decodePolyline, haversineM } from "@/lib/tracking/geo";
import { liveTrackingView } from "@/lib/tracking/policy";
import type { GMap, GMaps, GMarker, GPolyline } from "@/lib/tracking/maps-loader";

/**
 * "Track your order" — the live map for a shipment that is out for delivery.
 *
 * Everything on it is real or absent: the rider marker is the last position
 * their phone sent, the route and ETA are the last Routes API answer, and what
 * the panel says is decided by `liveTrackingView` on this device's clock. When
 * the position goes stale the marker turns into a grey "last seen" dot, the
 * route comes down and the panel says "Updating rider location…"; without a
 * fresh route it says "ETA updating". Nothing is moved or timed by guesswork. A short ease
 * between two real positions is the only motion, and it is skipped under
 * reduced motion.
 *
 * Polls while the tab is visible and the shipment is on the road; the moment it
 * is delivered or cancelled the poll stops and the page refreshes into its
 * normal delivered state.
 */

/** Marker colours come from the design tokens; Maps needs literal strings. */
function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
const TWEEN_MS = 900;
const TWEEN_MAX_M = 1_500;

export type LoadTracking = (orderNo: string) => Promise<{ ok: true; data: OrderTracking } | { ok: false }>;

/** The card itself, with its I/O passed in so every state can be exercised in a test. */
export function LiveTrackingPanel({
  orderNo,
  shipmentId,
  load,
  loadMaps,
  onFinished,
}: {
  orderNo: string;
  shipmentId: string;
  load: LoadTracking;
  loadMaps: () => Promise<GMaps | null>;
  onFinished: () => void;
}) {
  const [data, setData] = useState<OrderTracking | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">("loading");

  const mapEl = useRef<HTMLDivElement>(null);
  const maps = useRef<GMaps | null>(null);
  const map = useRef<GMap | null>(null);
  const riderMarker = useRef<GMarker | null>(null);
  const destMarker = useRef<GMarker | null>(null);
  const routeLine = useRef<GPolyline | null>(null);
  const shownAt = useRef<{ lat: number; lng: number } | null>(null);
  const fittedRoute = useRef<string | null>(null);
  const tween = useRef<number | null>(null);
  /* The poll loop is created once; it reads the interval the latest response asked for. */
  const pollMs = useRef(8_000);

  const shipment: ShipmentTracking | undefined = data?.shipments.find((s) => s.id === shipmentId);
  /* Everything the panel says, re-decided every second on this device's clock:
     a position or route that ages out while the network is down stops being
     shown as current without waiting for the server. */
  const view = liveTrackingView(
    shipment,
    now,
    { staleAfterMs: data?.staleAfterMs ?? 45_000, routeMaxAgeMs: data?.routeMaxAgeMs ?? 60_000 },
    { loaded: data !== null, failed }
  );

  /* ---- poll ---- */
  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        const res = await load(orderNo).catch(() => null);
        if (!live) return;
        if (res?.ok) {
          pollMs.current = res.data.pollMs;
          setData(res.data);
          setFailed(false);
          const s = res.data.shipments.find((x) => x.id === shipmentId);
          if (s && s.phase !== "live") {
            onFinished();
            return;
          }
        } else {
          setFailed(true);
        }
      }
      timer = window.setTimeout(tick, pollMs.current);
    };
    void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [orderNo, shipmentId, load, onFinished]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);

  /* ---- map ---- */
  useEffect(() => {
    let cancelled = false;
    loadMaps().then((g) => {
      if (cancelled) return;
      if (!g || !mapEl.current) {
        setMapState("unavailable");
        return;
      }
      maps.current = g;
      map.current = new g.Map(mapEl.current, {
        center: { lat: 34.0837, lng: 74.7973 },
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      setMapState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [loadMaps]);

  useEffect(() => {
    const g = maps.current;
    const m = map.current;
    if (mapState !== "ready" || !g || !m || !data) return;
    const INK = token("--color-ink-900", "black");
    const BRAND = token("--color-amber", "orange");
    const PAPER = token("--color-paper", "white");

    if (data.destination && !destMarker.current) {
      destMarker.current = new g.Marker({
        map: m,
        position: data.destination,
        title: "Your delivery location",
        icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: INK, fillOpacity: 1, strokeColor: PAPER, strokeWeight: 3 },
      });
    }

    const rider = shipment?.driver;
    if (rider) {
      /* A position that is no longer current is drawn as a grey, unrotated
         "last seen" dot, never as the live rider. */
      const MUTED = token("--color-ink-300", "grey");
      const icon = !view.riderCurrent
        ? { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: MUTED, fillOpacity: 0.7, strokeColor: PAPER, strokeWeight: 2 }
        : rider.heading !== null
          ? { path: g.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, rotation: rider.heading, fillColor: BRAND, fillOpacity: 1, strokeColor: INK, strokeWeight: 2 }
          : { path: g.SymbolPath.CIRCLE, scale: 9, fillColor: BRAND, fillOpacity: 1, strokeColor: INK, strokeWeight: 2 };
      const target = { lat: rider.lat, lng: rider.lng };
      if (!riderMarker.current) {
        riderMarker.current = new g.Marker({ map: m, position: target, title: view.riderCurrent ? "Delivery partner" : "Last known position", icon, zIndex: 2 });
        shownAt.current = target;
      } else {
        riderMarker.current.setIcon(icon);
        moveRider(target);
      }
    }

    const route = view.showRoute ? shipment?.route : null;
    if (route) {
      const path = decodePolyline(route.polyline);
      if (!routeLine.current) {
        routeLine.current = new g.Polyline({ map: m, path, strokeColor: INK, strokeOpacity: 0.85, strokeWeight: 5 });
      } else {
        routeLine.current.setPath(path);
      }
      if (fittedRoute.current !== route.computedAt) {
        fittedRoute.current = route.computedAt;
        const b = new g.LatLngBounds();
        path.forEach((p) => b.extend(p));
        m.fitBounds(b, 48);
      }
    } else if (routeLine.current) {
      routeLine.current.setMap(null);
      routeLine.current = null;
      fittedRoute.current = null;
    }

    if (!route && fittedRoute.current === null) {
      const pts = [data.destination, rider ? { lat: rider.lat, lng: rider.lng } : null].filter(Boolean) as { lat: number; lng: number }[];
      if (pts.length === 2) {
        const b = new g.LatLngBounds();
        pts.forEach((p) => b.extend(p));
        m.fitBounds(b, 64);
        fittedRoute.current = "points";
      } else if (pts.length === 1) {
        m.setCenter(pts[0]);
        m.setZoom(15);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on each response, and when freshness flips
  }, [data, mapState, view.riderCurrent, view.showRoute]);

  useEffect(
    () => () => {
      if (tween.current !== null) cancelAnimationFrame(tween.current);
    },
    []
  );

  /** Ease the marker between two REAL positions; jump when far apart or under reduced motion. */
  function moveRider(target: { lat: number; lng: number }) {
    const marker = riderMarker.current;
    const from = shownAt.current;
    if (!marker) return;
    if (tween.current !== null) cancelAnimationFrame(tween.current);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    if (!from || reduced || haversineM(from, target) > TWEEN_MAX_M) {
      marker.setPosition(target);
      shownAt.current = target;
      return;
    }
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / TWEEN_MS);
      const e = 1 - (1 - k) ** 3;
      const p = { lat: from.lat + (target.lat - from.lat) * e, lng: from.lng + (target.lng - from.lng) * e };
      marker.setPosition(p);
      shownAt.current = p;
      tween.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    tween.current = requestAnimationFrame(step);
  }

  /* ---- panel ---- */
  const rider = shipment?.driver ?? null;
  const ageS = rider ? Math.max(0, Math.round((now - Date.parse(rider.recordedAt)) / 1000)) : null;

  return (
    <section aria-labelledby="live-tracking" className="overflow-hidden rounded-[24px] bg-paper shadow-card">
      <div className="relative h-[260px] w-full bg-chip sm:h-[340px]">
        <div ref={mapEl} className="absolute inset-0" aria-label="Live delivery map" role="region" />
        {mapState !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] font-semibold text-ink-500">
            {mapState === "loading" ? "Loading map…" : "The map isn't available right now. Live status is below."}
          </div>
        ) : null}
      </div>
      <div className="p-5">
        <p id="live-tracking" className="text-[12px] font-bold uppercase tracking-[0.09em] text-ink-500">
          Track your order
        </p>
        <p className="mt-1 text-[24px] font-extrabold leading-8 tracking-[-0.025em] text-ink" aria-live="polite">
          {view.headline}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
          <div>
            <dt className="font-semibold text-ink-500">Distance</dt>
            <dd className="mt-0.5 text-[14px] font-bold tabular-nums text-ink">
              {view.distance ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-500">Status</dt>
            <dd className="mt-0.5 text-[14px] font-bold text-ink">Out for delivery</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-500">Last updated</dt>
            <dd className="mt-0.5 text-[14px] font-bold tabular-nums text-ink">
              {ageS === null ? "—" : ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)} min ago`}
            </dd>
          </div>
        </dl>
        {data && failed ? (
          <p className="mt-3 text-[12px] font-medium text-ink-500" role="status">
            Connection lost. Retrying…
          </p>
        ) : null}
      </div>
    </section>
  );
}
