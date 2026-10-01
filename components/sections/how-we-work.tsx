import Link from "next/link";
import { ShieldCheck, Truck, Wallet } from "lucide-react";

/**
 * Three promises, each rewritten to what the shop can currently do.
 *
 * All three stated things no code or table backs, in the present tense:
 *
 *   Batch verification — "photographed at dispatch with its batch number
 *   readable... checked against the manufacturer's record... you can scan the
 *   same code". There is no Batch model, no photograph at dispatch and no
 *   scanning. The product page already marks this as pending; this page
 *   asserted it as fact.
 *
 *   "Small items come in about an hour. Heavy material comes on a slot you
 *   choose." The express window is unverified and unset, and slot selection
 *   does not exist in any form (ISS-057) — the same two claims already removed
 *   from the hero.
 *
 *   "Pay at the gate if you prefer." Cash on delivery is switched off
 *   shop-wide; checkout refuses it. Admitting the limits are unconfirmed does
 *   not rescue offering the method itself.
 *
 * What is left is true today. The intent behind each is real and none of it is
 * abandoned — the batch trail is designed and waiting on a receiving process,
 * the times return when the owner sets them, and COD returns when there is a
 * cash operation behind it.
 */
const PILLARS = [
  {
    icon: ShieldCheck,
    title: "You will be able to check what you bought",
    body: "Cement and adhesives have a batch and a packing date, and knowing them is how you tell fresh stock from stock that has sat. Recording that at goods receipt and showing it on your order is being built — it is not running yet, and no order carries a batch code today.",
    href: "/how-we-work#genuine",
    linkLabel: "How verification will work",
  },
  {
    icon: Truck,
    title: "Two speeds, told upfront",
    body: "Small items go out from our Srinagar store. Heavy material travels by truck. A mixed order splits into two shipments and the cart says so before you pay — never after. Delivery times are not published yet.",
    href: "/how-we-work#delivery",
    linkLabel: "How delivery works",
  },
  {
    icon: Wallet,
    title: "Pay online, for now",
    body: "Cash on delivery is not switched on yet — it needs a driver float and a daily reconciliation behind it, and offering it before that exists is how money goes missing. The refund window is still being confirmed.",
    href: "/how-we-work#payment",
    linkLabel: "Payment and refunds",
  },
];

export function HowWeWork() {
  return (
    <section aria-labelledby="how-we-work-heading" className="pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-6">
          <h2
            id="how-we-work-heading"
            className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]"
          >
            <span className="font-light text-ink/70">Three things</span> we will not fudge.
          </h2>
          <p className="mt-1.5 text-[13.5px] font-medium text-ink-700">
            No star ratings, no testimonials, no badges — just what actually happens to your order.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body, href, linkLabel }) => (
            <div
              key={title}
              className="flex flex-col rounded-[28px] bg-paper p-7 shadow-card border border-line"
            >
              <div className="flex size-[60px] items-center justify-center rounded-[20px] bg-amber-soft text-ink">
                <Icon className="size-7 stroke-[1.6]" aria-hidden />
              </div>
              <h3 className="mt-[18px] text-[18px] font-bold text-ink">{title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[22px] font-medium text-ink-700">{body}</p>
              <div className="mt-auto pt-3.5">
                <Link
                  href={href}
                  className="text-[13px] font-bold text-ink underline underline-offset-[3px] hover:text-ink-700 transition-colors"
                >
                  {linkLabel}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

