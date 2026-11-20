"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { getOrderTrackingAction } from "@/actions/tracking";
import { loadGoogleMaps } from "@/lib/tracking/maps-loader";
import { LiveTrackingPanel } from "./live-tracking-panel";

/** The live tracking card, wired to the server action, Google Maps and the router. See `LiveTrackingPanel`. */
export function LiveTrackingCard({ orderNo, shipmentId }: { orderNo: string; shipmentId: string }) {
  const router = useRouter();
  /* Stable, so the panel's poll is not restarted by a re-render. */
  const onFinished = useCallback(() => router.refresh(), [router]);
  return (
    <LiveTrackingPanel
      orderNo={orderNo}
      shipmentId={shipmentId}
      load={getOrderTrackingAction}
      loadMaps={loadGoogleMaps}
      onFinished={onFinished}
    />
  );
}
