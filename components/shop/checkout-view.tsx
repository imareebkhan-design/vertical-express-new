"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, Check, CreditCard, Loader2, MapPin, Plus } from "lucide-react";
import { getCheckoutTotals, placeOrder, confirmRazorpayPayment } from "@/actions/checkout";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CheckoutTotals } from "@/lib/services/checkout";
import type { AddressFormValues } from "@/components/account/address-form";

type Address = AddressFormValues & { id: string };
type PayMethod = "online" | "cod";

export function CheckoutView({ addresses, email }: { addresses: Address[]; email: string | null }) {
  const router = useRouter();
  const { summary, refresh } = useCart();
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  // Prototype: Pay-on-delivery is the default/primary method until a live
  // payment gateway is wired. Online pay stays available via the test gateway.
  const [method, setMethod] = useState<PayMethod>("cod");
  const [totals, setTotals] = useState<CheckoutTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  // Stable idempotency key for this checkout attempt — the same key is reused on
  // retry so a duplicate submit returns the same order instead of a new one.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const selected = addresses.find((a) => a.id === addressId);

  // Recompute delivery fee / serviceability whenever the address changes.
  useEffect(() => {
    if (!selected) return;
    let active = true;
    getCheckoutTotals(selected.pincode).then((res) => {
      if (active && res.ok) setTotals(res.data);
    });
    return () => {
      active = false;
    };
  }, [selected]);

  if (summary.lines.length === 0) {
    return (
      <div className="rounded-card border border-neutral-100 bg-white p-8 text-center shadow-card">
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
      theme: { color: "#efc41a" },
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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* Step 1 — Contact */}
        <Section step={1} title="Contact">
          <p className="text-sm font-bold text-neutral-600">
            Signed in as <span className="text-ink">{email ?? "your account"}</span>
          </p>
        </Section>

        {/* Step 2 — Delivery */}
        <Section step={2} title="Delivery address">
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
                    "flex cursor-pointer gap-3 rounded-card border-2 p-3 transition-colors",
                    addressId === a.id ? "border-ink" : "border-neutral-200 hover:border-neutral-300"
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                    className="mt-1 size-4 shrink-0 cursor-pointer accent-ink"
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

        {/* Step 3 — Payment */}
        <Section step={3} title="Payment">
          <div className="space-y-3">
            <PayOption
              active={method === "cod"}
              onSelect={() => !codDisabled && setMethod("cod")}
              icon={Banknote}
              title="Pay on delivery"
              caption={codDisabled ? "Unavailable for this pincode" : "Recommended · pay cash/UPI on delivery"}
              disabled={codDisabled}
            />
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
        <div className="rounded-card border border-neutral-100 bg-white p-5 shadow-card">
          <h2 className="text-lg font-extrabold">Order summary</h2>
          <ul className="mt-4 space-y-2">
            {summary.lines.map((l) => (
              <li key={l.itemId} className="flex justify-between gap-2 text-sm font-bold">
                <span className="min-w-0 truncate text-neutral-600">
                  {l.title} × {l.qty}
                </span>
                <span>{formatPaise(l.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm font-bold">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd>{formatPaise(summary.subtotalPaise)}</dd>
            </div>
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
          <div className="mt-4 flex justify-between border-t border-neutral-100 pt-4 text-base font-extrabold">
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
    <div className="rounded-card border border-neutral-100 bg-white p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-extrabold text-brand">
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
        "flex w-full items-center gap-3 rounded-card border-2 p-3 text-left transition-colors",
        active ? "border-ink" : "border-neutral-200 hover:border-neutral-300",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <Icon className="size-5 shrink-0 text-neutral-600" aria-hidden />
      <span className="flex-1">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="block text-xs font-semibold text-neutral-500">{caption}</span>
      </span>
      {active && <Check className="size-5 text-ink" />}
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
