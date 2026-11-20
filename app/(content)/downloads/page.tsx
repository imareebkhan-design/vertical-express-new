import type { Metadata } from "next";
import { Download, FileText, Smartphone } from "lucide-react";
import { Navbar } from "@/components/sections/navbar";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";

export const metadata: Metadata = {
  title: "Downloads",
  description: "Price lists, brand catalogues and the app. None of them is published yet.",
};

const TRADE_LISTS = [
  {
    title: "Cement, plaster and civil",
    meta: "PDF · not published yet",
  },
  {
    title: "Tiling, adhesives and grout",
    meta: "PDF · not published yet",
  },
  {
    title: "Electrical — wire, MCB, switches, lighting",
    meta: "PDF · not published yet",
  },
  {
    title: "Plumbing, sanitary and bath",
    meta: "PDF · not published yet",
  },
];

/*
 * No file store is configured (the listing form's own note says the same:
 * "no file store configured"), so none of these PDFs exist yet either — same
 * as `TRADE_LISTS` above. A precise "4.2 MB" / "2026 edition" for a document
 * that does not exist is invented information wearing the shape of real
 * metadata, exactly what this codebase's placeholder register exists to
 * prevent. Size and edition are dropped; the card states plainly that the
 * document is not published, same treatment as the price lists.
 */
const BRAND_CATALOGUES = [
  {
    title: "UltraTech cement range",
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
            Price lists, brand catalogues and the app. None of them is published yet — current prices are on each product page.
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
                Order materials and follow each shipment from your phone.
              </p>
              <div className="mt-5.5 flex flex-wrap items-center gap-3">
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
                Not published yet. Current prices are on each product page.
              </p>
            </div>
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
                </div>
                {/* Inert, same treatment and the same reason as `TRADE_LISTS`
                    above: no file store is configured, so no PDF exists for
                    any of these — a styled-clickable div with no href or
                    handler is exactly the "control that goes nowhere" this
                    codebase's own principles warn against. */}
                <span
                  aria-disabled="true"
                  className="mt-4 inline-flex h-8.5 w-fit cursor-not-allowed items-center gap-2 rounded-full bg-chip-soft px-3.5 text-[12px] font-semibold text-ink-500 opacity-60"
                >
                  <Download className="size-3.5" />
                  Not published
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Strips */}
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}
