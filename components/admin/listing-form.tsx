"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminListProduct } from "@/actions/listing";
import { parsePincodeList } from "@/lib/pincode";

/**
 * Listing a product.
 *
 * The console could edit a product and not create one, so everything in the
 * catalogue arrived from a seed file. This is the form that changes that.
 *
 * It always saves a draft. A product that does not exist yet has no approved
 * photo, so the publish check refused "published" from here every time; the
 * option only produced an error. Saving opens the product's own page, where
 * the photo is added and the remaining steps to publication are listed.
 *
 * Each field says which of two things it is: needed to save the draft, or
 * needed before the product can be published (and fillable later). The rule
 * for the second kind is the publish check itself
 * (lib/services/admin/publish-guard.ts), not this form.
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
    /** What "product type" is called in this category: "Grade" for cement, "Type" for tile. */
    typeLabel: string;
  }[];
  warehouses: { id: string; name: string; city: string }[];
}

const BLANK = {
  title: "",
  slug: "",
  brandId: "",
  categoryId: "",
  description: "",
  productType: "",
  unitLabel: "per piece",
  deliverySpeed: "" as "" | "express" | "scheduled",
  status: "draft" as const,
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

/** The item code a web address gets, matching `skuForSlug` in lib/catalogue-csv.ts. */
const skuFor = (slug: string) => (slug ? `VE-${slug.toUpperCase()}`.slice(0, 48) : "");

export function ListingForm({ options }: { options: ListingOptions }) {
  const router = useRouter();
  /* One warehouse is the normal case, and a product with no stock record
     cannot be published, so the only warehouse is chosen already. */
  const blank = { ...BLANK, warehouseId: options.warehouses.length === 1 ? options.warehouses[0].id : "" };
  const [form, setForm] = useState({ ...blank });
  const [slugTouched, setSlugTouched] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; slug?: string } | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onTitle = (v: string) => {
    setForm((f) => {
      const slug = slugTouched ? f.slug : slugify(v);
      return { ...f, title: v, slug, sku: skuTouched ? f.sku : skuFor(slug) };
    });
  };

  const category = options.categories.find((c) => c.id === form.categoryId);

  const submit = () => {
    setResult(null);
    start(async () => {
      const res = await adminListProduct(form);
      if (res.ok) {
        /* Straight to the product's own page: the photo is added there, and
           its checklist says what is left before it can be published. */
        setResult({ ok: true, text: `${form.title} saved as a draft. Opening it…`, slug: res.data.slug });
        router.push(`/admin/products/${res.data.slug}`);
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

      <p className="rounded-panel bg-ops-info-tint p-3.5 text-[12px] font-semibold leading-relaxed text-ops-info">
        This saves a <strong>draft</strong>: customers cannot see it. Fields marked{" "}
        <Need kind="required" /> are needed to save. Fields marked <Need kind="publish" /> can be left for
        later, but the product cannot be published without them. The photo is added on the next screen.
      </p>

      <Section title="What it is">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Product name" need="required" hint="As a customer will read it on the shelf.">
            <input
              value={form.title}
              onChange={(e) => onTitle(e.target.value)}
              placeholder="PPC Cement, 50 kg bag"
              aria-label="Product name"
              className={field}
            />
          </Field>

          <Field label="Brand" need="required" hint="What is actually in the bag. Only you can say.">
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

          <Field label="Category" need="required" hint="Decides the tax rate and how it travels.">
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

          <Field
            label={category ? `Product type — ${category.typeLabel.toLowerCase()}` : "Product type"}
            hint={
              category
                ? `What customers choose ${category.name.toLowerCase()} by. Shown under “Shop by ${category.typeLabel.toLowerCase()}” and in the filters. Optional.`
                : "Choose a category first; it decides what this is called."
            }
          >
            <input
              value={form.productType}
              onChange={(e) => set("productType", e.target.value)}
              disabled={!category}
              aria-label="Product type"
              className={field}
            />
          </Field>

          <Field label="Web address" need="required" hint="Auto-filled from the name. Changing it later breaks saved links.">
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

      <Section title="Pack and price">
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          The first pack this product is sold in. More sizes and packs can be added afterwards on
          the product&rsquo;s page.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Pack size" need="required" hint="What one unit is: “50 kg bag”, “20 litre bucket”, “box of 10”.">
            <input
              value={form.variantName}
              onChange={(e) => set("variantName", e.target.value)}
              placeholder="50 kg bag"
              aria-label="Variant name"
              className={field}
            />
          </Field>

          <Field label="Sold as" need="required" hint="The unit on the price. “per bag”, “per piece”, “per metre”.">
            <input
              value={form.unitLabel}
              onChange={(e) => set("unitLabel", e.target.value)}
              aria-label="Unit label"
              className={field}
            />
          </Field>

          <Field label="Item code (SKU)" need="required" hint="Auto-filled. Must be unique, and is never reused.">
            <input
              value={form.sku}
              onChange={(e) => {
                setSkuTouched(true);
                set("sku", e.target.value.toUpperCase());
              }}
              placeholder="VE-PPC-50"
              aria-label="SKU"
              className={field}
            />
          </Field>

          <Field label="Selling price" need="required" hint="In rupees, inclusive of GST.">
            <input
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              inputMode="decimal"
              placeholder="320"
              aria-label="Selling price in rupees"
              className={field}
            />
          </Field>

          <Field label="MRP" need="publish" hint="The printed MRP. The selling price can equal it or be lower, never higher.">
            <input
              value={form.mrp}
              onChange={(e) => set("mrp", e.target.value)}
              inputMode="decimal"
              placeholder="as printed on the pack"
              aria-label="MRP in rupees"
              className={field}
            />
          </Field>
        </div>
      </Section>

      <Section title="Stock and delivery">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Warehouse" need="publish" hint="Where this sits. Choosing one creates its stock record.">
            <select
              value={form.warehouseId}
              onChange={(e) => set("warehouseId", e.target.value)}
              aria-label="Warehouse"
              className={field}
            >
              <option value="">No stock record yet</option>
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
            need="publish"
            hint="Fast or heavy has to be chosen for this product before its price review can be recorded."
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
                  /* The same parser the action validates with, rather than a
                     second copy of the rule that can drift from it. */
                  const { valid, invalid } = parsePincodeList(form.expressPincodes);
                  if (valid.length === 0 && invalid.length === 0) {
                    return "No pincode yet, so express is offered nowhere.";
                  }
                  if (invalid.length > 0) return `Not a pincode: ${invalid.slice(0, 3).join(", ")}`;
                  return `${valid.length} pincode${valid.length === 1 ? "" : "s"}.`;
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
          explanation from its first day. The photo is added on the next screen, where its
          source and licence are recorded with it.
        </p>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !ready}
          className="h-11 rounded-panel bg-ink px-6 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save draft and add photo"}
        </button>
        <button
          type="button"
          onClick={() => {
            setForm({ ...blank });
            setSlugTouched(false);
            setSkuTouched(false);
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

/** Which of the two kinds of "needed" a field is. */
function Need({ kind }: { kind: "required" | "publish" }) {
  return kind === "required" ? (
    <span className="rounded-chip bg-ink px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-white">
      Required
    </span>
  ) : (
    <span className="rounded-chip bg-ops-warn-tint px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-ops-warn">
      Before publishing
    </span>
  );
}

function Field({
  label,
  hint,
  need,
  children,
}: {
  label: string;
  hint?: string;
  need?: "required" | "publish";
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
        {need && <Need kind={need} />}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-medium text-ink-500">{hint}</span>}
    </label>
  );
}
