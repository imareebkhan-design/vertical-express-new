"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { adminSaveProduct, adminSetVariantPrice } from "@/actions/products";
import { OpsTable } from "@/components/admin/ops-table";
import { VariantPriceRow } from "@/components/admin/variant-price-row";
import { PlaceholderValue } from "@/components/ui/placeholder-value";

/**
 * The product editor — artboard 10.
 *
 * Editable here: name, slug, status, brand, delivery speed. Those are the
 * decisions a shopkeeper makes, and every one of them was previously locked in
 * a seed file behind a deploy.
 *
 * Variant prices are editable per row (ISS-068): parsed on the server, refused
 * from a stale screen, audited in the same transaction.
 *
 * Read-only here: tax and stock. HSN and GST rate come from the category's
 * confirmed configuration rather than a text box, because a rate typed on the
 * wrong screen is a tax error on every order of that category.
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
  images: { id: string; url: string; alt: string; isPrimary: boolean }[];
  variants: {
    id: string;
    name: string;
    sku: string;
    pricePaise: number;
    compareAtPaise: number | null;
    onHand: number;
    stock: {
      warehouseId: string;
      warehouse: string;
      city: string;
      onHand: number;
      committed: number;
      lowStockThreshold: number;
    }[];
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
          ? { ok: true, text: "Product details saved. Live on the storefront now." }
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
            <option value="catalog_only">Catalogue only — shown, not for sale</option>
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
          hint="The category decides unless you say otherwise. A 5 kg bag of white cement does not need a truck; a 40-piece box of tiles does. Set per product, not per variant as the artboard has it — a bundle of ten bags travels the way one bag does, and the variant-level version would mean a cart whose two rows of the same product split across vehicles."
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
        <Field label="Seasonal override">
          <p className="text-[13px] font-semibold text-ink-700">
            <PlaceholderValue pending="no seasonal rule is stored or applied anywhere; see Serviceability">
              Not set
            </PlaceholderValue>
          </p>
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

      <Section title="Images">
        {product.images.length === 0 ? (
          <p className="text-[12.5px] font-semibold text-ink-700">
            No images. The product will render with a placeholder on the storefront.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {product.images.map((img) => (
              <figure key={img.id} className="w-[132px]">
                {/* Plain img: these are catalogue URLs of unknown origin and
                    dimensions, and next/image would need both. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt}
                  className="h-[100px] w-full rounded-field bg-chip-soft object-cover"
                />
                <figcaption className="mt-1 text-[11px] font-semibold text-ink-500">
                  {img.isPrimary ? "Primary" : img.alt || "No alt text"}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Read-only. Uploading needs somewhere to put the file — there is no object store
          configured, and a URL field that accepts anything typed into it is how a
          manufacturer&rsquo;s photography ends up on our catalogue without a licence.
        </p>
      </Section>

      <Section title="Stock by warehouse">
        <OpsTable
          columns={["Variant", "Warehouse", "On hand", "Committed", "Available", "Reorder at"]}
          rows={product.variants.flatMap((v) =>
            v.stock.map((s) => [
              v.name,
              `${s.warehouse} · ${s.city}`,
              String(s.onHand),
              String(s.committed),
              String(s.onHand - s.committed),
              String(s.lowStockThreshold),
            ])
          )}
          emptyTitle="No stock record."
          emptyNote="This product has no inventory row at any warehouse, so the storefront treats every variant as out of stock."
        />
        <p className="mt-2 text-[12px] font-medium leading-[17px] text-ink-700">
          &ldquo;Reorder at&rdquo; is the low-stock threshold. Raising a purchase order
          from here needs a supplier and a purchase-order model; neither exists yet.
        </p>
      </Section>

      <Section title="Genuineness">
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Batch tracking, shelf life and a photo at dispatch are the three things that
          settle an argument about whether a bag of cement was fresh and was ours. None of
          them is recorded: there is no batch field at goods receipt, no shelf-life
          property on a product, and no proof-of-delivery capture. Cement genuinely does
          go off, so this is the panel most worth building next on this screen — but it
          needs a receiving process before it needs a form.
        </p>
      </Section>

      <Section title="Audit">
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Price changes are recorded in the audit log with who made them and the previous
          price. A status change and a brand reassignment still go only to the application
          log, where nobody can read them here — ISS-015. Showing the price history on this
          screen (the artboard&rsquo;s &ldquo;who changed this price&rdquo;) is not built yet.
        </p>
      </Section>

      <Section title="Variants and pricing">
        {product.variants.length === 0 ? (
          <OpsTable
            columns={["Variant", "SKU", "MRP", "Selling", "On hand"]}
            rows={[]}
            emptyTitle="No variants."
            emptyNote="A product needs at least one variant to be buyable."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {product.variants.map((v) => (
              <VariantPriceRow key={v.id} variant={v} field={field} save={adminSetVariantPrice} />
            ))}
          </div>
        )}
        <p className="mt-2 max-w-[620px] text-[12px] font-medium leading-[17px] text-ink-700">
          Prices include GST. A change applies to new orders only — orders already placed
          keep the price they were placed at. A customer whose checkout still shows the old
          total is asked to check the new one before paying. Each change is recorded with
          who made it and the previous price. Stock is not edited here.
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
