"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { saveAddress } from "@/actions/address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AddressFormValues {
  id?: string;
  label: "home" | "site" | "office" | "other";
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const LABELS: AddressFormValues["label"][] = ["home", "site", "office", "other"];

export function AddressForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: Partial<AddressFormValues>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<AddressFormValues>({
    label: initial?.label ?? "home",
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    landmark: initial?.landmark ?? "",
    city: initial?.city ?? "Srinagar",
    state: initial?.state ?? "Jammu & Kashmir",
    pincode: initial?.pincode ?? "",
    isDefault: initial?.isDefault ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof AddressFormValues>(k: K, v: AddressFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveAddress(values, initial?.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
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

      <Field label="Address line 1">
        <Input value={values.line1} onChange={(e) => set("line1", e.target.value)} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 2 (optional)">
          <Input value={values.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
        </Field>
        <Field label="Landmark (optional)">
          <Input value={values.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City">
          <Input value={values.city} onChange={(e) => set("city", e.target.value)} required />
        </Field>
        <Field label="State">
          <Input value={values.state} onChange={(e) => set("state", e.target.value)} required />
        </Field>
        <Field label="Pincode">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={values.pincode}
            onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-neutral-700">
        <input
          type="checkbox"
          checked={values.isDefault}
          onChange={(e) => set("isDefault", e.target.checked)}
          className="size-4 cursor-pointer accent-brand-deep"
        />
        Set as default address
      </label>

      {error && <p className="text-sm font-bold text-danger">{error}</p>}

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
