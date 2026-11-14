import React from "react";
import { cn } from "@/lib/utils";

/**
 * A value that is a stand-in, not a confirmed business rule.
 *
 * It marks the spot in the source — `pending` says what has to be settled and
 * by whom — so the open question is findable (`grep PlaceholderValue`) and the
 * value can be swapped when the owner answers.
 *
 * Nothing of that reaches the customer. It used to render a dotted amber
 * underline and a hover title such as "Provisional — no Order.gstin field and
 * no Invoice model", which put developer notes in front of shoppers. Now the
 * words render as ordinary text; `data-placeholder` remains for audits.
 */
export function PlaceholderValue({
  children,
  className,
}: {
  children: React.ReactNode;
  /** What still has to be settled, and by whom. Source-only; never rendered. */
  pending?: string;
  className?: string;
}) {
  return (
    <span className={cn(className)} data-placeholder="true">
      {children}
    </span>
  );
}
