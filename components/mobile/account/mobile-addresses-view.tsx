"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MapPin, Plus, Loader2 } from "lucide-react";
import { saveAddress, removeAddress, makeDefaultAddress } from "@/actions/address";
import type { AddressFormValues } from "@/components/account/address-form";
import { triggerHaptic } from "@/lib/native/haptics";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { cn } from "@/lib/utils";
import { safeNextPath } from "@/lib/safe-next";
import { AddressLocation } from "@/components/location/address-location";
import { pinnedFromAddress, pinnedFromPlace, placeFromPin, STATE_FROM_PINCODE_NOTE, withPinnedLocation, type PinnedLocation } from "@/lib/location/address-pin";

interface MobileAddressesViewProps {
  initialAddresses: (AddressFormValues & { id: string })[];
}

const LABEL_DISPLAY: Record<string, string> = {
  site: "Site",
  office: "Work",
  home: "Home",
  other: "Other",
};

export function MobileAddressesView({ initialAddresses }: MobileAddressesViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [savingAddress, startSavingAddress] = useTransition();
  const { pincode: chosenPincode, city: chosenCity, place: chosenPlace } = useDeliveryPincode();
  /* The map half of the address (see lib/location/address-pin.ts); `manual` is the no-map escape hatch. */
  const [pinned, setPinned] = useState<PinnedLocation | null>(null);
  const [manual, setManual] = useState(false);
  /* A new pin re-fills city and state from the new place; the customer can still correct them. */
  const choosePin = (pin: PinnedLocation | null) => {
    setPinned(pin);
    if (pin) setAddressForm((prev) => ({ ...prev, ...placeFromPin(pin) }));
  };

  const [addressForm, setAddressForm] = useState<AddressFormValues>({
    label: "site",
    name: "",
    phone: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    isDefault: false,
  });

  const params = useSearchParams();
  /* Arriving from checkout ("Add a delivery address"): open the form, and go back there once it is saved. */
  const returnTo = params.get("next") ? safeNextPath(params.get("next"), "") || null : null;

  useEffect(() => {
    setMounted(true);
    if (params.get("add") === "1") openAddAddressSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const openAddAddressSheet = () => {
    triggerHaptic("light");
    const startPin = pinnedFromPlace(chosenPlace, chosenPincode, chosenCity);
    setAddressFormError(null);
    setEditingAddressId(null);
    setAddressForm({
      label: "site",
      name: "",
      phone: "",
      line1: "",
      line2: "",
      landmark: "",
      city: placeFromPin(startPin).city ?? "",
      state: placeFromPin(startPin).state ?? "",
      /* Never a pincode the customer did not give us (W-13): the one they
         confirmed for delivery, else empty. */
      pincode: chosenPincode ?? "",
      isDefault: false,
    });
    setPinned(startPin);
    setManual(false);
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
      accessNote: addr.accessNote || "",
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: addr.isDefault,
    });
    const pin = pinnedFromAddress(addr);
    setPinned(pin);
    setManual(pin === null);
    setIsAddressFormOpen(true);
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddressFormError(null);

    if (!manual && !pinned) {
      setAddressFormError("Set the delivery location first, or enter the address without the map.");
      return;
    }
    if (manual && addressForm.pincode.length !== 6) {
      setAddressFormError("Please enter a valid 6-digit pincode");
      return;
    }
    const payload = manual || !pinned ? { ...addressForm, latitude: null, longitude: null, placeId: null } : withPinnedLocation(addressForm, pinned);

    triggerHaptic("medium");
    startSavingAddress(async () => {
      const res = await saveAddress(payload, editingAddressId || undefined);
      if (!res.ok) {
        setAddressFormError(res.error.message);
        return;
      }

      const savedAddress = {
        id: res.data.id,
        ...payload,
      };

      setAddresses((prev) => {
        let updated;
        if (editingAddressId) {
          updated = prev.map((a) => (a.id === editingAddressId ? savedAddress : a));
        } else {
          updated = [...prev, savedAddress];
        }
        if (payload.isDefault) {
          updated = updated.map((a) => (a.id === savedAddress.id ? a : { ...a, isDefault: false }));
        }
        return updated;
      });

      setIsAddressFormOpen(false);
      triggerHaptic("light");
      if (returnTo) router.push(returnTo);
      else router.refresh();
    });
  };

  const handleAddressDelete = async (addrId: string) => {
    triggerHaptic("medium");
    const res = await removeAddress(addrId);
    if (res.ok) {
      setAddresses((prev) => prev.filter((a) => a.id !== addrId));
      router.refresh();
    }
  };

  const handleMakeDefault = async (addrId: string) => {
    triggerHaptic("light");
    const res = await makeDefaultAddress(addrId);
    if (res.ok) {
      setAddresses((prev) =>
        prev.map((a) => (a.id === addrId ? { ...a, isDefault: true } : { ...a, isDefault: false }))
      );
      router.refresh();
    }
  };

  if (!mounted) return <div className="min-h-screen bg-surface" />;

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-12 overflow-x-hidden">
      {/* Sticky Native Header */}
      <div className="native-header sticky top-0 z-30 flex items-center gap-3 border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <button
          onClick={() => {
            triggerHaptic("light");
            router.back();
          }}
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
        >
          <ArrowLeft className="size-4.5" />
        </button>
        <h1 className="text-base font-extrabold text-ink leading-none">My Addresses</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40">
            Saved Addresses
          </h3>
          <button
            onClick={openAddAddressSheet}
            className="flex items-center gap-1 text-[10px] font-extrabold text-brand-deep hover:underline"
          >
            <Plus className="size-3" /> Add Address
          </button>
        </div>

        {addresses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-mist/30 p-12 text-center text-xs font-bold text-ink/45 bg-white">
            No saved addresses found. Add a delivery address to begin.
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div key={addr.id} className="rounded-2xl border border-mist/15 bg-white p-4 flex gap-3 shadow-2xs">
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
                  <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-mist/10">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEditAddressSheet(addr)}
                        className="text-[10px] font-bold text-brand-deep hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleAddressDelete(addr.id)}
                        className="text-[10px] font-bold text-danger hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                    {!addr.isDefault && (
                      <button
                        onClick={() => handleMakeDefault(addr.id)}
                        className="text-[10px] font-bold text-ink/50 hover:text-ink active:scale-95 transition-transform"
                      >
                        Set as Default
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Address Form Bottom Sheet */}
      <BottomSheetLayout
        isOpen={isAddressFormOpen}
        onClose={() => setIsAddressFormOpen(false)}
        title={editingAddressId ? "Edit Address" : "New Address"}
      >
        <form onSubmit={handleAddressSubmit} className="space-y-4 pb-6">
          {addressFormError && (
            <div className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
              {addressFormError}
            </div>
          )}

          {/* Delivery location — the map half of the address */}
          {manual ? (
            <p className="text-xs font-semibold text-ink/70">
              Entering the address by hand — the driver won&apos;t have a map pin.{" "}
              <button type="button" onClick={() => setManual(false)} className="font-bold text-ink underline underline-offset-2">
                Use the map instead
              </button>
            </p>
          ) : (
            <div className="space-y-2">
              <AddressLocation value={pinned} onChange={choosePin} />
              <button type="button" onClick={() => setManual(true)} className="text-[11px] font-bold text-ink/50 underline underline-offset-2">
                Can&apos;t find it? Enter the address without the map
              </button>
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
                placeholder="Contractor Name"
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
                placeholder="10-digit phone"
                className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
              />
            </div>
          </div>

          {/* Address Line 1 */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
              House / flat / floor
            </label>
            <input
              type="text"
              required
              value={addressForm.line1}
              onChange={(e) => setAddressForm((f) => ({ ...f, line1: e.target.value }))}
              placeholder="e.g. House 12, first floor"
              className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
            />
          </div>

          {/* Street / area — from the map pin unless typed by hand */}
          {manual ? (
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
              Address Line 2
            </label>
            <input
              type="text"
              value={addressForm.line2 ?? ""}
              onChange={(e) => setAddressForm((f) => ({ ...f, line2: e.target.value }))}
              placeholder="Area, Colony, Street"
              className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
            />
          </div>
          ) : null}

          {/* City and state: pre-filled from the pin when it has them, always the customer's to correct — never assumed. */}
          <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="address-city" className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">City</label>
                  <input
                    id="address-city"
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
                  />
                </div>
                <div>
                  <label htmlFor="address-state" className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">State</label>
                  <input
                    id="address-state"
                    type="text"
                    required
                    value={addressForm.state}
                    onChange={(e) => setAddressForm((f) => ({ ...f, state: e.target.value }))}
                    className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
                  />
                </div>
          </div>
          <p className="text-[10px] font-semibold text-ink/50">{STATE_FROM_PINCODE_NOTE}</p>

          {/* Landmark, delivery instructions, and the pincode when typed by hand */}
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
            {manual ? (
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
            ) : null}
          </div>

          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 block mb-1">
              Delivery instructions (optional)
            </label>
            <input
              type="text"
              maxLength={240}
              value={addressForm.accessNote ?? ""}
              onChange={(e) => setAddressForm((f) => ({ ...f, accessNote: e.target.value }))}
              placeholder="e.g. Truck can reach the rear gate"
              className="w-full rounded-xl border border-mist/20 bg-surface p-3 text-xs font-semibold text-ink outline-none focus:border-brand-deep"
            />
          </div>

          {/* Default Address Checkbox */}
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={addressForm.isDefault}
              onChange={(e) => setAddressForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded text-brand border-mist/30"
            />
            <span className="text-xs font-semibold text-ink/80">Make default address</span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={savingAddress}
            className="w-full rounded-xl bg-brand-deep py-3.5 text-xs font-extrabold text-white shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {savingAddress ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Save Address"}
          </button>
        </form>
      </BottomSheetLayout>
    </div>
  );
}
