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
 * catalogue (`resolveDealOfTheDay`); otherwise an honest "coming soon". A
 * countdown appears only for a configured expiry, ticks on the client, and the
 * deal steps down to "coming soon" the moment it runs out.
 */
export function DealOfTheDay({
  product,
  dealsHref,
  compact = false,
}: {
  /** The configured deal's product from the catalogue, or null. */
  product: DealProduct | null;
  /** Where "see current deals" goes, when there are any. */
  dealsHref?: string;
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

  if (view.state === "coming-soon") {
    return (
      <section aria-labelledby="deal-of-the-day" className={wrap}>
        <div className="ve-deal-panel">
          <div className="relative flex-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand">Deal of the day</span>
            <h2 id="deal-of-the-day" className={compact ? "mt-2 text-[21px] font-extrabold leading-[26px] tracking-[-0.025em] text-white" : "mt-2.5 text-[30px] font-extrabold leading-9 tracking-[-0.03em] text-white"}>
              Launch deal — coming soon
            </h2>
            <p className={compact ? "mt-1.5 text-[12.5px] font-medium leading-[18px] text-white/75" : "mt-2 max-w-[460px] text-[14px] font-medium leading-[21px] text-white/75"}>
              Our first Deal of the Day is being set up. Until then, the full range is open.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link href="/categories" className="ve-hero-cta ve-hero-cta-primary">
                Browse materials
                <ChevronRight className="size-4" aria-hidden />
              </Link>
              {dealsHref ? (
                <Link href={dealsHref} className="ve-hero-cta ve-hero-cta-secondary">
                  See current deals
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ve-deal-stamp" aria-hidden>
            <Tag className={compact ? "size-8" : "size-11"} strokeWidth={1.6} />
            <span>Coming soon</span>
          </div>
        </div>
      </section>
    );
  }

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
