import Link from "next/link";
import { ShieldCheck, Truck, Wallet } from "lucide-react";

/**
 * Replaces `testimonials.tsx` and `trust-badges.tsx`, which carried a fabricated
 * 4.9 Google rating and five invented customers (ISS-008).
 *
 * Every claim here is a process the reader can check rather than a number they
 * have to believe. Where something is not settled, it says so — the COD ceiling
 * and the return window are still unconfirmed, so they are described as pending
 * rather than given a value.
 */

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Genuine, and you can check",
    body: "Every bag, coil and box is checked against the manufacturer's record before it leaves the warehouse, and the batch number goes on your order.",
    href: "/how-we-work#genuine",
    linkLabel: "How verification works",
  },
  {
    icon: Truck,
    title: "Two speeds, told upfront",
    body: "Small items come from our Srinagar store. Cement, tiles and tanks travel by truck. Each product tells you which it is — never a single promise in a banner.",
    href: "/how-we-work#delivery",
    linkLabel: "How delivery works",
  },
  {
    icon: Wallet,
    title: "Pay at the gate if you prefer",
    body: "Cash or UPI to the driver, or online before dispatch. No card is kept on file. COD limits and the refund window are being confirmed and will be shown at checkout.",
    href: "/how-we-work#payment",
    linkLabel: "Payment and refunds",
  },
];

export function HowWeWork() {
  return (
    <section aria-labelledby="how-we-work-heading" className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <div className="mb-6">
        <h2
          id="how-we-work-heading"
          className="text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          <span className="font-light text-ink-500">Three things</span> we will not fudge.
        </h2>
        <p className="mt-2 text-sm font-medium text-ink-500">
          No star ratings, no testimonials, no badges — just what happens to your order.
        </p>
      </div>

      <ul className="grid gap-5 md:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, body, href, linkLabel }) => (
          <li key={title} className="rounded-[1.75rem] bg-white p-7 shadow-card">
            <span className="grid size-14 place-items-center rounded-[1.25rem] bg-amber-soft">
              <Icon className="size-7 text-ink" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-extrabold tracking-tight">{title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed font-medium text-ink-700">{body}</p>
            <Link
              href={href}
              className="mt-3 inline-block text-[13px] font-bold underline underline-offset-4"
            >
              {linkLabel}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
