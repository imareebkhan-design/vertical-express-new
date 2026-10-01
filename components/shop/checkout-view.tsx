"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, Check, CreditCard, Loader2, MapPin, Plus } from "lucide-react";
import type * as CheckoutActionsModule from "@/actions/checkout";
import { useCart } from "@/components/shop/cart-provider";
import { formatPaise } from "@/lib/money";
import { deliveryFeeLabel } from "@/lib/checkout-display";
import { CheckoutSummaryLines } from "@/components/shop/checkout/summary-lines";
import { groupCartByShipment } from "@/lib/cart-shipments";
import { checkoutQuote } from "@/lib/order-display";
import { SpeedChip } from "@/components/ui/speed-chip";
import { ExpressChoice } from "@/components/shop/checkout/express-choice";
import { ShipmentReview } from "@/components/shop/checkout/shipment-review";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddressFormValues } from "@/components/account/address-form";
import { CodSplitNotice } from "@/components/shop/cod-split-notice";
import { CartLoading } from "@/components/shop/cart-loading";
import { CouponRevisedNotice } from "@/components/shop/checkout/coupon-revised-notice";
import { couponRevisionFromPlaceError, couponRevisionFromQuote, type CouponRevision } from "@/lib/coupon-refusal";
import { isTotalChangedError } from "@/lib/checkout-errors";
import { useCheckoutQuote, QUOTE_NOT_CURRENT, cartKeyOf } from "@/components/shop/checkout/use-checkout-quote";

type Address = AddressFormValues & { id: string };
type PayMethod = "online" | "cod";

/** The server actions this view calls — passed in, so the view can be tested without a server (see `test-support/ui-setup.ts`). */
export type CheckoutActions = Pick<
  typeof CheckoutActionsModule,
  "getCheckoutTotals" | "placeOrder" | "confirmRazorpayPayment" | "validateCoupon"
>;

