import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner, SERVICES_SITE_URL } from "@/components/sections/services-banner";
import { Footer } from "@/components/sections/footer";

export const metadata: Metadata = {
  title: "Services",
  description: "Architects, contractors, electricians, plumbers and carpenters working in Srinagar — plus turnkey home construction managed end to end.",
};

const PROFESSIONS = [
  {
    name: "Architect",
    desc: "Drawings, approvals and site supervision for a new build or a major renovation.",
    themeColor: "var(--t-civil)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
  },
  {
    name: "Contractor",
    desc: "Civil work — foundation, slab, masonry, plaster — with material supply from us if you want it.",
    themeColor: "var(--t-civil)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
      </svg>
    ),
  },
  {
    name: "Electrician",
    desc: "Wiring, distribution boards, fittings and testing. Small jobs and full-house work.",
    themeColor: "var(--t-elec)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
    ),
  },
  {
    name: "Plumber",
    desc: "CPVC lines, tanks, sanitary fitting and leak work.",
    themeColor: "var(--t-plumb)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M4 6h16v12H4z" />
        <path d="M8 6v12" />
        <path d="M16 6v12" />
      </svg>
    ),
  },
  {
    name: "Carpenter",
    desc: "Wardrobes, kitchens, doors and site carpentry in ply, MDF or HDHMR.",
    themeColor: "var(--t-furn)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M12 3v18" />
      </svg>
    ),
  },
  {
    name: "Painter",
    desc: "Interior and exterior, putty to finish coat, with the paint supplied at our price.",
    themeColor: "var(--t-furn)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
        <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    name: "Waterproofing",
    desc: "Roof, bathroom and basement treatment with a written scope.",
    themeColor: "var(--t-civil)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    ),
  },
  {
    name: "Turnkey home",
    desc: "One contract from drawing to handover, with a single point of contact.",
    themeColor: "var(--t-plumb)",
    iconSvg: (
      <svg className="size-8 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
];

/**
 * Services is a separate business at verticalconstruction.in — the owner's
 * decision, already stated on the terms page. This route exists to point people
 * at it. Four claims on it described a process running on *this* system:
 *
 *   "Every professional is verified before they appear here — licence, past
 *   sites, and a reference we actually called." No professional appears here at
 *   all: `professionals` is empty, `isVerified` defaults to false, and the table
 *   carries no licence, site-history or reference column to hold any of it. The
 *   footnote at the foot of this same page said the verification standard was
 *   still being confirmed.
 *
 *   "we match you to someone who has done the work before" and "up to three
 *   verified professionals with their availability and a written scope."
 *   Nothing here produces a match, an availability calendar or a scope
 *   document, and "three" was a number nobody set.
 *
 *   "track the work from the same account you order material on." The false one
 *   that costs a customer something: the booking is taken on another site with
 *   another database, so /account/bookings can never show it. Every write path
 *   into `bookings` — submitBooking, BookingModal, ServiceCard — is unreachable
 *   from any route.
 *
 * What remains describes where the work is arranged rather than claiming this
 * system arranges it. The trade descriptions are the owner's and are untouched.
 */
export default function ServicesPage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        {/* Services Hero */}
        <div className="mx-auto max-w-[1200px] px-6 pt-8">
          <div className="flex flex-col lg:flex-row items-center gap-11 rounded-[36px] bg-furn-soft p-8 sm:p-12">
            <div className="flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
                Services
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl lg:text-[46px] lg:leading-[52px]">
                <span className="font-light text-ink/70">The people,</span>
                <br />
                not just the material.
              </h1>
              <p className="mt-3.5 max-w-[600px] text-[14.5px] leading-[22px] font-medium text-ink-700">
                Architects, contractors, electricians, plumbers and carpenters working in Srinagar — plus turnkey home construction managed end to end. Consultations, quotes and scheduling are handled on our services site.
              </p>
              <div className="mt-5.5 flex flex-wrap gap-3">
                <a
                  href={SERVICES_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-7 text-[14px] font-bold text-white shadow-card hover:bg-ink/90 transition-colors"
                >
                  Book a consultation
                </a>
                <a
                  href={SERVICES_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-paper px-6 text-[14px] font-bold text-ink shadow-card hover:bg-hush transition-colors"
                >
                  <span>Full services site</span>
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </div>

            <div className="flex size-28 sm:size-32 items-center justify-center text-ink-700">
              <svg className="size-24 stroke-[1.2] fill-none stroke-current" viewBox="0 0 24 24">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
              </svg>
            </div>
          </div>
        </div>

        {/* What you can book */}
        <div className="mx-auto max-w-[1200px] px-6 pt-16">
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
              What you can book
            </h2>
            <p className="mt-1.5 text-[13.5px] font-medium text-ink-500">
              The trades our services side covers. Nothing on this page is priced or booked here — rates and scope are agreed on the services site.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROFESSIONS.map((p) => (
              <div
                key={p.name}
                className="flex flex-col justify-between rounded-[26px] border border-line bg-paper p-5.5 shadow-card"
              >
                <div>
                  <div
                    className="flex size-14 items-center justify-center rounded-[19px] text-ink-700"
                    style={{ backgroundColor: p.themeColor }}
                  >
                    {p.iconSvg}
                  </div>
                  <h3 className="mt-4 text-[16px] font-bold text-ink">{p.name}</h3>
                  <p className="mt-1.5 text-[13px] leading-[19px] font-medium text-ink-700">{p.desc}</p>
                </div>
                <div className="mt-4 text-[13.5px] font-bold text-ink">
                  Rates on request
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How a booking works */}
        <div className="mx-auto max-w-[1200px] px-6 pt-16 pb-16">
          <div className="rounded-[32px] border border-line bg-paper p-8 sm:p-10 shadow-card">
            <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
              Where a booking happens
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div>
                <span className="flex size-7.5 items-center justify-center rounded-full bg-ink text-[13.5px] font-extrabold text-white">
                  1
                </span>
                <h3 className="mt-3.5 text-[15.5px] font-bold text-ink">Tell us the job</h3>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink-700">
                  Room, scope, rough timeline and your site, on the services site.
                </p>
              </div>

              <div>
                <span className="flex size-7.5 items-center justify-center rounded-full bg-ink text-[13.5px] font-extrabold text-white">
                  2
                </span>
                <h3 className="mt-3.5 text-[15.5px] font-bold text-ink">They match and quote</h3>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink-700">
                  Matching, quoting and the standard a professional is checked against are run by the services side, not from here.
                </p>
              </div>

              <div>
                <span className="flex size-7.5 items-center justify-center rounded-full bg-ink text-[13.5px] font-extrabold text-white">
                  3
                </span>
                <h3 className="mt-3.5 text-[15.5px] font-bold text-ink">Kept separate from your orders</h3>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink-700">
                  A service booking is not linked to this account and will not appear beside your material orders. The two run separately.
                </p>
              </div>
            </div>

            <p className="mt-7 border-t border-line pt-4 text-[12.5px] font-medium text-ink-500">
              Service rates, cancellation terms and the professional verification standard are still being confirmed. Nothing here is a quote.
            </p>
          </div>
        </div>

        {/* Bottom Strips */}
        <ServicesBanner />
      </main>
      <Footer />
    </>
  );
}
