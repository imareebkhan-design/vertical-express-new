import Link from "next/link";
import { FileText, Smartphone } from "lucide-react";

export function DownloadsStrip() {
  return (
    <section aria-labelledby="downloads-heading" className="pt-5 pb-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 id="downloads-heading" className="sr-only">
          Downloads
        </h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Card 1: Get the app */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5.5 rounded-[26px] bg-paper p-6.5 shadow-card border border-line">
            <div className="flex size-[78px] shrink-0 items-center justify-center rounded-[22px] bg-elec-soft text-ink">
              <Smartphone className="size-10 stroke-[1.4]" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[18px] font-bold text-ink">Get the app</h3>
              <p className="mt-1 text-[13.5px] font-medium text-ink-700">
                Order materials and follow each shipment from your phone.
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/downloads"
                  className="inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-[12px] font-bold text-white shadow-card hover:bg-ink/90 transition-colors"
                >
                  About the app
                </Link>
                <span className="inline-flex h-8 items-center rounded-full bg-chip-soft px-3 text-[12px] font-semibold text-ink-500 opacity-60">
                  App Store
                </span>
                <span className="inline-flex h-8 items-center rounded-full bg-chip-soft px-3 text-[12px] font-semibold text-ink-500 opacity-60">
                  Google Play
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Price lists & catalogues */}
          <div className="rounded-[26px] bg-paper p-6.5 shadow-card border border-line">
            {/*
              These three rows used to carry a Download icon, a validity window
              ("valid 1–30 Sep 2026") and an edition year — and no link, no
              file, and no PDF anywhere in public/. They looked downloadable,
              did nothing when clicked, and dated themselves.

              /downloads had already solved this: every control there is an
              inert "Not published" with a note that the figures are stand-ins.
              The entry point on the home page had not been given the same
              treatment, so the honest page sat behind a strip that implied the
              documents existed. A contractor prices a job off a trade price
              list; a fabricated validity window on one is the worst version of
              this mistake.

              Brand names stay — the owner has confirmed the brand agreements
              are signed and the names may be used. What was wrong here was
              never the names; it was offering a document that does not exist.
            */}
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-ink">Price lists &amp; catalogues</h3>
              <Link href="/downloads" className="text-[12px] font-bold text-ink hover:underline">
                All downloads
              </Link>
            </div>

            <div className="mt-3 flex flex-col">
              {/* Row 1 */}
              <div className="flex items-center gap-3 py-2.5">
                <FileText className="size-4.5 text-ink-500 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink">
                    Cement &amp; civil — trade price list
                  </p>
                </div>
                <span
                  aria-disabled="true"
                  className="inline-flex h-7 shrink-0 cursor-not-allowed items-center rounded-full bg-chip-soft px-2.5 text-[11px] font-semibold text-ink-500 opacity-60"
                >
                  Not published
                </span>
              </div>

              <div className="h-px bg-line" />

              {/* Row 2 */}
              <div className="flex items-center gap-3 py-2.5">
                <FileText className="size-4.5 text-ink-500 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink">
                    Electrical — Havells &amp; Finolex catalogue
                  </p>
                </div>
                <span
                  aria-disabled="true"
                  className="inline-flex h-7 shrink-0 cursor-not-allowed items-center rounded-full bg-chip-soft px-2.5 text-[11px] font-semibold text-ink-500 opacity-60"
                >
                  Not published
                </span>
              </div>

              <div className="h-px bg-line" />

              {/* Row 3 */}
              <div className="flex items-center gap-3 py-2.5">
                <FileText className="size-4.5 text-ink-500 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink">
                    Sanitary &amp; bath — Jaquar, Hindware
                  </p>
                </div>
                <span
                  aria-disabled="true"
                  className="inline-flex h-7 shrink-0 cursor-not-allowed items-center rounded-full bg-chip-soft px-2.5 text-[11px] font-semibold text-ink-500 opacity-60"
                >
                  Not published
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

