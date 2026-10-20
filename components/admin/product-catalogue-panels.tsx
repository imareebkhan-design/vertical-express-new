"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/validators";

/**
 * Product details, variants and photos on the product page (handover, 19 Oct
 * 2026). Rules live in lib/services/admin/product-details.ts and
 * product-images.ts; these panels say what an edit will cost before it is made:
 *   - unit and specifications are the product's identity: changing them takes
 *     the product out of the shop until it is approved again;
 *   - any change to the variants clears the commercial review;
 *   - an uploaded photo is shown to nobody until it is approved.
 * Actions are passed in, so each panel can be tested without a server.
 */

const field =
  "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";
const label = "mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500";
const primaryButton = "h-10 rounded-field bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50";

type Message = { ok: boolean; text: string } | null;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className={"text-[12px] font-bold " + (message.ok ? "text-success" : "text-danger")}>
      {message.text}
    </p>
  );
}

/* ---------------------------------------------------------------- details */

export interface SpecRow {
  label: string;
  value: string;
}

export type SaveDetails = (input: {
  productId: string;
  description: string;
  unitLabel: string;
  specs: SpecRow[];
}) => Promise<ActionResult<{ identityReset: boolean; commercialReset: boolean }>>;

const sameSpecs = (a: SpecRow[], b: SpecRow[]) => {
  const clean = (r: SpecRow[]) => r.map((s) => ({ label: s.label.trim(), value: s.value.trim() })).filter((s) => s.label && s.value);
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
};

