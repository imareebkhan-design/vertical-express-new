import React from "react";
import { cn } from "@/lib/utils";

/**
 * A value that is a plausible stand-in, not a confirmed business rule.
 *
 * The design's placeholder register (design-canvas/Legend.dc.html) exists
 * because an unmarked guess gets screenshotted into a pitch deck and becomes a
 * commitment. Its answer is a dotted amber underline — deliberately quiet on
 * screen, unmistakable when you look for it.
 *
 * This is the mechanism that lets an unconfirmed figure be *shown* rather than
 * omitted. Omitting it silently deletes a section the design intends to be
 * there; marking it keeps the layout honest and keeps the open question
 * visible. Money, time, limits and terms carry the marker. Product facts,
 * standards and pack sizes do not.
 *
 * Amber is a 1.5px rule here, never text — the accent fails AA against the warm
 * canvas, so the words stay ink and only the underline is amber.
 */
export function PlaceholderValue({
  children,
  /** What still has to be settled, and by whom. Surfaced to assistive tech. */
  pending,
  className,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "border-b-[1.5px] border-dotted border-amber pb-px",
        className
      )}
      title={pending ? `Provisional — ${pending}` : "Provisional value, pending confirmation"}
      data-placeholder="true"
    >
      {children}
    </span>
  );
}
