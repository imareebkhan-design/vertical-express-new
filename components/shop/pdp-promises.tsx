import React from "react";
import { ShieldCheck, CalendarDays, RefreshCw, PackageOpen } from "lucide-react";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import type { SpeedClass } from "@/components/ui/speed-chip";
import { storageGuidanceFor } from "@/lib/storage-guidance";

/**
 * The three promises under the buy box: genuineness, when it arrives, and what
 * happens if it turns up damaged.
 *
 * Every one rests on something not yet settled — the Batch model does not
 * exist, slot selection is not built, and the return window is unconfirmed.
 * That is not a reason to drop the card. The design shows all three and marks
 * the unsettled parts with the dotted amber underline; the artboard itself
 * prints "Return window and conditions to be confirmed" on the frame.
 *
 * So: state the promise, mark what is provisional, and never print a batch code
 * or a date that no record backs.
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
      {/* The artboard titles this block "Delivery, returns and storage". It was
          untitled, which left three rows floating under the buy box with
          nothing saying what they were collectively about. */}
      <p className="pt-3.5 text-[11px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
        Delivery, returns and storage
      </p>
      <Row
        icon={<ShieldCheck className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title="Batch codes"
      >
        <PlaceholderValue pending="the Batch model is not built, so no code is recorded yet">
          Batch codes are not yet recorded against orders.
        </PlaceholderValue>
      </Row>

      <div className="h-px bg-line" />

      <Row
        icon={<CalendarDays className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title={speed === "scheduled" ? "Delivered by truck, to your gate" : "Out from the Srinagar store"}
      >
        {speed === "scheduled" ? (
          <>
            Heavy material travels by truck and is unloaded at the gate. Tell us about
            stairs or a narrow lane in your site&rsquo;s access note — it is the line the
            driver reads before setting off.{" "}
            {/* The heading used to read "Delivered on a slot you choose" over
                this line — a choice the customer does not have (no Slot model). */}
            <PlaceholderValue pending="slot selection is not built; windows unconfirmed by ops">
              No delivery time is set for truck loads yet.
            </PlaceholderValue>
          </>
        ) : (
          <>Small goods are held in Srinagar and go out ahead of the truck.</>
        )}
      </Row>

      <div className="h-px bg-line" />

      <Row
        icon={<RefreshCw className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title="Replacement for damage or wrong goods"
      >
        Report it at delivery.{" "}
        <PlaceholderValue pending="return policy unconfirmed — owner">
          Return window and conditions to be confirmed.
        </PlaceholderValue>
      </Row>

      {/* Absent for most categories on purpose — see lib/storage-guidance.ts.
          A plausible line invented for a material nobody checked is the same
          failure as an invented delivery time in safer clothes. */}
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
