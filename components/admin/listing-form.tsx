"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminListProduct } from "@/actions/listing";

/**
 * Listing a product.
 *
 * The console could edit a product and not create one, so everything in the
 * catalogue arrived from a seed file. This is the form that changes that.
 *
 * It defaults to draft. Publishing straight from a create form means a
 * half-finished listing — no description, a placeholder price, no stock — is
 * live on the storefront the moment somebody is interrupted mid-typing. Draft
 * first, look at it, then publish is how every catalogue tool worth using does
 * it, and the publish control is one field away rather than hidden.
 */
export interface ListingOptions {
  brands: { id: string; name: string }[];
  /* Tax comes down with the category rather than being looked up here. The
     rate table is server-only and is the single source of truth for what a
     customer is charged; a client-side copy of it would drift, and the version
     that drifts is the one on the screen where somebody sets a price. */
  categories: {
    id: string;
    name: string;
    slug: string;
    group: string;
    isBulk: boolean;
    hsn: string | null;
    gstRatePct: number | null;
  }[];
  warehouses: { id: string; name: string; city: string }[];
}

const BLANK = {
  title: "",
  slug: "",
  brandId: "",
  categoryId: "",
  description: "",
  unitLabel: "per piece",
  deliverySpeed: "" as "" | "express" | "scheduled",
  status: "draft" as "draft" | "published",
  variantName: "",
  sku: "",
  price: "",
  mrp: "",
  warehouseId: "",
  openingStock: "",
  expressEligible: false,
  expressPincodes: "",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);

