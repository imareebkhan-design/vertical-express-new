import { ArrowUpRight } from "lucide-react";

export const SERVICES_SITE_URL = "https://verticalconstruction.in";

/** One line about the services site, and the way there. */
export function ServicesBanner() {
  return (
    <section aria-labelledby="services-banner-heading" className="ve-reveal pt-14">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col gap-5 rounded-[28px] bg-amber-soft px-8 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            <h2 id="services-banner-heading" className="text-[22px] font-extrabold tracking-[-0.025em] text-ink sm:text-[26px]">
              Need a contractor, electrician or architect?
            </h2>
            <p className="mt-1.5 text-[14px] font-medium text-ink-700">Architects, contractors and tradespeople, booked on Vertical Construction.</p>
          </div>
          <a
            href={SERVICES_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 flex-none items-center justify-center gap-1.5 self-start rounded-full bg-ink px-7 text-[14px] font-bold text-white no-underline transition-colors hover:bg-ink/90 sm:self-auto"
          >
            Book a professional
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
