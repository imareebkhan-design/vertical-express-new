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
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";
import type { AddressFormValues } from "@/components/account/address-form";
import { saveAddress, removeAddress } from "@/actions/address";
import { getCheckoutTotals, placeOrder, confirmRazorpayPayment, validateCoupon } from "@/actions/checkout";
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { cn } from "@/lib/utils";
import type { CheckoutTotals } from "@/lib/services/checkout";

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
  const { refresh } = useCart();

  // Local state for address lists
  const [addresses, setAddresses] = useState(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    initialAddresses.find((a) => a.isDefault)?.id || initialAddresses[0]?.id || null
  );

  // Totals & Placing states
  const [totals, setTotals] = useState<CheckoutTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  const [loadingTotals, setLoadingTotals] = useState(false);

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
    pincode: "190001",
    isDefault: false,
  });
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [savingAddress, startSavingAddress] = useTransition();

  // Coupons states
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; success: boolean } | null>(null);

  // Payments states
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");

  // Idempotency key stable for retry
  const idempotencyKey = useRef<string>(generateUUID());

  const selected = addresses.find((a) => a.id === selectedAddressId);

  // Sync / Recalculate totals on address selection changes
  useEffect(() => {
    if (!selected) {
      setTotals(null);
      return;
    }
    setLoadingTotals(true);
    setError(null);

    getCheckoutTotals(selected.pincode, appliedCoupon || undefined)
      .then((res) => {
        if (res.ok) {
          setTotals(res.data);
        } else {
          setError(res.error.message);
        }
      })
      .finally(() => {
        setLoadingTotals(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddressId, appliedCoupon]);

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
        theme: { color: "#efc41a" },
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
    if (!selectedAddressId) {
      setError("Please select a delivery address");
      return;
    }
    if (paymentMethod === "cod" && totals && !totals.codAllowed) {
      setError("COD isn't available for this delivery zone");
      return;
    }

    triggerHaptic("medium");
    startPlacing(async () => {
      const res = await placeOrder({
        addressId: selectedAddressId,
        paymentMethod,
        idempotencyKey: idempotencyKey.current,
      });

      if (!res.ok) {
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
    triggerHaptic("light");

    const res = await validateCoupon(couponCode.trim(), selected.pincode);
    if (!res.ok) {
      setCouponMsg({ text: res.error.message, success: false });
      return;
    }

    setTotals(res.data);
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
      pincode: selected?.pincode || "190001",
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
          <div className="flex items-center gap-2 rounded-2xl bg-danger/10 p-4 text-xs font-bold text-danger">
            <AlertCircle className="size-4.5 shrink-0" />
            <span>{error}</span>
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
              <p className={cn("text-[10px] font-bold", couponMsg.success ? "text-emerald-600" : "text-danger")}>
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
                  paymentMethod === "online"
                    ? "border-brand-deep bg-brand-deep/5 text-brand-deep"
                    : "border-mist/20 bg-surface text-ink/75"
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
                    : paymentMethod === "cod"
                    ? "border-brand-deep bg-brand-deep/5 text-brand-deep"
                    : "border-mist/20 bg-surface text-ink/75"
                )}
              >
                <div className="flex items-center gap-2">
                  <Building className="size-4" />
                  <span>Pay on Delivery (Cash / UPI)</span>
                </div>
                {paymentMethod === "cod" && <Check className="size-4 text-brand-deep" />}
              </button>
            </div>
            {!totals.codAllowed && (
              <span className="text-[9px] text-danger font-bold mt-1 block">
                Cash on delivery is disabled for this delivery pincode
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

            {loadingTotals ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 className="size-4 animate-spin text-brand-deep" />
                <span className="text-xs font-semibold text-ink/50">Calculating totals...</span>
              </div>
            ) : totals ? (
              <>
                <dl className="space-y-2 text-xs font-bold">
                  {/* Subtotal */}
                  <div className="flex justify-between text-ink/70">
                    <dt>Subtotal</dt>
                    <dd>{formatPaise(totals.subtotalPaise)}</dd>
                  </div>

                  {/* GST */}
                  {totals.taxPaise > 0 && (
                    <div className="flex justify-between text-ink/70">
                      <dt>GST (18% inclusive)</dt>
                      <dd>{formatPaise(totals.taxPaise)}</dd>
                    </div>
                  )}

                  {/* Discount */}
                  {totals.discountPaise > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <dt>Coupon Discount</dt>
                      <dd>-{formatPaise(totals.discountPaise)}</dd>
                    </div>
                  )}

                  {/* Delivery Fee */}
                  <div className="flex justify-between text-ink/70">
                    <dt>Delivery Charges</dt>
                    <dd className={totals.deliveryFeePaise === 0 ? "text-emerald-600" : ""}>
                      {totals.deliveryFeePaise === 0 ? "FREE" : formatPaise(totals.deliveryFeePaise)}
                    </dd>
                  </div>

                  {/* Delivery Serviceability alert banner */}
                  <div className="border-t border-mist/10 pt-3 flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-ink/40 uppercase">Delivery ETA</span>
                    <span className={cn("font-extrabold", totals.serviceable ? "text-emerald-600" : "text-danger")}>
                      {totals.serviceable ? `ETA ~${totals.etaMinutes} mins` : "Unavailable"}
                    </span>
                  </div>
                </dl>

                {/* Grand Total Bar */}
                <div className="border-t border-mist/10 pt-3 flex justify-between items-center text-sm font-extrabold">
                  <span>Grand Total</span>
                  <span className="text-brand-deep text-base">{formatPaise(totals.totalPaise)}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-xs font-semibold text-ink/40">
                Pincode serviceability details unavailable.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Bottom Place Order CTA */}
      {selected && totals && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-mist/25 px-4 pb-[calc(env(safe-area-inset-bottom,12px)+6px)] pt-3.5 flex items-center justify-between shadow-2xl">
          <div>
            <span className="text-[10px] font-extrabold text-ink/40 uppercase block leading-none">Total Payable</span>
            <span className="text-base font-extrabold text-ink mt-1.5 block leading-none">
              {formatPaise(totals.totalPaise)}
            </span>
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={placing || !totals.serviceable}
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
                      ? "border-brand-deep bg-brand-deep/5 text-brand-deep"
                      : "border-mist/20 bg-surface text-ink/75"
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
