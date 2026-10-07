"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Plus,
  Tag,
  Loader2,
  AlertCircle,
  Check,
  CreditCard,
  Building,
} from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { formatPaise } from "@/lib/money";
import { CheckoutSummaryLines } from "@/components/shop/checkout/summary-lines";
import { triggerHaptic } from "@/lib/native/haptics";
import type { AddressFormValues } from "@/components/account/address-form";
import { saveAddress, removeAddress } from "@/actions/address";
import { getCheckoutTotals, placeOrder, confirmRazorpayPayment, validateCoupon } from "@/actions/checkout";
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { cn } from "@/lib/utils";
import { groupCartByShipment } from "@/lib/cart-shipments";
import { ExpressChoice } from "@/components/shop/checkout/express-choice";
import { ShipmentReview } from "@/components/shop/checkout/shipment-review";
import { quoteShort } from "@/lib/order-display";
import { CodSplitNotice } from "@/components/shop/cod-split-notice";
import { CouponRevisedNotice } from "@/components/shop/checkout/coupon-revised-notice";
import { QuotePending } from "@/components/mobile/checkout/quote-pending";
import { useCheckoutQuote, QUOTE_NOT_CURRENT, cartKeyOf } from "@/components/shop/checkout/use-checkout-quote";
import { couponRevisionFromPlaceError, couponRevisionFromQuote, type CouponRevision } from "@/lib/coupon-refusal";
import { isTotalChangedError } from "@/lib/checkout-errors";

interface MobileCheckoutViewProps {
  initialAddresses: (AddressFormValues & { id: string })[];
  email: string | null;
}

const LABEL_DISPLAY: Record<string, string> = {
  site: "Site",
  office: "Work",
  home: "Home",
  other: "Other",
};

