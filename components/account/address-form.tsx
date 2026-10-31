"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { saveAddress } from "@/actions/address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { AddressLocation } from "@/components/location/address-location";
import type { PinnedLocation } from "@/lib/location/address-pin";
import { pinnedFromAddress, pinnedFromPlace, placeFromPin, STATE_FROM_PINCODE_NOTE, withPinnedLocation } from "@/lib/location/address-pin";

export interface AddressFormValues {
  id?: string;
  label: "home" | "site" | "office" | "other";
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  accessNote?: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  isDefault: boolean;
}

const LABELS: AddressFormValues["label"][] = ["home", "site", "office", "other"];

export function AddressForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: Partial<AddressFormValues>;
  /** Called with the saved address's id. */
  onDone: (id: string) => void;
  onCancel?: () => void;
}) {
  const delivery = useDeliveryPincode();
  /* A new address starts from the place the customer already confirmed in the
     location sheet, if any; an existing one from its own saved pin. */
  const [pinned, setPinned] = useState<PinnedLocation | null>(() =>
    initial?.id ? pinnedFromAddress(initial) : pinnedFromPlace(delivery.place, delivery.pincode, delivery.city)
  );
  const [values, setValues] = useState<AddressFormValues>({
    label: initial?.label ?? "home",
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    landmark: initial?.landmark ?? "",
    accessNote: initial?.accessNote ?? "",
    /* Never assumed: pre-filled from the pin when it knows them, always editable (see placeFromPin). */
    city: initial?.city ?? placeFromPin(pinned).city ?? "",
    state: initial?.state ?? placeFromPin(pinned).state ?? "",
    pincode: initial?.pincode ?? "",
    isDefault: initial?.isDefault ?? false,
  });
  /* Typing the address without the map: the escape hatch when Google cannot find it. No coordinates are saved. */
  const [manual, setManual] = useState(() => Boolean(initial?.id) && pinnedFromAddress(initial ?? {}) === null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* A new pin re-fills city and state from the new place; the customer can still correct them. */
  const choosePin = (pin: PinnedLocation | null) => {
    setPinned(pin);
    if (pin) setValues((prev) => ({ ...prev, ...placeFromPin(pin) }));
  };

  const set = <K extends keyof AddressFormValues>(k: K, v: AddressFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!manual && !pinned) {
      setError("Set the delivery location first, or enter the address without the map.");
      return;
    }
    startTransition(async () => {
      const result = await saveAddress(manual ? { ...values, latitude: null, longitude: null, placeId: null } : withPinnedLocation(values, pinned!), initial?.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onDone(result.data.id);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {manual ? (
        <p className="text-sm font-semibold text-neutral-600">
          Entering the address by hand — the driver won&apos;t have a map pin.{" "}
          <button type="button" onClick={() => setManual(false)} className="font-bold text-ink underline underline-offset-2">
            Use the map instead
          </button>
        </p>
      ) : (
        <div className="space-y-2">
          <AddressLocation value={pinned} onChange={choosePin} />
          <button type="button" onClick={() => setManual(true)} className="text-xs font-bold text-neutral-500 underline underline-offset-2 hover:text-ink">
            Can&apos;t find it? Enter the address without the map
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => set("label", l)}
            className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide capitalize transition-colors ${
              values.label === l ? "border-brand-deep bg-brand-deep text-white" : "border-neutral-200 hover:border-brand-deep"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Phone">
          <Input
            inputMode="numeric"
            maxLength={10}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
      </div>

      <Field label="House / flat / floor">
        <Input value={values.line1} onChange={(e) => set("line1", e.target.value)} placeholder="e.g. House 12, first floor" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {manual ? (
          <Field label="Street / area">
            <Input value={values.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
          </Field>
        ) : null}
        <Field label="Landmark (optional)">
          <Input value={values.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} placeholder="e.g. Opposite the mosque" />
        </Field>
        <Field label="Delivery instructions (optional)">
          <Input value={values.accessNote ?? ""} onChange={(e) => set("accessNote", e.target.value)} maxLength={240} placeholder="e.g. Truck can reach the rear gate" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City">
          <Input value={values.city} onChange={(e) => set("city", e.target.value)} required />
        </Field>
        <Field label="State">
          <Input value={values.state} onChange={(e) => set("state", e.target.value)} required />
        </Field>
        {manual ? (
          <Field label="Pincode">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={values.pincode}
              onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
              required
            />
          </Field>
        ) : null}
      </div>
      <p className="-mt-2 text-xs font-semibold text-neutral-500">{STATE_FROM_PINCODE_NOTE}</p>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-neutral-700">
        <input
          type="checkbox"
          checked={values.isDefault}
          onChange={(e) => set("isDefault", e.target.checked)}
          className="size-4 cursor-pointer accent-brand-deep"
        />
        Set as default address
      </label>

      {error && <p role="alert" className="text-sm font-bold text-danger">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : "Save address"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