export function ListingForm({ options }: { options: ListingOptions }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...BLANK });
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; slug?: string } | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onTitle = (v: string) => {
    setForm((f) => ({ ...f, title: v, slug: slugTouched ? f.slug : slugify(v) }));
  };

  const category = options.categories.find((c) => c.id === form.categoryId);

  const submit = () => {
    setResult(null);
    start(async () => {
      const res = await adminListProduct(form);
      if (res.ok) {
        setResult({
          ok: true,
          text: `${form.title} listed as ${form.status}.`,
          slug: res.data.slug,
        });
        setForm({ ...BLANK });
        setSlugTouched(false);
        router.refresh();
      } else {
        setResult({ ok: false, text: res.error.message });
      }
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  const ready =
    form.title.trim().length >= 4 &&
    form.slug.trim().length >= 3 &&
    form.brandId !== "" &&
    form.categoryId !== "" &&
    form.variantName.trim() !== "" &&
    form.sku.trim().length >= 3 &&
    form.price.trim() !== "";

  return (
    <div className="flex flex-col gap-5">
      {result && (
        <p
          className={
            "rounded-panel p-3.5 text-[12.5px] font-semibold " +
            (result.ok ? "bg-chip-soft text-ink" : "bg-ops-bad-tint text-ops-bad")
          }
          role="status"
        >
          {result.text}{" "}
          {result.ok && result.slug && (
            <Link href={`/admin/products/${result.slug}`} className="font-bold text-ink underline">
              Open it
            </Link>
          )}
        </p>
      )}

      <Section title="What it is">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Product name" hint="As a customer will read it on the shelf.">
            <input
              value={form.title}
              onChange={(e) => onTitle(e.target.value)}
              placeholder="PPC Cement, 50 kg bag"
              aria-label="Product name"
              className={field}
            />
          </Field>

          <Field label="Brand" hint="What is actually in the bag. Only you can say.">
            <select
              value={form.brandId}
              onChange={(e) => set("brandId", e.target.value)}
              aria-label="Brand"
              className={field}
            >
              <option value="">Choose a brand…</option>
              {options.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category" hint="Decides the tax rate and how it travels.">
            <select
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              aria-label="Category"
              className={field}
            >
              <option value="">Choose a category…</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Web address" hint="Auto-filled from the name. Changing it later breaks saved links.">
            <input
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              placeholder="ppc-cement-50kg"
              aria-label="Slug"
              className={field}
            />
          </Field>

          <Field label="Sold as" hint="The unit on the price. “per bag”, “per piece”, “per metre”.">
            <input
              value={form.unitLabel}
              onChange={(e) => set("unitLabel", e.target.value)}
              aria-label="Unit label"
              className={field}
            />
          </Field>

          <Field label="Status" hint="Draft until you have looked at it on the storefront.">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as "draft" | "published")}
              aria-label="Status"
              className={field}
            >
              <option value="draft">Draft — not visible to customers</option>
              <option value="published">Published — on sale immediately</option>
            </select>
          </Field>
        </div>

        <Field label="Description" hint="Optional. What a builder needs to know before buying it.">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            aria-label="Description"
            className="w-full rounded-field bg-chip-soft px-3.5 py-2.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
        </Field>

        {category && category.gstRatePct !== null && (
          <p className="text-[12px] font-medium leading-[17px] text-ink-700">
            Tax follows the category: HSN {category.hsn}, GST {category.gstRatePct}%. Prices
            you enter below are inclusive of it — the tax is extracted, never added on top.
          </p>
        )}
      </Section>

      <Section title="The first variant">
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Every product needs at least one, or there is nothing for a customer to add to a
          cart. More sizes and packs can be added afterwards.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Variant" hint="The size or pack.">
            <input
              value={form.variantName}
              onChange={(e) => set("variantName", e.target.value)}
              placeholder="50 kg bag"
              aria-label="Variant name"
              className={field}
            />
          </Field>

          <Field label="SKU" hint="Your own code. Must be unique.">
            <input
              value={form.sku}
              onChange={(e) => set("sku", e.target.value.toUpperCase())}
              placeholder="VE-PPC-50"
              aria-label="SKU"
              className={field}
            />
          </Field>

          <Field label="Selling price" hint="In rupees, inclusive of GST.">
            <input
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              inputMode="decimal"
              placeholder="320"
              aria-label="Selling price in rupees"
              className={field}
            />
          </Field>

          <Field label="MRP" hint="Optional. Must be above the selling price, or leave it blank.">
            <input
              value={form.mrp}
              onChange={(e) => set("mrp", e.target.value)}
              inputMode="decimal"
              placeholder="no discount shown"
              aria-label="MRP in rupees"
              className={field}
            />
          </Field>
        </div>
      </Section>

      <Section title="Stock and delivery">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Warehouse" hint="Where this sits. Needed before it can be sold.">
            <select
              value={form.warehouseId}
              onChange={(e) => set("warehouseId", e.target.value)}
              aria-label="Warehouse"
              className={field}
            >
              <option value="">Not stocked yet</option>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.city}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Opening stock" hint="How many are on the shelf right now. Zero is fine.">
            <input
              value={form.openingStock}
              onChange={(e) => set("openingStock", e.target.value)}
              inputMode="numeric"
              placeholder="0"
              aria-label="Opening stock"
              className={field}
            />
          </Field>

          <Field
            label="Delivery"
            hint="The category decides unless you say otherwise."
          >
            <select
              value={form.deliverySpeed}
              onChange={(e) => set("deliverySpeed", e.target.value as typeof form.deliverySpeed)}
              aria-label="Delivery speed"
              className={field}
            >
              <option value="">
                Inherit from category
                {category ? ` (${category.isBulk ? "heavy — by truck" : "fast"})` : ""}
              </option>
              <option value="express">Fast — out from the store</option>
              <option value="scheduled">Heavy — by truck</option>
            </select>
          </Field>
        </div>

        {/*
          The 60-minute run.

          Separate from "Delivery" above, which is a class — bike or truck — and
          decides how an order splits into shipments. This is a promise: that
          this product reaches this pincode within the hour, and that the
          customer is charged for it. A product can be fast-class and not
          promised in an hour.

          Two controls because they answer different questions, and because
          turning the promise off should not lose the pincode list it was set up
          with. Off means off whatever the list says.
        */}
        <div className="mt-5 rounded-[14px] border border-line bg-hush/40 p-4">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={form.expressEligible}
              onChange={(e) => set("expressEligible", e.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-ink"
            />
            <span>
              <span className="block text-[13.5px] font-bold text-ink">
                Offer 60-minute delivery for this product
              </span>
              <span className="mt-0.5 block text-[12px] font-medium leading-[17px] text-ink-700">
                Only where you list a pincode below. A customer outside them gets standard
                delivery, and an order that mixes this with a product without it can be
                taken together on standard at no extra charge.
              </span>
            </span>
          </label>

          {form.expressEligible && (
            <div className="mt-3.5">
              <Field
                label="Pincodes it covers"
                hint="Six digits, Srinagar and J&amp;K only. Separate with commas or new lines."
              >
                <textarea
                  value={form.expressPincodes}
                  onChange={(e) => set("expressPincodes", e.target.value)}
                  rows={2}
                  placeholder="190001, 190002, 190014"
                  aria-label="Express delivery pincodes"
                  className={field}
                />
              </Field>
              <p className="mt-1.5 text-[12px] font-medium text-ink-700">
                {(() => {
                  const pins = form.expressPincodes
                    .split(/[\s,]+/)
                    .map((t) => t.trim())
                    .filter(Boolean);
                  const good = [...new Set(pins.filter((t) => /^19\d{4}$/.test(t)))];
                  const bad = pins.filter((t) => !/^19\d{4}$/.test(t));
                  if (pins.length === 0) return "No pincode yet, so express is offered nowhere.";
                  if (bad.length > 0) return `Not a pincode: ${bad.slice(0, 3).join(", ")}`;
                  return `${good.length} pincode${good.length === 1 ? "" : "s"}.`;
                })()}
              </p>
            </div>
          )}

          {/* The fee is a price, so it is not set here. Express cannot be
              offered at all until it exists — see lib/services/express-delivery.ts. */}
          <p className="mt-3 border-t border-line pt-2.5 text-[12px] font-medium leading-[17px] text-ink-500">
            The express charge is set once for the whole shop in Settings, not per product.
            Until it is set, no product is offered on the 60-minute run.
          </p>
        </div>

        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Opening stock is recorded in the stock ledger as received, so the quantity has an
          explanation from its first day. Images cannot be added here — there is no file
          store configured, and a URL box that accepts anything typed into it is how a
          manufacturer&rsquo;s photography ends up on our catalogue without a licence.
        </p>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !ready}
          className="h-11 rounded-panel bg-ink px-6 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Listing…" : form.status === "published" ? "List and publish" : "Save as draft"}
        </button>
        <button
          type="button"
          onClick={() => {
            setForm({ ...BLANK });
            setSlugTouched(false);
            setResult(null);
          }}
          className="h-11 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink"
        >
          Clear
        </button>
      </div>
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
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-medium text-ink-500">{hint}</span>}
    </label>
  );
}
