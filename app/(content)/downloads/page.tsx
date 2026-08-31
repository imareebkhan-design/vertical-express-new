import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, Smartphone } from "lucide-react";
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";

export const metadata: Metadata = {
  title: "Downloads | Vertical Express",
  description: "Price lists, brand catalogues and the app. Every price document is dated and carries the window it is valid for.",
};

const TRADE_LISTS = [
  {
    title: "Cement, plaster and civil",
    meta: "PDF · valid 1–30 Sep 2026 · 23 products",
    size: "180 KB",
  },
  {
    title: "Tiling, adhesives and grout",
    meta: "PDF · valid 1–30 Sep 2026 · 154 products",
    size: "410 KB",
  },
  {
    title: "Electrical — wire, MCB, switches, lighting",
    meta: "PDF · valid 1–30 Sep 2026 · 270 products",
    size: "520 KB",
  },
  {
    title: "Plumbing, sanitary and bath",
    meta: "PDF · valid 1–30 Sep 2026 · 250 products",
    size: "480 KB",
  },
];

const BRAND_CATALOGUES = [
  {
    title: "UltraTech cement range",
    meta: "2026 edition · 4.2 MB",
    themeColor: "var(--t-civil)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M6 3h12l2 6v12H4V9z" />
        <path d="M10 3v6h4V3" />
      </svg>
    ),
  },
  {
    title: "Asian Paints shade card",
    meta: "2026 edition · 12 MB",
    themeColor: "var(--t-furn)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
        <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    title: "Havells wiring & switchgear",
    meta: "2026 edition · 8.4 MB",
    themeColor: "var(--t-elec)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
    ),
  },
  {
    title: "Jaquar bath fittings",
    meta: "2026 edition · 15 MB",
    themeColor: "var(--t-plumb)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M4 12h16a1 1 0 0 1 1 1v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2a1 1 0 0 1 1-1z" />
        <path d="M6 12V5a2 2 0 0 1 2-2h1" />
      </svg>
    ),
  },
];

export default function DownloadsPage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        {/* Header */}
        <div className="mx-auto max-w-[1200px] px-6 pt-11">
          <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl lg:text-[46px] lg:leading-[52px]">
            <span className="font-light text-ink/70">Downloads</span>
          </h1>
          <p className="mt-3 max-w-[600px] text-[14.5px] font-medium text-ink-700">
            Price lists, brand catalogues and the app. Every price document is dated and carries the window it is valid for — a list with no date is worthless to a contractor pricing a job.
          </p>
        </div>

        {/* The App Card */}
        <div className="mx-auto max-w-[1200px] px-6 pt-10">
          <div className="flex flex-col lg:flex-row items-center gap-10 rounded-[32px] border border-line bg-paper p-8 sm:p-10 shadow-card">
            <div className="flex-1">
              <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
                The Vertical Express app
              </h2>
              <p className="mt-3 max-w-[520px] text-[14.5px] leading-[22px] font-medium text-ink-700">
                Reorder a saved list in two taps, track both shipments from the site, and scan a batch code at the gate without opening a browser.
              </p>
              <div className="mt-5.5 flex flex-wrap items-center gap-3">
                <Link
                  href="/contact"
                  className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[13.5px] font-bold text-white shadow-card hover:bg-ink/90 transition-colors"
                >
                  Notify me at launch
                </Link>
                <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-chip-soft px-4 text-[13px] font-semibold text-ink-500 opacity-60">
                  App Store
                </span>
                <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-chip-soft px-4 text-[13px] font-semibold text-ink-500 opacity-60">
                  Google Play
                </span>
              </div>
              <p className="mt-3.5 text-[12.5px] font-medium text-ink-500">
                The app is not published yet. These buttons stay inactive until there is a build behind them — a dead store link costs more trust than a missing one.
              </p>
            </div>

            <div className="relative flex size-[120px] sm:size-[160px] shrink-0 items-center justify-center rounded-[28px] bg-elec-soft text-ink shadow-card">
              <Smartphone className="size-16 stroke-[1.3]" />
            </div>
          </div>
        </div>

        {/* Trade Price Lists */}
        <div className="mx-auto max-w-[1200px] px-6 pt-16">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
                Trade price lists
              </h2>
              <p className="mt-1.5 text-[13.5px] font-medium text-ink-500">
                Updated monthly. Prices are ex-warehouse Srinagar and include GST.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex h-9 items-center rounded-full bg-paper px-4 text-[12.5px] font-bold text-ink shadow-card hover:bg-hush transition-colors"
            >
              Email me each update
            </Link>
          </div>

          <div className="rounded-[28px] border border-line bg-paper px-7 py-2 shadow-card">
            {TRADE_LISTS.map((item, idx) => (
              <div key={item.title}>
                <div className="flex items-center gap-4 py-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-chip-soft text-ink-500">
                    <FileText className="size-5.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[14.5px] font-bold text-ink">{item.title}</p>
                    <p className="mt-0.5 text-[12px] font-medium text-ink-500">{item.meta}</p>
                  </div>
                  <span className="text-[13px] font-medium text-ink-500 hidden sm:inline">{item.size}</span>
                  {/*
                    Inert, and deliberately so. No PDF exists — this control
                    used to link to /downloads, so clicking "Download" reloaded
                    the page a contractor was already on.

                    The artboard states the rule for the store buttons on this
                    same screen: "a dead store link costs more trust than a
                    missing one." A price list is the stronger case — somebody
                    is pricing a job against it.
                  */}
                  <span
                    aria-disabled="true"
                    className="inline-flex h-8.5 cursor-not-allowed items-center rounded-full bg-chip-soft px-3.5 text-[12px] font-semibold text-ink-500 opacity-60"
                  >
                    Not published
                  </span>
                </div>
                {idx < TRADE_LISTS.length - 1 && <div className="h-px bg-line" />}
              </div>
            ))}
            <p className="py-4 text-[12.5px] font-medium text-ink-500 border-t border-line">
              All figures are stand-ins pending supplier confirmation. Do not quote from these.
            </p>
          </div>
        </div>

        {/* Brand Catalogues */}
        <div className="mx-auto max-w-[1200px] px-6 pt-16 pb-16">
          <div className="mb-5">
            <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
              Brand catalogues
            </h2>
            <p className="mt-1.5 text-[13.5px] font-medium text-ink-500">
              Manufacturer literature, hosted as supplied. Specifications are theirs, not ours.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BRAND_CATALOGUES.map((b) => (
              <div
                key={b.title}
                className="flex flex-col justify-between rounded-[26px] border border-line bg-paper p-5.5 shadow-card"
              >
                <div>
                  <div
                    className="flex size-13 items-center justify-center rounded-[18px] text-ink-700"
                    style={{ backgroundColor: b.themeColor }}
                  >
                    {b.iconSvg}
                  </div>
                  <h3 className="mt-4 text-[15px] font-bold text-ink">{b.title}</h3>
                  <p className="mt-1 text-[12px] font-medium text-ink-500">{b.meta}</p>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[13px] font-bold text-ink hover:text-brand-deep cursor-pointer">
                  <Download className="size-4 text-ink-500" />
                  <span>Download PDF</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Strips */}
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}