const generateUUID = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export function MobileCheckoutView({ initialAddresses, email }: MobileCheckoutViewProps) {
  const router = useRouter();
  const { summary, refresh } = useCart();

  // Local state for address lists
  const [addresses, setAddresses] = useState(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    initialAddresses.find((a) => a.isDefault)?.id || initialAddresses[0]?.id || null
  );

  // Totals & Placing states
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  /* E8: bumped when placement is refused because the cart moved, so the quote
     is asked again even if the lines on screen look the same. */
  const [requote, setRequote] = useState(0);

  // Address Editor states
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFormValues>({
    label: "site",
    name: "",
    phone: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "Srinagar",
    state: "Jammu & Kashmir",
    pincode: "",
    isDefault: false,
  });
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [savingAddress, startSavingAddress] = useTransition();

  /* Asked for only when the account has none — a phone sign-in carries no
     email, and the confirmation has nowhere to go without one. */
  const [contactEmail, setContactEmail] = useState("");

  // Coupons states
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; success: boolean } | null>(null);
  /* E6: a coupon that stopped qualifying — shown until the customer acts again. */
  const [couponRevision, setCouponRevision] = useState<CouponRevision | null>(null);
  const shownTotalRef = useRef<number | null>(null);

  // Payments states
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  /* The express choice (W-B1-G1) — the desktop checkout's question. Re-priced
     on change because the fee is part of what is owed; the server re-resolves
     whether express is on offer when the order is placed. */
  const [wantsExpress, setWantsExpress] = useState(false);

  // Idempotency key stable for retry
  const idempotencyKey = useRef<string>(generateUUID());

  const selected = addresses.find((a) => a.id === selectedAddressId);
  const { pincode: chosenPincode } = useDeliveryPincode();

  /* ISS-081: `totals` answers exactly the address, coupon and delivery choice
     on screen, or is null — the moment any of them changes, until the server
     answers the new ones. With no current totals the bottom bar (amount and
     button) is not shown, and the Order Summary says why (QuotePending). A
     slower answer for an earlier choice can never replace a newer one. */
  const {
    quote: totals,
    status: quoteStatus,
    failure: quoteFailure,
    canSubmit,
  } = useCheckoutQuote(
    {
      addressId: selectedAddressId,
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
         (e.g. the basket changed): these totals are without it. Say so and
         stop sending it, rather than keep showing "applied". */
      const revised = couponRevisionFromQuote(fresh, answered.couponCode, shownTotalRef.current);
      if (revised) {
        setCouponRevision(revised);
        setAppliedCoupon(null);
        setCouponMsg(null);
      }
      /* COD is the default; when the server refuses it here, online is the
         only method that can place the order — otherwise the main button
         reads "Confirm COD Order" and can only fail. */
      if (!fresh.codAllowed) setPaymentMethod((m) => (m === "cod" ? "online" : m));
    }
  );

  /* The same split the cart shows and the order is placed with — one rule, in
     lib/shipment-plan.ts, including the express run the current quote grants
     (E7). Used by the COD option to say how many drivers the customer will
     actually be paying. */
  const standardShipments = groupCartByShipment(summary.lines);
  const shipments = groupCartByShipment(summary.lines, totals?.expressChosen ? totals.express.eligibleVariantIds : []);

  /* A new choice clears the last placement error, as re-quoting always did. */
  useEffect(() => {
    setError(null);
  }, [selectedAddressId, appliedCoupon, wantsExpress]);

  useEffect(() => {
    if (totals) shownTotalRef.current = totals.totalPaise;
  }, [totals]);

  // Load Razorpay script
  const loadRazorpayScript = (): Promise<void> => {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Razorpay) return resolve();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  };

  // Launch Razorpay gateway window
  const openRazorpay = async (
    orderNo: string,
    rzp: { orderId: string; amountPaise: number; keyId: string }
  ) => {
    try {
      await loadRazorpayScript();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        setError("Payment overlay could not load. Access orders to retry.");
        return;
      }

      const options = {
        key: rzp.keyId,
        amount: rzp.amountPaise,
        currency: "INR",
        name: "Vertical Express",
        order_id: rzp.orderId,
        prefill: { email: email ?? undefined },
        theme: { color: "#EDAF1C" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (response: any) => {
          triggerHaptic("medium");
          const confirm = await confirmRazorpayPayment({
            orderNo,
            razorpayOrderId: rzp.orderId,
            razorpayPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });

          if (!confirm.ok) {
            setError(confirm.error.message);
            return;
          }
          await refresh();
          router.push(`/checkout/confirmation/${orderNo}`);
        },
        modal: {
          ondismiss: () => {
            setError("Payment was cancelled. Your order is pending payment.");
          },
        },
      };

      const rz = new Razorpay(options);
      rz.open();
    } catch {
      setError("Payment system load failed. Try placing again.");
    }
  };

  // place order handler
  const handlePlaceOrder = () => {
    setError(null);
    setCouponRevision(null);
    if (!selectedAddressId) {
      setError("Please select a delivery address");
      return;
    }
    /* The button is hidden or disabled then too; this holds even if pressed anyway. */
    if (!canSubmit) {
      setError(QUOTE_NOT_CURRENT);
      return;
    }
    if (paymentMethod === "cod" && totals && !totals.codAllowed) {
      setError("Cash on delivery isn't available right now");
      return;
    }

    triggerHaptic("medium");
    startPlacing(async () => {
      const res = await placeOrder({
        addressId: selectedAddressId,
        paymentMethod,
        idempotencyKey: idempotencyKey.current,
        /* This screen applies a coupon and shows the discounted total, and
           then placed the order without it — so the customer saw one price
           and was charged another. That is ISS-011, which was fixed on the
           desktop view and left here, on the surface this market actually
           uses. The server re-validates the code; the client is still never
           trusted for the discount itself. */
        couponCode: appliedCoupon,
        wantsExpress,
        /* Nothing reaches a phone-only customer otherwise: no account email,
           and no SMS channel yet. */
        contactEmail: email ? null : contactEmail.trim() || null,
        /* E8: checked, never charged — refused if the cart moved since this quote. */
        expectedTotalPaise: totals?.totalPaise,
      });

      if (!res.ok) {
        /* E6: the coupon no longer qualifies. Nothing was placed or charged.
           Drop it and re-quote — the bottom bar disappears until the fresh
           total is back, so nothing can be placed at the old figure — then show
           old vs new and wait for the customer to press the button again. */
        const revision = couponRevisionFromPlaceError(res.error, totals?.totalPaise ?? null);
        if (revision && appliedCoupon) {
          setCouponRevision(revision);
          setAppliedCoupon(null);
          setCouponCode("");
          setCouponMsg(null);
          return;
        }
        /* E8: the cart changed elsewhere (another tab, a sign-in merge, stock)
           since this total. Nothing was placed. Re-read the cart and re-quote;
           the bottom bar is hidden until the new total is back. */
        if (isTotalChangedError(res.error)) {
          setError(res.error.message);
          setRequote((n) => n + 1);
          await refresh();
          return;
        }
        setError(res.error.message);
        return;
      }

      // If Razorpay gateway returned details, open online payment overlay
      if (res.data.razorpay?.orderId && res.data.razorpay.keyId) {
        await openRazorpay(res.data.orderNo, res.data.razorpay);
        return;
      }

      // COD path / Dummy settlement
      await refresh();
      router.push(`/checkout/confirmation/${res.data.orderNo}`);
    });
  };

  // Coupons
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim() || !selected) return;
    setCouponMsg(null);
    setCouponRevision(null);
    triggerHaptic("light");

    const res = await validateCoupon(couponCode.trim(), selected.pincode);
    if (!res.ok) {
      setCouponMsg({ text: res.error.message, success: false });
      return;
    }

    /* Only validated here: the total comes from the quote for the new inputs
       (which also carries the delivery choice — this answer does not). */
    setAppliedCoupon(couponCode.trim());
    setCouponMsg({ text: "Coupon applied successfully!", success: true });
    setCouponCode("");
  };

  const handleRemoveCoupon = () => {
    triggerHaptic("light");
    setAppliedCoupon(null);
    setCouponMsg(null);
    setCouponCode("");
  };

  // Address Sheets triggers
  const openAddAddressSheet = () => {
    triggerHaptic("light");
    setAddressFormError(null);
    setEditingAddressId(null);
    setAddressForm({
      label: "site",
      name: "",
      phone: "",
      line1: "",
      line2: "",
      landmark: "",
      city: "Srinagar",
      state: "Jammu & Kashmir",
      /* Never a pincode the customer did not give us (W-13): their selected
         site's, else the one they confirmed for delivery, else empty. */
      pincode: selected?.pincode || chosenPincode || "",
      isDefault: false,
    });
    setIsAddressFormOpen(true);
  };

  const openEditAddressSheet = (addr: AddressFormValues & { id: string }) => {
    triggerHaptic("light");
    setAddressFormError(null);
    setEditingAddressId(addr.id);
    setAddressForm({
      label: addr.label,
      name: addr.name,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || "",
      landmark: addr.landmark || "",
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: addr.isDefault,
    });
    setIsAddressFormOpen(true);
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddressFormError(null);

    if (addressForm.pincode.length !== 6) {
      setAddressFormError("Please enter a valid 6-digit pincode");
      return;
    }

    triggerHaptic("medium");
    startSavingAddress(async () => {
      const res = await saveAddress(addressForm, editingAddressId || undefined);
      if (!res.ok) {
        setAddressFormError(res.error.message);
        return;
      }

      // Reload local address list
      // Next.js server actions revalidatePath('/checkout') updates route, but we sync locally to avoid reload latency
      const savedAddress = {
        id: res.data.id,
        ...addressForm,
      };

      setAddresses((prev) => {
        let updated;
        if (editingAddressId) {
          updated = prev.map((a) => (a.id === editingAddressId ? savedAddress : a));
        } else {
          updated = [...prev, savedAddress];
        }
        // Sync default states
        if (addressForm.isDefault) {
          updated = updated.map((a) => (a.id === savedAddress.id ? a : { ...a, isDefault: false }));
        }
        return updated;
      });

      setSelectedAddressId(savedAddress.id);
      setIsAddressFormOpen(false);
      triggerHaptic("light");
    });
  };

  const handleAddressDelete = async (addrId: string) => {
    triggerHaptic("medium");
    const res = await removeAddress(addrId);
    if (res.ok) {
      setAddresses((prev) => prev.filter((a) => a.id !== addrId));
      if (selectedAddressId === addrId) {
        setSelectedAddressId(null);
      }
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-surface pb-36 overflow-x-hidden">
      {/* Sticky Native Header */}
      <div className="native-header sticky top-0 z-30 flex items-center gap-3 border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <button
          onClick={() => {
            triggerHaptic("light");
            router.back();
          }}
          className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
        >
          <ArrowLeft className="size-4.5" />
        </button>
        <h1 className="text-base font-extrabold text-ink leading-none">Checkout Details</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Error Banner */}
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-2xl bg-danger/10 p-4 text-xs font-bold text-danger">
            <AlertCircle className="size-4.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Without this a phone-only customer places an order and hears nothing
            back: the account has no email, and there is no SMS channel yet.
            Optional — an order must never be blocked on it. */}
        {!email && (
          <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs">
            <label
              htmlFor="m-contact-email"
              className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40"
            >
              Email for your receipt <span className="text-ink/30">(optional)</span>
            </label>
            <input
              id="m-contact-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-mist/30 bg-white px-3 text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
            />
            <p className="mt-2 text-[10px] font-semibold leading-[14px] text-ink/45">
              We do not send SMS yet. Leave it blank and your order is still placed — you will
              find it under My Orders.
            </p>
          </div>
        )}

        {/* Addresses Picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40">
              Delivery Address
            </h3>
            <button
              onClick={openAddAddressSheet}
              className="flex items-center gap-1 text-[10px] font-extrabold text-brand-deep hover:underline"
            >
              <Plus className="size-3" /> Add Address
            </button>
          </div>

          {addresses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-mist/30 p-8 text-center text-xs font-bold text-ink/45 bg-white">
              No addresses saved. Add an address to continue.
            </div>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <div
                    key={addr.id}
                    onClick={() => {
                      triggerHaptic("light");
                      setSelectedAddressId(addr.id);
                    }}
                    className={cn(
                      "rounded-2xl border p-4 flex gap-3 text-left transition-all active:scale-[0.99]",
                      isSelected
                        ? "border-brand-deep bg-brand-deep/5 shadow-xs"
                        : "border-mist/25 bg-white"
                    )}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist/20 text-ink/65">
                      <MapPin className="size-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-ink capitalize">
                          {addr.label} · {addr.name}
                        </span>
                        {addr.isDefault && (
                          <span className="rounded-md bg-mist/20 px-1 py-0.5 text-[8px] font-extrabold uppercase text-ink/50 leading-none">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-ink/60 mt-1 leading-snug">
                        {addr.line1}
                        {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} — {addr.pincode}
                        <br />
                        Phone: {addr.phone}
                      </p>
                      <div className="flex gap-3 mt-3 pt-3 border-t border-mist/10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditAddressSheet(addr);
                          }}
                          className="text-[10px] font-bold text-brand-deep hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddressDelete(addr.id);
                          }}
                          className="text-[10px] font-bold text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* How fast, then how it travels — the desktop checkout's steps 2 and
            3, which the phone never had (W-B1-G1). Same components, same words. */}
        {selected && totals && (
          <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs">
            <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
              How fast
            </h3>
            <ExpressChoice
              express={totals.express}
              wantsExpress={wantsExpress}
              onChange={setWantsExpress}
              lineCount={summary.lines.length}
              standardShipments={standardShipments.length}
            />
          </div>
        )}

        {shipments.length > 0 && (
          <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs">
            <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
              Your shipments
            </h3>
            <ShipmentReview shipments={shipments} />
          </div>
        )}

                {/* Coupons experience */}
        {selected && (
          <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
              Apply Coupons
            </h3>

            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-xl bg-brand-deep/10 border border-brand/25 p-3">
                <div className="flex items-center gap-2">
                  <Tag className="size-4 text-brand-deep" />
                  <span className="text-xs font-extrabold text-brand-deep uppercase">
                    {appliedCoupon} Applied
                  </span>
                </div>
                <button
                  onClick={handleRemoveCoupon}
                  className="text-xs font-bold text-danger hover:underline p-1"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Coupon (e.g. FLAT10)"
                  aria-label="Coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded-xl border border-mist/20 bg-surface p-3 text-xs font-bold text-ink outline-none focus:border-brand-deep placeholder:text-ink/30"
                />
                <button
                  type="submit"
                  disabled={!couponCode.trim()}
                  className="rounded-xl bg-brand-deep px-5 py-3 text-xs font-bold text-white shadow-xs active:scale-95 disabled:opacity-50"
                >
                  Apply
                </button>
              </form>
            )}

            {couponMsg && (
              <p className={cn("text-[10px] font-bold", couponMsg.success ? "text-ink" : "text-ink-700")}>
                {couponMsg.text}
              </p>
            )}
          </div>
        )}

        {/* Payment Methods */}
        {selected && totals && totals.serviceable && (
          <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
              Payment Method
            </h3>
            <div className="space-y-2">
              {/* Online Payment */}
              <button
                onClick={() => {
                  triggerHaptic("light");
                  setPaymentMethod("online");
                }}
                className={cn(
                  "flex items-center justify-between w-full rounded-xl border p-3.5 text-left text-xs font-bold transition-all",
                  paymentMethod === "online" ?"border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-surface text-ink/75"
                )}
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4" />
                  <span>Pay Online (UPI / Card / NetBanking)</span>
                </div>
                {paymentMethod === "online" && <Check className="size-4 text-brand-deep" />}
              </button>

              {/* COD */}
              <button
                onClick={() => {
                  if (!totals.codAllowed) return;
                  triggerHaptic("light");
                  setPaymentMethod("cod");
                }}
                disabled={!totals.codAllowed}
                className={cn(
                  "flex items-center justify-between w-full rounded-xl border p-3.5 text-left text-xs font-bold transition-all",
                  !totals.codAllowed
                    ? "opacity-50 bg-mist/5 text-ink/30 cursor-not-allowed border-transparent"
                    : paymentMethod === "cod" ?"border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-surface text-ink/75"
                )}
              >
                <div className="flex items-center gap-2">
                  <Building className="size-4" />
                  <span>Pay on Delivery (Cash / UPI)</span>
                </div>
                {paymentMethod === "cod" && <Check className="size-4 text-brand-deep" />}
              </button>

              {/* Two shipments means two drivers and two separate cash
                  handovers, a day apart. Saying so is the difference between a
                  buyer having the right money at the gate and a delivery being
                  refused. Shared with the web checkout. */}
              {paymentMethod === "cod" && totals?.codAllowed && (
                <CodSplitNotice shipments={shipments} />
              )}
            </div>
            {!totals.codAllowed && (
              <span className="text-[9px] text-danger font-bold mt-1 block">
                Cash on delivery isn&apos;t available right now
              </span>
            )}
          </div>
        )}

        {/* Order Totals Summary */}
        {selected && (
          <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs space-y-4">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
              Order Summary
            </h3>

            {!totals ? (
              <QuotePending loading={quoteStatus === "loading"} failure={quoteFailure} revision={couponRevision} />
            ) : (
              <>
                <dl className="space-y-2 text-xs font-bold">
                  {/* Subtotal, discount, GST (included), delivery — from the
                      server's totals, shared with desktop (summary-lines.tsx).
                      This used to print the taxable value as "Subtotal", call
                      the GST "included", and subtract the coupon a second time. */}
                  <CheckoutSummaryLines totals={totals} variant="phone" />

                  {/* Delivery Serviceability alert banner */}
                  <div className="border-t border-mist/10 pt-3 flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-ink/40 uppercase">Delivery ETA</span>
                    <span className={cn("font-extrabold", totals.serviceable ? "text-ink" : "text-ink-700")}>
                      {/* `serviceable` says we deliver here, not that we
                          promised a time. The pincode quote covers the quick
                          run only — a truck shipment has no time to state
                          (quoteShort, lib/order-display). */}
                      {!totals.serviceable ? "Unavailable" : quoteShort(totals.etaMinutes, shipments)}
                    </span>
                  </div>
                </dl>

                {/* Grand Total Bar */}
                <div className="border-t border-mist/10 pt-3 flex justify-between items-center text-sm font-extrabold">
                  <span>Grand Total</span>
                  <span className="text-brand-deep text-base">{formatPaise(totals.totalPaise)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sticky Bottom Place Order CTA */}
      {selected && totals && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-mist/25 px-4 pb-[calc(env(safe-area-inset-bottom,12px)+6px)] pt-3.5 shadow-2xl">
          {couponRevision && (
            <div className="mb-3">
              <CouponRevisedNotice revision={couponRevision} currentTotalPaise={totals.totalPaise} variant="phone" />
            </div>
          )}
          <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-ink/40 uppercase block leading-none">Total Payable</span>
            <span className="text-base font-extrabold text-ink mt-1.5 block leading-none">
              {formatPaise(totals.totalPaise)}
            </span>
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={placing || !canSubmit}
            className="flex h-12 items-center justify-center rounded-xl bg-brand-deep px-8 text-xs font-extrabold text-white shadow-md hover:opacity-95 active:scale-98 disabled:opacity-50"
          >
            {placing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : paymentMethod === "online" ? (
              "Pay & Place Order"
            ) : (
              "Confirm COD Order"
            )}
          </button>
          </div>
        </div>
      )}

      {/* Add/Edit Address Form Bottom Sheet */}
      <BottomSheetLayout
        isOpen={isAddressFormOpen}
        onClose={() => setIsAddressFormOpen(false)}
        title={editingAddressId ? "Edit Delivery Address" : "New Delivery Address"}
      >
        <form onSubmit={handleAddressSubmit} className="space-y-4 pb-6">
          {addressFormError && (
            <div className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
              {addressFormError}
            </div>
          )}

          {/* Address Label */}
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
              Address Label
            </h4>
            <div className="flex gap-2">
              {["site", "office", "home"].map((lbl) => (
                <button
                  type="button"
                  key={lbl}
                  onClick={() => {
                    triggerHaptic("light");
                    setAddressForm((f) => ({ ...f, label: lbl as AddressFormValues["label"] }));
                  }}
                  className={cn(
                    "flex-1 rounded-xl border py-2 text-xs font-bold text-center transition-all",
                    addressForm.label === lbl
                      ? "border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-surface text-ink/75"
                  )}
                >
                  {LABEL_DISPLAY[lbl]}
                </button>
              ))}
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
                Name
              </label>
              <input
                type="text"
                required
                value={addressForm.name}
                onChange={(e) => setAddressForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contractor/Owner Name"
                className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
                Phone
              </label>
              <input
                type="tel"
                required
                value={addressForm.phone}
                onChange={(e) => setAddressForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))}
                placeholder="10-digit number"
                className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
              />
            </div>
          </div>

          {/* Address Line 1 */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
              Address Line 1 (Flat, Plot, Site No.)
            </label>
            <input
              type="text"
              required
              value={addressForm.line1}
              onChange={(e) => setAddressForm((f) => ({ ...f, line1: e.target.value }))}
              placeholder="e.g. Site No. 4, Lane 2"
              className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
            />
          </div>

          {/* Address Line 2 */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
              Address Line 2 (Street, Area)
            </label>
            <input
              type="text"
              value={addressForm.line2 ?? ""}
              onChange={(e) => setAddressForm((f) => ({ ...f, line2: e.target.value }))}
              placeholder="e.g. Rajbagh"
              className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
            />
          </div>

          {/* Landmark & Pincode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
                Landmark
              </label>
              <input
                type="text"
                value={addressForm.landmark ?? ""}
                onChange={(e) => setAddressForm((f) => ({ ...f, landmark: e.target.value }))}
                placeholder="e.g. Near Mosque"
                className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
                Pincode
              </label>
              <input
                type="tel"
                maxLength={6}
                required
                value={addressForm.pincode}
                onChange={(e) => setAddressForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "") }))}
                placeholder="6-digit pin"
                className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
              />
            </div>
          </div>

          {/* Default Address Checkbox */}
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={addressForm.isDefault}
              onChange={(e) => setAddressForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded text-brand border-mist/30"
            />
            <span className="text-xs font-semibold text-ink/80">Make this my default address</span>
          </label>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={savingAddress}
            className="w-full rounded-xl bg-brand-deep py-3.5 text-xs font-extrabold text-white shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {savingAddress ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Save Delivery Address"}
          </button>
        </form>
      </BottomSheetLayout>
    </div>
  );
}
