import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Services banner. Sits directly above the footer on every page.
 *
 * Services is a different business sharing the same database and auth. It gets a
 * proper front door without competing with Materials in the primary nav — a
 * banner, not a nav item.
 */

const TRADES = ["Architect", "Contractor", "Electrician", "Plumber", "Carpenter", "Turnkey build"];

export const SERVICES_SITE_URL = "https://verticalconstruction.in";

export function ServicesBanner() {
  return (
    <section aria-labelledby="services-banner-heading" className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <div className="flex flex-col gap-8 rounded-[2rem] bg-amber-soft p-8 sm:p-11 lg:flex-row lg:items-center lg:gap-11">
        <div className="flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
            Also from Vertical
          </p>
          <h2
            id="services-banner-heading"
            className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-[2rem]"
          >
            <span className="font-light text-ink-500">Need the people,</span>
            <br />
            not just the material?
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed font-medium text-ink-700">
            Architects, contractors, electricians, plumbers, carpenters and turnkey home
            construction — booked, scheduled and managed on our services site.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {TRADES.map((t) => (
              <li
                key={t}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-card"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-none flex-col items-stretch gap-2.5">
          <Link
            href={SERVICES_SITE_URL}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-ink px-8 text-[15px] font-bold text-white transition-colors hover:bg-ink/90"
          >
            verticalconstruction.in
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
          <p className="text-center text-[11px] font-semibold text-ink-500">
            Opens our services site
          </p>
        </div>
      </div>
    </section>
  );
}