export function CheckoutView({ addresses, email, actions }: { addresses: Address[]; email: string | null; actions: CheckoutActions }) {
  const { getCheckoutTotals, placeOrder, confirmRazorpayPayment, validateCoupon } = actions;
  /* Only asked for when the account has none. A phone sign-in carries no
     email, which is the market's default, and without one the order
     confirmation has nowhere to go. */
  const [contactEmail, setContactEmail] = useState("");
  const router = useRouter();
  const { summary, loaded, refresh } = useCart();
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  // Prototype: Pay-on-delivery is the default/primary method until a live
  // payment gateway is wired. Online pay stays available via the test gateway.
  const [method, setMethod] = useState<PayMethod>("cod");
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  /* E8: bumped when placement is refused because the cart moved, so the quote
     is asked again even if the lines on screen look the same. */
  const [requote, setRequote] = useState(0);
  const [wantsExpress, setWantsExpress] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; success: boolean } | null>(null);
  /* E6: a coupon that stopped qualifying — shown until the customer acts again. */
  const [couponRevision, setCouponRevision] = useState<CouponRevision | null>(null);
  const shownTotalRef = useRef<number | null>(null);
  // Stable idempotency key for this checkout attempt — the same key is reused on
  // retry so a duplicate submit returns the same order instead of a new one.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const selected = addresses.find((a) => a.id === addressId);

  /* ISS-081: `totals` answers exactly the address, coupon and delivery choice
     on screen, or is null — the moment any of them changes, until the server
     answers the new ones. "Place order" needs `canSubmit`. */
  const {
    quote: totals,
    status: quoteStatus,
    failure: quoteFailure,
    canSubmit,
  } = useCheckoutQuote(
    {
      addressId: addressId || null,
      pincode: selected?.pincode ?? null,
      couponCode: appliedCoupon,
      wantsExpress,
      cartKey: `${cartKeyOf(summary.lines)}#${requote}`,
    },
    getCheckoutTotals,
    (fresh, answered) => {
      /* The total is current again: a "being updated" notice no longer applies. */
      setError((e) => (e === QUOTE_NOT_CURRENT ? null : e));
      /* The server re-checked the applied coupon and it no longer qualifies
         (e.g. the basket changed): these totals are without it. Say so and stop
         sending it, rather than keep showing "applied". */
      const revised = couponRevisionFromQuote(fresh, answered.couponCode, shownTotalRef.current);
      if (revised) {
        setCouponRevision(revised);
        setAppliedCoupon(null);
        setCouponMsg(null);
      }
      /* COD is the default, but when the server refuses it here the only
         method that can place the order is online — leaving COD selected made
         "Place order" a dead end. */
      if (!fresh.codAllowed) setMethod((m) => (m === "cod" ? "online" : m));
    }
  );

  useEffect(() => {
    if (totals) shownTotalRef.current = totals.totalPaise;
  }, [totals]);

  if (!loaded) return <CartLoading />;
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
    setCouponRevision(null);
    if (!addressId) {
      setError("Please select a delivery address");
      return;
    }
    /* The button is disabled then too; this holds even if it is pressed anyway. */
    if (!canSubmit) {
      setError(QUOTE_NOT_CURRENT);
      return;
    }
    if (method === "cod" && totals && !totals.codAllowed) {
      setError("Pay on delivery isn't available right now");
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
        /* E8: checked, never charged — refused if the cart moved since this quote. */
        expectedTotalPaise: totals?.totalPaise,
      });
      if (!res.ok) {
        /* E6: the coupon no longer qualifies. Nothing was placed or charged.
           Drop it, re-quote from the server, show old vs new total, and wait
           for the customer to press "Place order" again. */
        const revision = couponRevisionFromPlaceError(res.error, totals?.totalPaise ?? null);
        if (revision && appliedCoupon) {
          /* Dropping the coupon changes the quote's inputs, so the total on
             screen stops being current at once and is re-quoted. */
          setCouponRevision(revision);
          setAppliedCoupon(null);
          setCouponCode("");
          setCouponMsg(null);
          return;
        }
        /* E8: the cart changed elsewhere (another tab, a sign-in merge, stock)
           since this total. Nothing was placed. Re-read the cart and re-quote;
           the button stays off until the new total is back. */
        if (isTotalChangedError(res.error)) {
          setError(res.error.message);
          setRequote((n) => n + 1);
          await refresh();
          return;
        }
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
    setCouponRevision(null);
    const res = await validateCoupon(couponCode.trim(), selected.pincode);
    if (!res.ok) {
      setCouponMsg({ text: res.error.message, success: false });
      return;
    }
    /* Only validated here: the total comes from the quote for the new inputs
       (which also carries the delivery choice — this answer does not). */
    setAppliedCoupon(couponCode.trim().toUpperCase());
    setCouponMsg({ text: `Coupon ${couponCode.trim().toUpperCase()} applied!`, success: true });
  };

  /* Re-quoted by the quote hook, with the delivery choice; a separate request
     here asked without it and could land after the right answer. */
  const removeCouponHandler = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponMsg(null);
  };

  /* The same split the cart shows and checkout persists — one rule, in
     lib/shipment-plan.ts. */
  /* Without express, and as the current quote places the express run (E7) — the
     split placement will persist. */
  const standardShipments = groupCartByShipment(summary.lines);
  const shipments = groupCartByShipment(summary.lines, totals?.expressChosen ? totals.express.eligibleVariantIds : []);
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
          {/* The pincode quote describes the quick run only; a truck shipment
              has no time to state (checkoutQuote, lib/order-display). */}
          {totals && totals.serviceable && checkoutQuote(totals.etaMinutes, shipments) && (
            <p className="mt-3 text-sm font-bold text-success">{checkoutQuote(totals.etaMinutes, shipments)}</p>
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
            <ExpressChoice
              express={totals.express}
              wantsExpress={wantsExpress}
              onChange={setWantsExpress}
              lineCount={summary.lines.length}
              standardShipments={standardShipments.length}
            />
          </Section>
        )}

        {/* Step 3 — how the basket travels. Titled "Slot for each shipment" on
            the artboard; there is no slot to pick (no Slot model). */}
        <Section step={3} title="Your shipments">
          <ShipmentReview shipments={shipments} />
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
                  ? "Not available right now"
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
                  aria-label="Coupon code"
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
            {totals ? (
              /* Every figure from the server's totals; shared with the phone
                 checkout so the two cannot disagree (summary-lines.tsx). */
              <CheckoutSummaryLines totals={totals} variant="desktop" />
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd>{formatPaise(summary.subtotalPaise)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Delivery</dt>
                  <dd>{deliveryFeeLabel(totals)}</dd>
                </div>
              </>
            )}
          </dl>
          <div className="mt-4 flex justify-between border-t border-hairline-border pt-4 text-base font-extrabold">
            <span>Total</span>
            {/* No current quote, no total: the items subtotal, or the total for
                a site no longer selected, is not what anyone would be charged. */}
            <span>{totals ? formatPaise(totals.totalPaise) : quoteStatus === "failed" ? "—" : "Updating…"}</span>
          </div>
          {quoteFailure && (
            <p role="alert" className="mt-2 text-sm font-bold text-danger">
              {quoteFailure}
            </p>
          )}
          {couponRevision && (
            <div className="mt-4">
              <CouponRevisedNotice
                revision={couponRevision}
                currentTotalPaise={totals?.totalPaise ?? null}
                variant="desktop"
              />
            </div>
          )}
          {/* Beside the button that produced it, and announced: a refusal such
              as "your total changed" used to appear under the payment card,
              out of sight of the button and silent to a screen reader. */}
          {error && (
            <p role="alert" className="mt-4 text-sm font-bold text-danger">
              {error}
            </p>
          )}
          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={submit}
            disabled={placing || !canSubmit}
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
