import React from "react";
import { Truck, RefreshCw, PackageOpen } from "lucide-react";
import type { SpeedClass } from "@/components/ui/speed-chip";
import { storageGuidanceFor } from "@/lib/storage-guidance";

/**
 * Delivery and replacement, under the buy box — only what is true today.
 *
 * Unsettled items (batch codes, delivery windows, the return window) are not
 * printed as "not yet" notes: a shopper reads those as a shop that is not
 * ready. They appear here when the owner settles them.
 */
export function PdpPromises({
  speed,
  categorySlug,
}: {
  speed: SpeedClass;
  /** Decides the storage line, which most categories do not get. */
  categorySlug: string;
}) {
  const storage = storageGuidanceFor(categorySlug);

  return (
    <div className="mt-[18px] rounded-[22px] bg-paper px-5 py-1.5 shadow-card">
      <Row
        icon={<Truck className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title={speed === "scheduled" ? "Delivered by truck to your gate" : "Dispatched from our Srinagar store"}
      >
        {speed === "scheduled"
          ? "Add stairs or a narrow lane to your site’s access note."
          : "Small goods go out ahead of heavy loads."}
      </Row>

      <div className="h-px bg-line" />

      <Row
        icon={<RefreshCw className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title="Damaged or wrong item?"
      >
        Report it at delivery for a replacement.
      </Row>

      {/* Absent for most categories on purpose — see lib/storage-guidance.ts. */}
      {storage && (
        <>
          <div className="h-px bg-line" />
          <Row
            icon={<PackageOpen className="size-[18px]" strokeWidth={1.7} aria-hidden />}
            title={storage.title}
          >
            {storage.detail}
          </Row>
        </>
      )}
    </div>
  );
}

function Row({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-[13px] py-3">
      <span className="mt-px flex-none text-ink-500">{icon}</span>
      <div>
        <p className="text-[13px] font-bold leading-[18px] text-ink">{title}</p>
        <p className="mt-[3px] text-[13px] font-medium leading-[18.5px] text-ink-700">{children}</p>
      </div>
    </div>
  );
}
