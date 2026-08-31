import React from "react";
import { ShieldCheck, CalendarDays, RefreshCw } from "lucide-react";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import type { SpeedClass } from "@/components/ui/speed-chip";

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
export function PdpPromises({ speed }: { speed: SpeedClass }) {
  return (
    <div className="mt-[18px] rounded-[22px] bg-paper px-5 py-1.5 shadow-card">
      <Row
        icon={<ShieldCheck className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title="Batch verified before dispatch"
      >
        Every bag is photographed before loading with its batch number and packing date
        readable.{" "}
        <PlaceholderValue pending="the Batch model is not built, so no code is recorded yet">
          Batch codes are not yet recorded against orders.
        </PlaceholderValue>
      </Row>

      <div className="h-px bg-line" />

      <Row
        icon={<CalendarDays className="size-[18px]" strokeWidth={1.7} aria-hidden />}
        title={speed === "scheduled" ? "Delivered on a slot you choose" : "Out from the Srinagar store"}
      >
        {speed === "scheduled" ? (
          <>
            Heavy material travels by truck.{" "}
            <PlaceholderValue pending="slot selection is not built; windows unconfirmed by ops">
              Slot windows are being finalised.
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
