"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, Check, CreditCard, Loader2, MapPin, Plus } from "lucide-react";
import { getCheckoutTotals, placeOrder, confirmRazorpayPayment, validateCoupon } from "@/actions/checkout";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";
import { planShipments } from "@/lib/shipment-plan";
import { SpeedChip } from "@/components/ui/speed-chip";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CheckoutTotals } from "@/lib/services/checkout";
import type { AddressFormValues } from "@/components/account/address-form";
import { CodSplitNotice } from "@/components/shop/cod-split-notice";

type Address = AddressFormValues & { id: string };
type PayMethod = "online" | "cod";

export function CheckoutView({ addresses, email }: { addresses: Address[]; email: string | null }) {
  /* Only asked for when the account has none. A phone sign-in carries no
     email, which is the market's default, and without one the order
     confirmation has nowhere to go. */
  const [contactEmail, setContactEmail] = useState("");
  const router = useRouter();
  const { summary, refresh } = useCart();
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  // Prototype: Pay-on-delivery is the default/primary method until a live
  // payment gateway is wired. Online pay stays available via the test gateway.
  const [method, setMethod] = useState<PayMethod>("cod");
  const [totals, setTotals] = useState<CheckoutTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  const [wantsExpress, setWantsExpress] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; success: boolean } | null>(null);
  // Stable idempotency key for this checkout attempt — the same key is reused on
  // retry so a duplicate submit returns the same order instead of a new one.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const selected = addresses.find((a) => a.id === addressId);

  // Recompute delivery fee / serviceability whenever the address changes.
  useEffect(() => {
    if (!selected) return;
    let active = true;
    getCheckoutTotals(selected.pincode, appliedCoupon ?? undefined, wantsExpress).then((res) => {
      if (active && res.ok) setTotals(res.data);
    });
    return () => {
      active = false;
    };
    /* Re-priced whenever the delivery choice changes, because the express fee
       is part of what is owed. The server decides whether express is actually
       on offer — this only asks. */
  }, [selected, wantsExpress, appliedCoupon]);

  if (summary.lines.length === 0) {
    return (
      <div className="rounded-card border border-hairline-border bg-white p-8 text-center shadow-card">
        <p className="text-sm font-bold text-neutral-500">Your cart is empty.</p>
        <Link href="/categories" className="mt-4 inline-block">
          <Button>Browse products</Button>
        </Link>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    if (!addressId) {
      setError("Please select a delivery address");
      return;
    }
    if (method === "cod" && totals && !totals.codAllowed) {
      setError("Pay on delivery isn't available for this pincode");
      return;
    }
    startPlacing(async () => {
      const res = await placeOrder({
        addressId,
        paymentMethod: method,
        idempotencyKey: idempotencyKey.current,
        // Send the code, not the discount. The server re-resolves the coupon and
        // recomputes the total; a client-supplied figure is never trusted.
        couponCode: appliedCoupon,
        // Same treatment as the coupon: send the choice, not the price. The
        // server re-resolves whether express is on offer and charges
        // accordingly, so the total placed matches the total shown.
        wantsExpress,
        contactEmail: email ? null : contactEmail.trim() || null,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      // Online gateway active → open Razorpay Checkout; otherwise straight to
      // confirmation (dummy/COD). Inert unless real Razorpay keys are configured.
      if (res.data.razorpay?.orderId && res.data.razorpay.keyId) {
        await openRazorpay(res.data.orderNo, res.data.razorpay);
        return;
      }
      await refresh();
      router.push(`/checkout/confirmation/${res.data.orderNo}`);
    });
  };

  const openRazorpay = async (
    orderNo: string,
    rzp: { orderId: string; amountPaise: number; keyId: string }
  ) => {
    await loadRazorpayScript();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) {
      setError("Couldn't load the payment window. Please retry.");
      return;
    }
    const rz = new Razorpay({
      key: rzp.keyId,
      amount: rzp.amountPaise,
      currency: "INR",
      name: "Vertical Express",
      order_id: rzp.orderId,
      prefill: { email: email ?? undefined },
      theme: { color: "#EDAF1C" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: async (r: any) => {
        const confirm = await confirmRazorpayPayment({
          orderNo,
          razorpayOrderId: rzp.orderId,
          razorpayPaymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
        });
        if (!confirm.ok) {
          setError(confirm.error.message);
          return;
        }
        await refresh();
        router.push(`/checkout/confirmation/${orderNo}`);
      },
      modal: {
        ondismiss: () => setError("Payment was cancelled. Your order is awaiting payment."),
      },
    });
    rz.open();
  };

  const codDisabled = totals ? !totals.codAllowed : false;

  const applyCouponHandler = async () => {
    if (!couponCode.trim() || !selected) return;
    setCouponMsg(null);
    const res = await validateCoupon(couponCode.trim(), selected.pincode);
    if (!res.ok) {
      setCouponMsg({ text: res.error.message, success: false });
      return;
    }
    setTotals(res.data);
    setAppliedCoupon(couponCode.trim().toUpperCase());
    setCouponMsg({ text: `Coupon ${couponCode.trim().toUpperCase()} applied!`, success: true });
  };

  const removeCouponHandler = async () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponMsg(null);
    if (selected) {
      const res = await getCheckoutTotals(selected.pincode);
      if (res.ok) setTotals(res.data);
    }
  };

  /* The same split the cart shows and checkout persists — one rule, in
     lib/shipment-plan.ts. */
  const byId = new Map(summary.lines.map((l) => [l.itemId, l]));
  const shipments = planShipments(
    summary.lines.map((l) => ({ ref: l.itemId, qty: l.qty, categoryIsBulk: l.categoryIsBulk }))
  ).map((sh) => {
    const lines = sh.lines.map((pl) => byId.get(pl.ref)).filter(Boolean) as typeof summary.lines;
    return {
      ...sh,
      lines,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      totalPaise: lines.reduce((n, l) => n + l.lineTotalPaise, 0),
    };
  });
  const shipmentCount = shipments.length;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* The design leads with the site, not the account — a contractor is
            buying for a place, and the address is the thing that changes. */}
        <Section step={1} title="Delivery site">
          <p className="mb-3 text-xs font-bold text-neutral-500">
            Signed in as <span className="text-ink">{email ?? "your phone number"}</span>
          </p>

          {/* Without this the order is placed and nothing ever reaches the
              customer — the confirmation email has no address to go to, and
              there is no SMS channel yet. Optional, because an order must not
              be blocked on it. */}
          {!email && (
            <div className="mb-4 rounded-card border border-hairline-border bg-surface-2 p-3.5">
              <label htmlFor="contact-email" className="block text-xs font-bold text-ink">
                Email for your receipt <span className="font-semibold text-neutral-500">(optional)</span>
              </label>
              <input
                id="contact-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-2 h-11 w-full rounded-field border border-hairline-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              />
              <p className="mt-2 text-[11px] font-medium leading-[15px] text-neutral-500">
                We do not send SMS yet. Leave this blank and your order is still placed — you
                will find it under{" "}
                <Link href="/account/orders" className="font-bold text-ink">
                  My orders
                </Link>
                .
              </p>
            </div>
          )}
          {addresses.length === 0 ? (
            <Link href="/account/addresses">
              <Button variant="outline">
                <Plus className="size-4" /> Add a delivery address
              </Button>
            </Link>
          ) : (
            <div className="space-y-3">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-card border-2 p-3 transition-all duration-200",
                    addressId === a.id ? "border-brand-deep bg-surface-soft/20" : "border-neutral-200 hover:border-brand-deep"
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                    className="mt-1 size-4 shrink-0 cursor-pointer accent-brand-deep"
                  />
                  <div className="text-sm">
                    <p className="font-extrabold capitalize">
                      {a.label} · {a.name}
                    </p>
                    <p className="font-semibold text-neutral-600">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} — {a.pincode}
                    </p>
                    <p className="font-bold text-neutral-500">{a.phone}</p>
                  </div>
                </label>
              ))}
              <Link
                href="/account/addresses"
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-deep hover:underline"
              >
                <Plus className="size-3.5" /> Add another address
              </Link>
            </div>
          )}

          {totals && !totals.serviceable && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-danger">
              <MapPin className="size-4" /> This pincode isn&apos;t serviceable yet.
            </p>
          )}
          {totals && totals.serviceable && totals.etaMinutes && (
            <p className="mt-3 text-sm font-bold text-success">
              Delivering in ~{totals.etaMinutes} min
            </p>
          )}
        </Section>

        {/* Step 2 — how fast.

            `resolveExpressOption` has been built and tested since 4b34a90 and
            nothing asked it, so no customer could choose the 60-minute run
            however eligible their basket was. This is the screen that asks.

            The rule is the owner's: express is charged; a cart mixing an
            eligible item with one that is not can go standard together at no
            extra charge; standard is the fallback. Every "why not" the service
            can return is rendered as itself rather than collapsed into a
            disabled control with no explanation. */}
        {totals && (
          <Section step={2} title="How fast">
            {totals.express.available ? (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[20px] border border-line bg-canvas p-4">
                  <input
                    type="radio"
                    name="delivery-speed"
                    checked={!wantsExpress}
                    onChange={() => setWantsExpress(false)}
                    className="mt-0.5 size-4 shrink-0 accent-ink"
                  />
                  <span>
                    <span className="block text-[13.5px] font-bold text-ink">
                      Standard · everything together
                    </span>
                    <span className="mt-0.5 block text-[12.5px] font-medium leading-[17px] text-ink-700">
                      No extra charge.
                      {totals.express.reason === "mixed_cart"
                        ? " Some of this basket cannot make the hour, so choosing standard keeps the order in one delivery."
                        : ""}
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-[20px] border border-line bg-canvas p-4">
                  <input
                    type="radio"
                    name="delivery-speed"
                    checked={wantsExpress}
                    onChange={() => setWantsExpress(true)}
                    className="mt-0.5 size-4 shrink-0 accent-ink"
                  />
                  <span>
                    <span className="block text-[13.5px] font-bold text-ink">
                      60-minute delivery ·{" "}
                      {totals.express.feePaise !== null
                        ? formatPaise(totals.express.feePaise)
                        : "—"}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] font-medium leading-[17px] text-ink-700">
                      {totals.express.reason === "mixed_cart"
                        ? `${totals.express.eligibleVariantIds.length} of ${summary.lines.length} items can go in the hour. The rest follow on the standard run.`
                        : "Everything in this basket can go in the hour."}
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-[13px] font-medium leading-[18.5px] text-ink-700">
                {totals.express.reason === "no_price"
                  ? "60-minute delivery is not being offered yet — the charge for it has not been set."
                  : totals.express.reason === "not_serviceable"
                    ? "We do not deliver to this pincode."
                    : "Nothing in this basket is set up for 60-minute delivery to this pincode. It goes on the standard run."}
              </p>
            )}
          </Section>
        )}

        {/* Step 3 — one slot per shipment. */}
        <Section step={3} title="Slot for each shipment">
          <p className="mb-4 text-[13px] font-medium leading-[18.5px] text-ink-700">
            {shipmentCount > 1
              ? "Two shipments, two arrival times. Nothing waits for the slower one."
              : "One shipment."}
          </p>

          <div className="space-y-3">
            {shipments.map((sh) => (
              <div key={sh.sequence} className="rounded-[20px] border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <SpeedChip speed={sh.speedClass} />
                  {shipmentCount > 1 && (
                    <span className="text-[13px] font-bold text-ink">
                      Shipment {sh.sequence} of {shipmentCount}
                    </span>
                  )}
                  <span className="text-[12px] font-medium text-ink-500">
                    {sh.itemCount} {sh.itemCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] font-medium leading-[17px] text-ink-500">
                  {sh.speedClass === "express"
                    ? "Small goods, out from the Srinagar store."
                    : "Heavy material, by truck."}
                </p>
              </div>
            ))}
          </div>

          {/* The artboard puts a date strip and four two-hour windows here. There
              is no Slot model and Shipment.promisedAt is null until one exists,
              so a picker would take a choice and quietly drop it. */}
          <p className="mt-3 text-[12.5px] font-medium leading-[17px] text-ink-700">
            <PlaceholderValue pending="slot booking is not built — no Slot model, and ops has not confirmed the windows">
              Choosing a delivery window is not available yet. We will call to
              arrange the truck.
            </PlaceholderValue>
          </p>
        </Section>

        {/* Step 4 — GSTIN for input credit. */}
        <Section step={4} title="Business details">
          <p className="text-[13px] font-medium leading-[18.5px] text-ink-700">
            Buying for a business? A GSTIN on the invoice lets you claim input
            credit.{" "}
            <PlaceholderValue pending="no Order.gstin field and no Invoice model — the number would be discarded">
              GST invoicing is not issued yet, so we are not collecting a GSTIN
              at checkout.
            </PlaceholderValue>
          </p>
        </Section>

        {/* Step 5 — Payment */}
        <Section step={5} title="Payment">
          <div className="space-y-3">
            <PayOption
              active={method === "cod"}
              onSelect={() => !codDisabled && setMethod("cod")}
              icon={Banknote}
              title="Cash on delivery"
              caption={
                codDisabled
                  ? "Unavailable for this pincode"
                  : shipmentCount > 1
                    ? "Pay each driver at their delivery — two payments"
                    : "Pay the driver at your gate"
              }
              disabled={codDisabled}
            />

            {/* Two shipments means two drivers and two separate cash handovers.
                Saying so here is the difference between a buyer having the right
                money at the gate and an argument on site.

                Shared with the mobile checkout. The inline version this replaced
                named an exact figure per driver, but those are goods totals —
                delivery and tax are charged on the order, not apportioned per
                shipment — so it quoted a number the customer could hold us to
                and we would miss. It also said "second driver" for any shipment
                after the first. */}
            {method === "cod" && !codDisabled && (
              <CodSplitNotice shipments={shipments} />
            )}
            <PayOption
              active={method === "online"}
              onSelect={() => setMethod("online")}
              icon={CreditCard}
              title="Pay online"
              caption="Cards, UPI, netbanking (test gateway)"
            />
          </div>
        </Section>

        {error && <p className="text-sm font-bold text-danger">{error}</p>}
      </div>

      {/* Order summary */}
      <aside className="h-fit lg:sticky lg:top-24">
        <div className="rounded-card border border-hairline-border bg-white p-5 shadow-card">
          <h2 className="text-lg font-extrabold">Order summary</h2>
          {/* Grouped the way the goods travel, so the summary and the slot step
              describe the same two deliveries. */}
          <div className="mt-4 space-y-3">
            {shipments.map((sh) => (
              <div key={sh.sequence}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <SpeedChip speed={sh.speedClass} />
                    <span className="text-[11px] font-semibold text-ink-500">
                      {sh.itemCount} {sh.itemCount === 1 ? "item" : "items"}
                    </span>
                  </span>
                  <span className="text-[13px] font-extrabold tabular-nums text-ink">
                    {formatPaise(sh.totalPaise)}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {sh.lines.map((l) => (
                    <li key={l.itemId} className="flex justify-between gap-2 text-[12px] font-semibold">
                      <span className="min-w-0 truncate text-ink-500">
                        {l.title} × {l.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Coupon Code Section */}
          <div className="mt-4 border-t border-hairline-border pt-4">
            <label className="block text-xs font-extrabold uppercase text-neutral-500 mb-1.5">
              Promo Code
            </label>
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-full border border-brand-deep/30 bg-surface-soft/40 px-3 py-2 text-xs font-extrabold">
                <span className="text-brand-deep">Code: {appliedCoupon}</span>
                <button
                  type="button"
                  onClick={removeCouponHandler}
                  className="text-neutral-500 hover:text-danger cursor-pointer ml-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. FIRST3"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="w-full rounded-full border border-line px-3 py-1.5 text-xs font-bold uppercase tracking-wider focus:border-brand-deep focus:outline-none"
                />
                <Button size="sm" type="button" onClick={applyCouponHandler} disabled={!couponCode.trim()}>
                  Apply
                </Button>
              </div>
            )}
            {couponMsg && (
              <p className={cn("mt-1.5 text-xs font-bold", couponMsg.success ? "text-success" : "text-danger")}>
                {couponMsg.text}
              </p>
            )}
          </div>

          <dl className="mt-4 space-y-2 border-t border-hairline-border pt-4 text-sm font-bold">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd>{formatPaise(summary.subtotalPaise)}</dd>
            </div>
            {totals && totals.discountPaise > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd>-{formatPaise(totals.discountPaise)}</dd>
              </div>
            )}
            {totals && totals.taxPaise > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">GST ({Math.round(totals.gst.ratePct)}%)</dt>
                <dd>{formatPaise(totals.taxPaise)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-neutral-500">Delivery</dt>
              <dd className={totals?.deliveryFeePaise === 0 ? "text-success" : ""}>
                {totals ? (totals.deliveryFeePaise === 0 ? "FREE" : formatPaise(totals.deliveryFeePaise)) : "—"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-hairline-border pt-4 text-base font-extrabold">
            <span>Total</span>
            <span>{formatPaise(totals?.totalPaise ?? summary.subtotalPaise)}</span>
          </div>
          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={submit}
            disabled={placing || !addressId || (totals ? !totals.serviceable : false)}
          >
            {placing ? <Loader2 className="animate-spin" /> : "Place order"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-hairline-border bg-white p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <span className="grid size-6 place-items-center rounded-full bg-brand-deep text-xs font-extrabold text-brand">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function PayOption({
  active,
  onSelect,
  icon: Icon,
  title,
  caption,
  disabled,
}: {
  active: boolean;
  onSelect: () => void;
  icon: typeof CreditCard;
  title: string;
  caption: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-card border-2 p-3 text-left transition-all duration-200",
        active ? "border-brand-deep bg-surface-soft/20" : "border-neutral-200 hover:border-brand-deep",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <Icon className="size-5 shrink-0 text-neutral-600" aria-hidden />
      <span className="flex-1">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="block text-xs font-semibold text-neutral-500">{caption}</span>
      </span>
      {active && <Check className="size-5 text-brand-deep" />}
    </button>
  );
}

/** Lazy-load Razorpay Checkout once. Resolves immediately if already present. */
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Razorpay) return resolve();
    const existing = document.getElementById("razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.id = "razorpay-checkout-js";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("razorpay script failed"));
    document.body.appendChild(s);
  });
}
