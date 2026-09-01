"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { adminSaveProduct } from "@/actions/products";
import { OpsTable } from "@/components/admin/ops-table";
import { formatPaise } from "@/lib/money";
import { PlaceholderValue } from "@/components/ui/placeholder-value";

/**
 * The product editor — artboard 10.
 *
 * Editable here: name, slug, status, brand, delivery speed. Those are the
 * decisions a shopkeeper makes, and every one of them was previously locked in
 * a seed file behind a deploy.
 *
 * Read-only here: tax and variants. HSN and GST rate come from the category's
 * confirmed configuration rather than a text box, because a rate typed on the
 * wrong screen is a tax error on every order of that category. Prices and stock
 * live on variants and warehouses under their own rules — pricing is
 * server-authoritative deliberately, and this is not the place to relax it.
 */
type Product = {
  id: string;
  title: string;
  slug: string;
  status: string;
  brandId: string;
  categoryName: string;
  categoryGroup: string;
  categoryIsBulk: boolean;
  deliverySpeed: string;
  hsn: string | null;
  gstRatePct: number | null;
  variants: {
    id: string;
    name: string;
    sku: string;
    pricePaise: number;
    compareAtPaise: number | null;
    onHand: number;
  }[];
};

export function ProductEditor({
  product,
  brands,
}: {
  product: Product;
  brands: { id: string; name: string }[];
}) {
  const [form, setForm] = useState({
    title: product.title,
    slug: product.slug,
    brandId: product.brandId,
    status: product.status,
    deliverySpeed: product.deliverySpeed,
  });
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = () => {
    setMessage(null);
    start(async () => {
      const res = await adminSaveProduct({ id: product.id, ...form });
      setMessage(
        res.ok
          ? { ok: true, text: "Saved. Live on the storefront now." }
          : { ok: false, text: res.error.message }
      );
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/product/${product.slug}`}
          className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold leading-10 text-ink no-underline"
        >
          View on site
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {message && (
          <p
            className={"text-[12.5px] font-semibold " + (message.ok ? "text-ink" : "text-ops-bad")}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>

      <Section title="Basics">
        <Field label="Product name">
          <input value={form.title} onChange={(e) => set("title")(e.target.value)} className={field} />
        </Field>
        <Field label="Brand">
          <select value={form.brandId} onChange={(e) => set("brandId")(e.target.value)} className={field}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Slug" hint="Changing this breaks every link anybody saved or shared.">
          <input value={form.slug} onChange={(e) => set("slug")(e.target.value)} className={field} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set("status")(e.target.value)} className={field}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <Field label="Category">
          <p className="text-[13px] font-semibold text-ink-700">
            {product.categoryName} · {product.categoryGroup}
          </p>
        </Field>
      </Section>

      <Section title="Fulfilment">
        <Field
          label="Delivery speed"
          hint="The category decides unless you say otherwise. A 5 kg bag of white cement does not need a truck; a 40-piece box of tiles does."
        >
          <select
            value={form.deliverySpeed}
            onChange={(e) => set("deliverySpeed")(e.target.value)}
            className={field}
          >
            <option value="">
              Inherit from category ({product.categoryIsBulk ? "heavy — by truck" : "fast"})
            </option>
            <option value="express">Fast — out from the store</option>
            <option value="scheduled">Heavy — by truck</option>
          </select>
        </Field>
        <Field label="Unit weight">
          <p className="text-[13px] font-semibold text-ink-700">
            <PlaceholderValue pending="no weight field exists; a truck load cannot be planned without one">
              Not recorded
            </PlaceholderValue>
          </p>
        </Field>
      </Section>

      <Section title="Tax">
        <Field label="HSN code">
          <p className="text-[13px] font-semibold text-ink-700">{product.hsn ?? "—"}</p>
        </Field>
        <Field label="GST rate">
          <p className="text-[13px] font-semibold text-ink-700">
            {product.gstRatePct !== null ? `${product.gstRatePct}%` : "—"}
          </p>
        </Field>
        <Field label="Tax treatment">
          <p className="text-[13px] font-semibold text-ink-700">
            Price is inclusive — tax is extracted from it, not added on top.
          </p>
        </Field>
        <p className="mt-1 max-w-[620px] text-[12px] font-medium leading-[17px] text-ink-700">
          Set per category, not per product, and not editable here: a rate typed on the
          wrong screen becomes a tax error on every order in that category. The rates in
          use are owner-confirmed; changing one is a decision for the CA, not a form field.
        </p>
      </Section>

      <Section title="Variants and pricing">
        <OpsTable
          columns={["Variant", "SKU", "MRP", "Selling", "On hand"]}
          rows={product.variants.map((v) => [
            v.name,
            v.sku,
            v.compareAtPaise ? formatPaise(v.compareAtPaise) : "—",
            formatPaise(v.pricePaise),
            String(v.onHand),
          ])}
          emptyTitle="No variants."
          emptyNote="A product needs at least one variant to be buyable."
        />
        <p className="mt-2 text-[12px] font-medium text-ink-700">
          Read-only. Price and stock are server-authoritative — the cart sends a variant
          and a quantity and never a price — and editing them from here would need the
          same guarantees the checkout path already has.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block max-w-[420px]">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-medium text-ink-500">{hint}</span>}
    </label>
  );
}
