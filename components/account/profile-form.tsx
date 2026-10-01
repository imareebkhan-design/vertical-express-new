"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validators";
import type { EditableProfile } from "@/actions/profile";

type BuyerType = NonNullable<EditableProfile["buyerType"]>;

/* The onboarding step's own wording (role-select-view.tsx). */
const BUYER_TYPES: { value: BuyerType; label: string }[] = [
  { value: "contractor", label: "Contractor / Site supervisor" },
  { value: "homeowner", label: "Homeowner renovating" },
  { value: "designer", label: "Interior designer or architect" },
];

/** The onboarding wording for a buyer type, or null when none was chosen. */
export function buyerTypeLabel(value: EditableProfile["buyerType"]): string | null {
  return BUYER_TYPES.find((b) => b.value === value)?.label ?? null;
}

type Field = "fullName" | "buyerType" | "companyName" | "gstin";

export interface ProfileFormProps {
  initial: EditableProfile;
  /** Sign-in identity, shown and not editable. */
  phone: string | null;
  email: string | null;
  /** `updateMyProfile` in the app; injected so the form renders without a server. */
  save: (input: Partial<Record<Field, string | null>>) => Promise<ActionResult<EditableProfile>>;
  onSaved?: (profile: EditableProfile) => void;
}

/**
 * Name, buyer type and business details — `/account/profile`, both widths.
 *
 * Validation is the server's (the same rules the app's `/me` uses); this shows
 * its answer against the field it names. Nothing here says the GSTIN reaches an
 * invoice: no invoice carries a customer GSTIN today.
 */
export function ProfileForm({ initial, phone, email, save, onSaved }: ProfileFormProps) {
  const id = useId();
  const [values, setValues] = useState({
    fullName: initial.fullName ?? "",
    buyerType: initial.buyerType,
    companyName: initial.companyName ?? "",
    gstin: initial.gstin ?? "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (status === "saved") setStatus("idle");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus("saving");

    const name = values.fullName.trim();
    const input: Partial<Record<Field, string | null>> = {
      /* A name cannot be cleared (the app's rule too). Blank and never set is
         simply not sent; blank after having one is sent, and refused. */
      ...(name || initial.fullName ? { fullName: name } : {}),
      ...(values.buyerType ? { buyerType: values.buyerType } : {}),
      companyName: values.companyName.trim() || null,
      gstin: values.gstin.trim() || null,
    };

    try {
      const res = await save(input);
      if (!res.ok) {
        const field = (["fullName", "buyerType", "companyName", "gstin"] as const).find((f) => f === res.error.field);
        setError({ field, message: res.error.message });
        setStatus("idle");
        return;
      }
      setValues({
        fullName: res.data.fullName ?? "",
        buyerType: res.data.buyerType,
        companyName: res.data.companyName ?? "",
        gstin: res.data.gstin ?? "",
      });
      setStatus("saved");
      onSaved?.(res.data);
    } catch {
      setError({ message: "We couldn't save that. Check your connection and try again." });
      setStatus("idle");
    }
  };

  const fieldError = (f: Field) => (error?.field === f ? error.message : null);
  const describe = (f: Field) => (fieldError(f) ? `${id}-${f}-error` : undefined);

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="rounded-[26px] border border-line bg-paper p-6 shadow-card">
        <h2 className="mb-4 text-sm font-extrabold uppercase tracking-widest text-ink-500">Your details</h2>
        <div className="space-y-4">
          <Labelled label="Full name" htmlFor={`${id}-fullName`} error={fieldError("fullName")} errorId={describe("fullName")}>
            <Input
              id={`${id}-fullName`}
              value={values.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              autoComplete="name"
              maxLength={80}
              aria-invalid={fieldError("fullName") ? true : undefined}
              aria-describedby={describe("fullName")}
            />
          </Labelled>

          <fieldset aria-describedby={describe("buyerType")}>
            <legend className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">
              You&apos;re buying as
            </legend>
            <div className="flex flex-wrap gap-2">
              {BUYER_TYPES.map((b) => (
                <label
                  key={b.value}
                  className={`cursor-pointer rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
                    values.buyerType === b.value ? "border-brand-deep bg-brand-deep text-white" : "border-neutral-200 hover:border-brand-deep"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-buyerType`}
                    value={b.value}
                    checked={values.buyerType === b.value}
                    onChange={() => set("buyerType", b.value)}
                    className="sr-only"
                  />
                  {b.label}
                </label>
              ))}
            </div>
            {fieldError("buyerType") ? <FieldError id={describe("buyerType")} message={fieldError("buyerType")!} /> : null}
          </fieldset>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-widest text-neutral-500">Phone</dt>
              <dd className="mt-1 font-semibold text-ink">{phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-widest text-neutral-500">Email</dt>
              <dd className="mt-1 font-semibold text-ink">{email ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-xs font-medium text-ink-500">Your phone and email are how you sign in, so they can&apos;t be changed here.</p>
        </div>
      </section>

      <section className="rounded-[26px] border border-line bg-paper p-6 shadow-card">
        <h2 className="mb-1 text-sm font-extrabold uppercase tracking-widest text-ink-500">Business &amp; GST</h2>
        <p className="mb-4 text-sm font-medium text-ink-700">
          Your firm&apos;s name and GST registration, if you buy for a business. Leave both empty if you don&apos;t.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled label="Business name" htmlFor={`${id}-companyName`} error={fieldError("companyName")} errorId={describe("companyName")}>
            <Input
              id={`${id}-companyName`}
              value={values.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              autoComplete="organization"
              maxLength={120}
              aria-invalid={fieldError("companyName") ? true : undefined}
              aria-describedby={describe("companyName")}
            />
          </Labelled>
          <Labelled label="GSTIN" htmlFor={`${id}-gstin`} error={fieldError("gstin")} errorId={describe("gstin")}>
            <Input
              id={`${id}-gstin`}
              value={values.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={15}
              placeholder="15 characters"
              aria-invalid={fieldError("gstin") ? true : undefined}
              aria-describedby={describe("gstin")}
            />
          </Labelled>
        </div>
      </section>

      {error && !error.field ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error.message}
        </p>
      ) : null}
      {status === "saved" ? (
        <p role="status" className="text-sm font-semibold text-ink-700">
          Saved.
        </p>
      ) : null}

      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Saving…
          </>
        ) : (
          "Save changes"
        )}
      </Button>
    </form>
  );
}

function Labelled({
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  error: string | null;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">
        {label}
      </label>
      {children}
      {error ? <FieldError id={errorId} message={error} /> : null}
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-semibold text-danger">
      {message}
    </p>
  );
}
