"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Share2 } from "lucide-react";
import { TOTAL_CATEGORIES } from "@/components/ui/product-panel";

export function Footer() {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  return (
    <footer className="bg-ink text-white pt-[52px] pb-[34px]">
      <div className="mx-auto max-w-[1200px] px-6">
        {/* 5-Column Grid: 1.3fr 1fr 1fr 1fr 1.4fr */}
        <div className="grid grid-cols-1 gap-9 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.4fr]">
          {/* Column 1: Brand & Info */}
          <div>
            <Link href="/" aria-label="Vertical Express home">
              <Logo variant="light" className="h-auto w-[200px] max-w-full" />
            </Link>
            <p className="mt-3.5 max-w-[250px] text-[13.5px] font-medium leading-[21px] text-white/60">
              Construction material delivered across Srinagar. Small items from our store, heavy loads by truck.
            </p>
            <div className="mt-4 flex gap-2">
              {/* A "Call support" button dialled +91 98765 43210 — the design
                  canvas's example number, not ours. No support number has been
                  published (the contact page brackets it), so there is nothing
                  to call; it comes back when the owner supplies one. */}
              {/* Only where the browser can share: elsewhere (most desktop
                  browsers) the button did nothing when pressed. */}
              {canShare && (
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.share) {
                    navigator.share({ title: "Vertical Express", url: "https://verticalexpress.in" }).catch(() => {});
                  }
                }}
                className="flex size-[38px] items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                aria-label="Share site"
              >
                <Share2 className="size-4" />
              </button>
              )}
            </div>
          </div>

          {/* Column 2: Materials */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-white/45">
              Materials
            </p>
            <ul className="space-y-1 text-[13.5px] font-medium leading-[30px]">
              <li><Link href="/category/cement" className="text-white/70 hover:text-white transition-colors">Civil &amp; Interiors</Link></li>
              <li><Link href="/category/general-hardware-tools" className="text-white/70 hover:text-white transition-colors">Furniture &amp; Hardware</Link></li>
              <li><Link href="/category/wires-mcb-distribution-boards" className="text-white/70 hover:text-white transition-colors">Electrical</Link></li>
              <li><Link href="/category/cpvc-pipes-overhead-tanks" className="text-white/70 hover:text-white transition-colors">Plumbing, Sanitary &amp; Bath</Link></li>
              <li><Link href="/categories" className="text-white/70 hover:text-white transition-colors">All {TOTAL_CATEGORIES} categories</Link></li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-white/45">
              Company
            </p>
            <ul className="space-y-1 text-[13.5px] font-medium leading-[30px]">
              <li><Link href="/how-we-work" className="text-white/70 hover:text-white transition-colors">About us</Link></li>
              <li><Link href="/how-we-work" className="text-white/70 hover:text-white transition-colors">How we work</Link></li>
              <li><Link href="/contact" className="text-white/70 hover:text-white transition-colors">Contact</Link></li>
              <li><Link href="/faq" className="text-white/70 hover:text-white transition-colors">FAQ</Link></li>
              <li><Link href="/faq" className="text-white/70 hover:text-white transition-colors">Knowledge hub</Link></li>
            </ul>
          </div>

          {/* Column 4: Downloads */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-white/45">
              Downloads
            </p>
            <ul className="space-y-1 text-[13.5px] font-medium leading-[30px]">
              <li><Link href="/downloads" className="text-white/70 hover:text-white transition-colors">Get the app</Link></li>
              <li><Link href="/downloads" className="text-white/70 hover:text-white transition-colors">Price lists</Link></li>
              <li><Link href="/downloads" className="text-white/70 hover:text-white transition-colors">Brand catalogues</Link></li>
              <li>
                <a
                  href="https://verticalconstruction.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/70 hover:text-white transition-colors"
                >
                  Services site ↗
                </a>
              </li>
            </ul>
          </div>

          {/* Column 5: Get in touch */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.09em] text-white/45">
              Get in touch
            </p>
            <div className="text-[13.5px] font-medium leading-[23px] text-white/70">
              <a href="mailto:info@verticalexpress.in" className="hover:text-white transition-colors">info@verticalexpress.in</a>
              <br />
              {/*
                Was "Lal Chowk, Srinagar, J&K 190001" over "Open 8 AM – 8 PM,
                all days". Neither is settled.

                The contact page already handles this honestly — "[Registered
                business name and address to be published.] Srinagar, Jammu &
                Kashmir" — and the terms page lists the registered address among
                the values still to be confirmed. A second, more specific
                address in the footer contradicted both, and lib/data.ts carries
                a third ("Residency Road") which nothing renders.

                The hours were the odder claim: the contact page brackets the
                phone number as "[number to be published]" and in the same
                breath told people to call during opening hours. You cannot ring
                a number that has not been published, and somebody turning up at
                a Lal Chowk address at 7pm would be the version of this that
                costs a real journey.
              */}
              <span>Srinagar, Jammu &amp; Kashmir</span>
            </div>

            {/* The "Join" email form that sat here said "You're on the list" /
                "Joined" and stored nothing — no mailing list exists (no model,
                action or provider). A success the customer cannot rely on is
                worse than no form, so it is gone until the owner chooses a
                mailing list (owner-input register). */}
          </div>
        </div>

        {/* 1.5px Divider */}
        <div className="my-8 h-[1.5px] bg-white/10" />

        {/* Bottom Rule */}
        <div className="flex flex-col items-start justify-between gap-4 text-[12.5px] font-medium text-white/45 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-6">
            <span>© 2026 Vertical Express · Srinagar, J&amp;K</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-white/50 hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="text-white/50 hover:text-white transition-colors">Privacy</Link>
            <Link href="/refunds" className="text-white/50 hover:text-white transition-colors">Refunds</Link>
            <Link href="/shipping" className="text-white/50 hover:text-white transition-colors">Shipping</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
