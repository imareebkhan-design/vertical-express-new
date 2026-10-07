"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock, Tag } from "lucide-react";
import { DEAL_OF_THE_DAY } from "@/lib/merchandising/home";
import { countdownLabel, resolveDealOfTheDay, type DealProduct } from "@/lib/merchandising/deal";
import { formatPaise } from "@/lib/money";

/**
 * Deal of the Day.
 *
 * Shows a live deal only when one is configured and holds up against the
 * catalogue (`resolveDealOfTheDay`); otherwise nothing at all. A
 * countdown appears only for a configured expiry, ticks on the client, and the
 * section disappears the moment it runs out.
 */
export function DealOfTheDay({
  product,
  compact = false,
}: {
  /** The configured deal's product from the catalogue, or null. */
  product: DealProduct | null;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const view = resolveDealOfTheDay(DEAL_OF_THE_DAY, product, now);
  const ticking = view.state === "live" && view.expiresAt !== null;
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [ticking]);

  const wrap = compact ? "ve-reveal px-4 pt-6" : "ve-reveal mx-auto max-w-[1200px] px-6 pt-16";

  /* No approved deal: the section is simply absent. A "coming soon" panel is
     a promise taking up space on a shopping page. */
  if (view.state === "coming-soon") return null;

  const left = view.expiresAt ? countdownLabel(view.expiresAt, now) : null;
  return (
    <section aria-labelledby="deal-of-the-day" className={wrap}>
      <div className="ve-deal-panel">
        <Link href={view.href} className="ve-deal-media" tabIndex={-1} aria-hidden>
          {view.imageUrl ? (
            <Image src={view.imageUrl} alt="" fill sizes={compact ? "40vw" : "280px"} className="object-contain p-4" />
          ) : (
            <Tag className="size-12 text-ink-500" strokeWidth={1.4} />
          )}
        </Link>
        <div className="relative flex-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand">{view.headline ?? "Deal of the day"}</span>
          <div className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-white/60">{view.brandName}</div>
          <h2 id="deal-of-the-day" className={compact ? "mt-1 text-[18px] font-extrabold leading-[23px] text-white" : "mt-1 text-[26px] font-extrabold leading-8 tracking-[-0.025em] text-white"}>
            <Link href={view.href} className="no-underline">
              {view.title}
            </Link>
          </h2>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className={compact ? "text-[22px] font-extrabold tabular-nums text-white" : "text-[30px] font-extrabold tabular-nums text-white"}>
              {formatPaise(view.pricePaise)}
            </span>
            <span className="text-[12px] font-semibold text-white/60">{view.unitLabel}</span>
            {view.mrpPaise !== null ? (
              <span className="text-[13px] font-semibold tabular-nums text-white/55 line-through">MRP {formatPaise(view.mrpPaise)}</span>
            ) : null}
            {view.discountPercent ? (
              <span className="rounded-chip bg-brand px-2 py-0.5 text-[11.5px] font-extrabold text-ink">{view.discountPercent}% off</span>
            ) : null}
          </div>
          {left ? (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold tabular-nums text-white/80" role="timer" aria-live="off">
              <Clock className="size-3.5" aria-hidden />
              Ends in {left}
            </div>
          ) : null}
          <div className="mt-4">
            <Link href={view.href} className="ve-hero-cta ve-hero-cta-primary">
              View deal
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
