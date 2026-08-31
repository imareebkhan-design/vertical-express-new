import Link from "next/link";
import { ShieldCheck, Truck, Wallet } from "lucide-react";

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Genuine, and you can check",
    body: "Every bag, coil and box is photographed at dispatch with its batch number readable, and the code is checked against the manufacturer's record. You can scan the same code when it reaches your gate.",
    href: "/how-we-work#verification",
    linkLabel: "How verification works",
  },
  {
    icon: Truck,
    title: "Two speeds, told upfront",
    body: "Small items come in about an hour. Heavy material comes on a slot you choose. A mixed order splits into two shipments and the cart says so before you pay — never after.",
    href: "/how-we-work#delivery",
    linkLabel: "How delivery works",
  },
  {
    icon: Wallet,
    title: "Pay at the gate if you prefer",
    body: "Cash or UPI to the driver, per shipment. No card on file and no prepayment for heavy loads. COD limits and the refund window are still being confirmed.",
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

