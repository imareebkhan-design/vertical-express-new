import Link from "next/link";
import { ExternalLink } from "lucide-react";

const TRADES = ["Architect", "Contractor", "Electrician", "Plumber", "Turnkey build"];

export const SERVICES_SITE_URL = "https://verticalconstruction.in";

export function ServicesBanner() {
  return (
    <section aria-labelledby="services-banner-heading" className="pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col gap-8 rounded-[32px] bg-amber-soft p-9 sm:p-11 lg:flex-row lg:items-center lg:gap-11">
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
              Also from Vertical
            </p>
            <h2
              id="services-banner-heading"
              className="mt-2 text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]"
            >
              <span className="font-light text-ink/70">Need the people,</span>
              <br />
              not just the material?
            </h2>
            <p className="mt-2.5 max-w-xl text-[14.5px] leading-[22px] font-medium text-ink-700">
              Architects, contractors, electricians, plumbers, carpenters and turnkey home
              construction — booked, scheduled and managed on our services site.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {TRADES.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-paper px-3 py-1 text-[12px] font-bold text-ink shadow-card"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-none flex-col items-stretch gap-2.5">
            <a
              href={SERVICES_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-8 text-[14px] font-bold text-white shadow-card transition-colors hover:bg-ink/90"
            >
              <span>verticalconstruction.in</span>
              <ExternalLink className="size-4 text-white" aria-hidden />
            </a>
            <p className="text-center text-[11px] font-semibold text-ink-500">
              Opens our services site
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