export function DetailsPanel({
  productId,
  description: initialDescription,
  unitLabel: initialUnit,
  specs: initialSpecs,
  save,
}: {
  productId: string;
  description: string;
  unitLabel: string;
  specs: SpecRow[];
  save: SaveDetails;
}) {
  const [saved, setSaved] = useState({ description: initialDescription, unitLabel: initialUnit, specs: initialSpecs });
  const [description, setDescription] = useState(initialDescription);
  const [unitLabel, setUnitLabel] = useState(initialUnit);
  const [specs, setSpecs] = useState<SpecRow[]>(initialSpecs);
  const [message, setMessage] = useState<Message>(null);
  const [pending, start] = useTransition();

  const identityChanging = unitLabel.trim() !== saved.unitLabel.trim() || !sameSpecs(specs, saved.specs);
  const setSpec = (i: number, k: keyof SpecRow, v: string) => setSpecs((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const submit = () => {
    setMessage(null);
    start(async () => {
      const r = await save({ productId, description, unitLabel, specs });
      if (!r.ok) {
        setMessage({ ok: false, text: r.error.message });
        return;
      }
      setSaved({ description, unitLabel, specs });
      setMessage({
        ok: true,
        text: r.data.identityReset
          ? "Saved. The product has left the shop until its identity is approved again in Catalogue approvals."
          : r.data.commercialReset
            ? "Saved. The price and stock review was cleared; review it again before selling."
            : "Saved.",
      });
    });
  };

  return (
    <Panel title="Description and specifications">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className={label}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={4}
            className="w-full rounded-field bg-chip-soft px-3.5 py-2 text-[13px] font-semibold text-ink"
          />
        </label>
        <label className="block max-w-[260px]">
          <span className={label}>Sold (unit)</span>
          <input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} maxLength={40} required placeholder="per bag" className={field} />
        </label>
        <div>
          <span className={label}>Specifications</span>
          <div className="flex flex-col gap-2">
            {specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Specification ${i + 1} name`}
                  value={s.label}
                  maxLength={60}
                  onChange={(e) => setSpec(i, "label", e.target.value)}
                  placeholder="Grade"
                  className={field + " max-w-[200px]"}
                />
                <input
                  aria-label={`Specification ${i + 1} value`}
                  value={s.value}
                  maxLength={200}
                  onChange={(e) => setSpec(i, "value", e.target.value)}
                  placeholder="OPC 53"
                  className={field}
                />
                <button
                  type="button"
                  aria-label={`Remove specification ${i + 1}`}
                  onClick={() => setSpecs((rows) => rows.filter((_, j) => j !== i))}
                  className="h-10 shrink-0 rounded-field px-3 text-[12px] font-bold text-ink-500"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {specs.length < 40 && (
            <button
              type="button"
              onClick={() => setSpecs((rows) => [...rows, { label: "", value: "" }])}
              className="mt-2 text-[12px] font-bold text-ink underline"
            >
              Add a specification
            </button>
          )}
        </div>
        {identityChanging && (
          <p role="alert" className="rounded-field bg-ops-warn-tint p-2 text-[12px] font-semibold text-ops-warn">
            The unit and specifications say what this product is. Saving a change takes it out of the shop until its identity is
            approved again in Catalogue approvals.
          </p>
        )}
        <Note message={message} />
        <div>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

/* --------------------------------------------------------------- variants */

export interface VariantRow {
  id: string;
  name: string;
  sku: string;
  price: string;
  isActive: boolean;
  isDefault: boolean;
}

export type AddVariant = (input: {
  productId: string;
  name: string;
  sku: string;
  price: string;
  mrp: string;
  warehouseId: string;
}) => Promise<ActionResult<{ variantId: string }>>;
export type SetVariantActive = (input: { variantId: string; active: boolean }) => Promise<ActionResult<null>>;
export type SetDefaultVariant = (input: { variantId: string }) => Promise<ActionResult<null>>;

const NEW_VARIANT = { name: "", sku: "", price: "", mrp: "", warehouseId: "" };

export function VariantsPanel({
  productId,
  variants,
  warehouses,
  add,
  setActive,
  setDefault,
}: {
  productId: string;
  variants: VariantRow[];
  warehouses: { id: string; name: string }[];
  add: AddVariant;
  setActive: SetVariantActive;
  setDefault: SetDefaultVariant;
}) {
  const [draft, setDraft] = useState(NEW_VARIANT);
  const [message, setMessage] = useState<Message>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof NEW_VARIANT, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const run = (work: () => Promise<ActionResult<unknown>>, done: string) => {
    setMessage(null);
    start(async () => {
      const r = await work();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error.message });
    });
  };

  return (
    <Panel title="Variants">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Variant</th>
              <th className="px-3 pb-2.5">SKU</th>
              <th className="px-3 pb-2.5 text-right">Price</th>
              <th className="px-3 pb-2.5">Status</th>
              <th className="px-3 pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className="border-t border-line">
                <td className="px-3 py-2 font-bold text-ink">{v.name}</td>
                <td className="px-3 py-2 text-ink-500">{v.sku}</td>
                <td className="px-3 py-2 text-right tabular-nums">{v.price}</td>
                <td className="px-3 py-2">{v.isDefault ? "Leads" : v.isActive ? "On sale" : <span className="text-ink-500">Retired</span>}</td>
                <td className="flex justify-end gap-3 px-3 py-2">
                  {v.isActive && !v.isDefault && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setDefault({ variantId: v.id }), `${v.name} now leads.`)}
                      className="text-[12px] font-bold text-ink underline"
                    >
                      Make default
                    </button>
                  )}
                  {!v.isDefault && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => setActive({ variantId: v.id, active: !v.isActive }), v.isActive ? `${v.name} retired.` : `${v.name} restored.`)
                      }
                      className="text-[12px] font-bold text-ink underline"
                    >
                      {v.isActive ? "Retire" : "Restore"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await add({ productId, ...draft });
            if (r.ok) setDraft(NEW_VARIANT);
            return r;
          }, `${draft.name} added. It has no stock until stock is counted in.`);
        }}
      >
        <p className="text-[13px] font-bold text-ink">Add a variant</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Name</span>
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} required placeholder="50 kg bag" className={field} />
          </label>
          <label className="block">
            <span className={label}>SKU</span>
            <input value={draft.sku} onChange={(e) => set("sku", e.target.value)} required className={field} />
          </label>
          <label className="block">
            <span className={label}>Selling price (₹, incl. GST)</span>
            <input value={draft.price} onChange={(e) => set("price", e.target.value)} required inputMode="decimal" className={field} />
          </label>
          <label className="block">
            <span className={label}>MRP (₹, optional)</span>
            <input value={draft.mrp} onChange={(e) => set("mrp", e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="block">
            <span className={label}>Stock row in (optional)</span>
            <select value={draft.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} className={field}>
              <option value="">No warehouse yet</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[12px] font-medium leading-[17px] text-ink-700">
          Adding, retiring or re-ordering variants clears the product&rsquo;s price and stock review; it is not sold again until
          that review is done.
        </p>
        <div className="mt-2">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : "Add variant"}
          </button>
        </div>
      </form>
      <Note message={message} />
    </Panel>
  );
}

/* ----------------------------------------------------------------- photos */

export interface PhotoRow {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
  approved: boolean;
  licence: string | null;
}

export type SetPrimaryPhoto = (input: { imageId: string }) => Promise<ActionResult<null>>;
export type RemovePhoto = (input: { imageId: string }) => Promise<ActionResult<{ wasPrimary: boolean }>>;
export type UploadPhoto = (form: FormData) => Promise<{ ok: boolean; error?: string; alreadyAttached?: boolean }>;

/** The console's upload route. A route, not an action: actions are capped at 1 MB. */
export const uploadViaRoute: UploadPhoto = async (form) => {
  try {
    const res = await fetch("/api/admin/product-images", { method: "POST", body: form });
    return (await res.json()) as { ok: boolean; error?: string; alreadyAttached?: boolean };
  } catch {
    return { ok: false, error: "The upload did not reach the server" };
  }
};

export function PhotosPanel({
  slug,
  photos,
  licences,
  uploadEnabled,
  setPrimary,
  remove,
  upload = uploadViaRoute,
}: {
  slug: string;
  photos: PhotoRow[];
  /** Licences shown to customers in production (lib/catalog-policy.ts). */
  licences: readonly string[];
  /** False when the server has no image store configured. */
  uploadEnabled: boolean;
  setPrimary: SetPrimaryPhoto;
  remove: RemovePhoto;
  upload?: UploadPhoto;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [licence, setLicence] = useState(licences[0] ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, start] = useTransition();

  const run = (work: () => Promise<ActionResult<unknown>>, done: string) => {
    setMessage(null);
    start(async () => {
      const r = await work();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error.message });
    });
  };

  const submitUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage({ ok: false, text: "Choose a photo" });
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("slug", slug);
    form.set("alt", alt);
    form.set("licence", licence);
    form.set("sourceUrl", sourceUrl);
    form.set("makePrimary", makePrimary ? "1" : "0");
    setMessage(null);
    start(async () => {
      const r = await upload(form);
      if (!r.ok) {
        setMessage({ ok: false, text: r.error ?? "Upload failed" });
        return;
      }
      setMessage({
        ok: true,
        text: r.alreadyAttached
          ? "That photo is already on this product."
          : "Uploaded. Customers will not see it until it is approved in Catalogue approvals.",
      });
      setAlt("");
      setSourceUrl("");
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  return (
    <Panel title="Photos">
      {photos.length === 0 ? (
        <p className="text-[12.5px] font-semibold text-ink-700">No photos. The product is not shown in the shop without an approved lead photo.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <figure key={p.id} className="w-[150px]">
              {/* Plain img: catalogue URLs of unknown dimensions; next/image would need both. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt} className="h-[110px] w-full rounded-field bg-white object-contain" />
              <figcaption className="mt-1 flex flex-col gap-0.5 text-[11px] font-semibold text-ink-500">
                <span>
                  {p.isPrimary ? "Lead photo" : "Extra photo"} · {p.approved ? "Approved" : <span className="text-ops-warn">Awaiting approval</span>}
                </span>
                <span className="truncate" title={p.licence ?? undefined}>
                  {p.licence ?? "No licence recorded"}
                </span>
                <span className="flex gap-2">
                  {!p.isPrimary && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setPrimary({ imageId: p.id }), "Lead photo changed.")}
                      className="font-bold text-ink underline"
                    >
                      Make lead
                    </button>
                  )}
                  {confirmRemove === p.id ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setConfirmRemove(null);
                        run(() => remove({ imageId: p.id }), p.isPrimary ? "Removed. The product has no lead photo now." : "Removed.");
                      }}
                      className="font-bold text-danger underline"
                    >
                      Confirm remove
                    </button>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => setConfirmRemove(p.id)} className="font-bold text-ink underline">
                      Remove
                    </button>
                  )}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {photos.some((p) => !p.approved) && (
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Making an unapproved photo the lead takes the product out of the shop until that photo is approved.
        </p>
      )}

      {uploadEnabled ? (
        <form
          className="border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitUpload();
          }}
        >
          <p className="text-[13px] font-bold text-ink">Upload a photo</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={label}>Photo (JPEG, PNG or WebP, up to 8 MB)</span>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-[13px]" />
            </label>
            <label className="block">
              <span className={label}>Describe the photo</span>
              <input value={alt} onChange={(e) => setAlt(e.target.value)} required maxLength={200} placeholder="Front of the 50 kg bag" className={field} />
            </label>
            <label className="block">
              <span className={label}>Licence</span>
              <select value={licence} onChange={(e) => setLicence(e.target.value)} className={field}>
                {licences.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={label}>Where it came from (https link)</span>
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} required type="url" placeholder="https://" className={field} />
            </label>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
              Lead photo if the product has none
            </label>
          </div>
          <div className="mt-2">
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? "Uploading…" : "Upload photo"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-[12px] font-medium leading-[17px] text-ink-700">
          Uploading is off: this server has no image store configured.
        </p>
      )}
      <Note message={message} />
    </Panel>
  );
}
