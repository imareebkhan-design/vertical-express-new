import Link from "next/link";
import { Download, FileText, Smartphone } from "lucide-react";

/**
 * Downloads strip. Sits between the services banner and the footer.
 *
 * TWO DELIBERATE RESTRAINTS
 *
 * 1. The app store buttons are inert. Capacitor is scaffolded, not built and not
 *    published, so there is nothing behind a store link. A dead store link costs
 *    more trust than a missing one — the live action is a notify-me.
 *
 * 2. Every price document carries the window it is valid for. A price list with
 *    no date is worthless to a contractor pricing a job, and dangerous to us.
 *    The documents themselves do not exist yet, so the links point at the
 *    downloads page rather than fabricating PDFs.
 */

const PRICE_LISTS = [
  { title: "Cement, plaster and civil", meta: "23 products" },
  { title: "Electrical — wire, MCB, switches", meta: "270 products" },
  { title: "Plumbing, sanitary and bath", meta: "250 products" },
];

export function DownloadsStrip() {
  return (
    <section aria-labelledby="downloads-heading" className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
      <h2 id="downloads-heading" className="sr-only">
        Downloads
      </h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* App */}
        <div className="flex items-center gap-6 rounded-[1.75rem] bg-white p-7 shadow-card">
          <div className="grid size-20 flex-none place-items-center rounded-[1.375rem] bg-tint-electrical">
            <Smartphone className="size-9 text-ink-700" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold tracking-tight">Get the app</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-ink-500">
              Reorder a saved list in two taps, and track your delivery from the site.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link
                href="/contact"
                className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-xs font-bold text-white transition-colors hover:bg-ink/90"
              >
                Notify me at launch
              </Link>
              <span className="text-[11px] font-semibold text-ink-500">
                Not published yet
              </span>
            </div>
          </div>
        </div>

        {/* Price lists */}
        <div className="rounded-[1.75rem] bg-white p-7 shadow-card">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg font-extrabold tracking-tight">Price lists &amp; catalogues</h3>
            <Link href="/downloads" className="text-xs font-bold hover:underline">
              All downloads
            </Link>
          </div>
          <ul className="mt-3">
            {PRICE_LISTS.map((d, i) => (
              <li
                key={d.title}
                className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <FileText className="size-4 flex-none text-ink-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{d.title}</p>
                  <p className="text-[11px] font-semibold text-ink-500">{d.meta}</p>
                </div>
                <Download className="size-4 flex-none text-ink-500" aria-hidden />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
