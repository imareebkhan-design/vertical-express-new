"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { removeAddress, makeDefaultAddress } from "@/actions/address";
import { Button } from "@/components/ui/button";
import { AddressForm, type AddressFormValues } from "@/components/account/address-form";

type Address = AddressFormValues & { id: string };

export function AddressManager({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "add" | string>("list"); // string = editing id
  const [, startTransition] = useTransition();

  const done = () => {
    setMode("list");
    router.refresh();
  };

  const editing = addresses.find((a) => a.id === mode);

  if (mode === "add" || editing) {
    return (
      <div className="rounded-card border border-hairline-border bg-white p-5 shadow-card sm:p-6">
        <h2 className="mb-4 text-lg font-extrabold">{editing ? "Edit address" : "Add a new address"}</h2>
        <AddressForm initial={editing} onDone={done} onCancel={() => setMode("list")} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {addresses.length === 0 ? (
        <div className="rounded-card border border-dashed border-neutral-200 p-8 text-center">
          <MapPin className="mx-auto size-8 text-neutral-300" aria-hidden />
          <p className="mt-2 text-sm font-bold text-neutral-500">No saved addresses yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="relative rounded-card border border-hairline-border bg-white p-4 shadow-card"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-extrabold uppercase capitalize text-neutral-600">
                  {a.label}
                </span>
                {a.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-brand/20 px-2 py-0.5 text-[11px] font-extrabold uppercase text-brand-deep">
                    <Check className="size-3" /> Default
                  </span>
                )}
              </div>
              <p className="text-sm font-extrabold">{a.name}</p>
              <p className="mt-1 text-sm font-semibold text-neutral-600">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}
                {a.landmark ? `, ${a.landmark}` : ""}
                <br />
                {a.city}, {a.state} — {a.pincode}
              </p>
              <p className="mt-1 text-sm font-bold text-neutral-500">{a.phone}</p>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline-border pt-3">
                <button
                  onClick={() => setMode(a.id)}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-neutral-600 hover:text-ink"
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                {!a.isDefault && (
                  <button
                    onClick={() => startTransition(async () => { await makeDefaultAddress(a.id); router.refresh(); })}
                    className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-neutral-600 hover:text-ink"
                  >
                    <Check className="size-3.5" /> Set default
                  </button>
                )}
                <button
                  onClick={() => startTransition(async () => { await removeAddress(a.id); router.refresh(); })}
                  className="ml-auto inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-danger hover:underline"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => setMode("add")} variant="outline">
        <Plus className="size-4" /> Add new address
      </Button>
    </div>
  );
}
