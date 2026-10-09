"use client";

import { useId, useState, useTransition } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/validators";

type Submit = (input: Record<string, string>) => Promise<ActionResult<{ enquiryNo: string }>>;

const FIELD =
  "w-full rounded-field border border-neutral-300 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-neutral-400 focus:border-ink focus:outline-none";

/**
 * "Enquire about this product" — catalog-only products only. Submits to the
 * admin enquiry queue. It promises a reply and nothing more: no phone number,
 * WhatsApp or response time is confirmed yet, so none is shown.
 *
 * The submit action is a prop so the form renders in component tests;
 * `product-enquiry.tsx` binds the real server action.
 */
export function ProductEnquiryForm({ productId, productTitle, submit }: { productId: string; productTitle: string; submit: Submit }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const id = useId();

  if (done) {
    return (
      <p role="status" className="rounded-panel bg-surface px-4 py-3 text-sm font-bold text-ink">
        Enquiry sent — reference {done}. The team will contact you about this product.
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="lg" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <MessageSquareText aria-hidden /> Enquire about this product
      </Button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const els = e.currentTarget.elements;
    const v = (name: string) => (els.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
    setError(null);
    start(async () => {
      const r = await submit({
        productId,
        name: v("name"),
        phone: v("phone"),
        quantity: v("quantity"),
        message: v("message"),
        website: v("website"),
      });
      if (r.ok) setDone(r.data.enquiryNo);
      else setError(r.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Enquire about ${productTitle}`} className="space-y-3 rounded-panel border border-neutral-200 p-4">
      <p className="text-sm font-extrabold text-ink">Enquire about this product</p>
      <label className="block" htmlFor={`${id}-name`}>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">Your name</span>
        <input id={`${id}-name`} name="name" required minLength={2} maxLength={80} autoComplete="name" className={FIELD} />
      </label>
      <label className="block" htmlFor={`${id}-phone`}>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">Mobile number</span>
        <input id={`${id}-phone`} name="phone" required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national" className={FIELD} />
      </label>
      <label className="block" htmlFor={`${id}-qty`}>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">Quantity or pack (optional)</span>
        <input id={`${id}-qty`} name="quantity" maxLength={80} placeholder="e.g. 2 units" className={FIELD} />
      </label>
      <label className="block" htmlFor={`${id}-msg`}>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">Message (optional)</span>
        <textarea id={`${id}-msg`} name="message" rows={3} maxLength={1000} className={FIELD} />
      </label>
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {error && <p role="alert" className="text-sm font-bold text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-label="Sending" /> : "Send enquiry"}
      </Button>
    </form>
  );
}
