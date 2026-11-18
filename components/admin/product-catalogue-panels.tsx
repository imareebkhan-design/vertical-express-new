"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

function Panel({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-panel bg-white p-4 shadow-card">
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
          ? "Saved. The product has left the shop until its identity is approved again under “Identity and photo approval” on this page."
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
            approved again under &ldquo;Identity and photo approval&rdquo; on this page.
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
export type UploadPhoto = (form: FormData) => Promise<{ ok: boolean; error?: string; alreadyAttached?: boolean; isPrimary?: boolean }>;
export type ApproveExtraPhotos = (input: { productId: string; imageIds: string[] }) => Promise<ActionResult<{ approved: number }>>;

/** Photos one product may carry — the server's MAX_PHOTOS_PER_PRODUCT. */
export const MAX_PHOTOS = 30;

/** The console's upload route. A route, not an action: actions are capped at 1 MB. */
export const uploadViaRoute: UploadPhoto = async (form) => {
  try {
    const res = await fetch("/api/admin/product-images", { method: "POST", body: form });
    return (await res.json()) as { ok: boolean; error?: string; alreadyAttached?: boolean; isPrimary?: boolean };
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
  productId,
  leadApproved = false,
  approveExtra,
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
  productId?: string;
  /** The product's identity and lead photo are approved; extra photos may then be approved. */
  leadApproved?: boolean;
  approveExtra?: ApproveExtraPhotos;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [alt, setAlt] = useState("");
  const [licence, setLicence] = useState(licences[0] ?? "");
  /* The first photo leads when the product has none yet; that is the usual
     case for a new product, so it starts ticked. */
  const hasLead = photos.some((p) => p.isPrimary);
  const [makePrimary, setMakePrimary] = useState(!hasLead);
  /* Follow the product: once it has a lead the box no longer applies, and if
     the lead is removed it applies again. */
  useEffect(() => setMakePrimary(!hasLead), [hasLead]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const room = Math.max(0, MAX_PHOTOS - photos.length);

  const run = (work: () => Promise<ActionResult<unknown>>, done: string) => {
    setMessage(null);
    start(async () => {
      const r = await work();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error.message });
      if (r.ok) router.refresh();
    });
  };

  /** Keep image files only, and no more than the product has room for. */
  const pick = (list: FileList | null) => {
    setMessage(null);
    if (pending) return;
    const chosen = [...(list ?? [])].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    const skipped = (list?.length ?? 0) - chosen.length;
    const kept = chosen.slice(0, room);
    setFiles(kept);
    const notes = [
      skipped > 0 ? `${skipped} file${skipped === 1 ? " is" : "s are"} not a JPEG, PNG or WebP photo and ${skipped === 1 ? "was" : "were"} left out.` : null,
      chosen.length > room ? `This product can hold ${MAX_PHOTOS} photos; only the first ${room} chosen will be uploaded.` : null,
    ].filter(Boolean);
    if (notes.length) setMessage({ ok: false, text: notes.join(" ") });
  };

  const submitUpload = () => {
    if (files.length === 0) {
      setMessage({ ok: false, text: "Choose one or more photos from your computer first." });
      return;
    }
    setMessage(null);
    start(async () => {
      let uploaded = 0;
      let already = 0;
      let leadSet = false;
      const failed: string[] = [];
      const completed: string[] = [];
      /* One at a time: each photo is checked and stored on its own, and the
         first one becomes the lead only if the product has none. */
      for (const [n, file] of files.entries()) {
        setProgress(`Uploading ${n + 1} of ${files.length}…`);
        const form = new FormData();
        form.set("file", file);
        form.set("slug", slug);
        form.set("alt", alt.trim() ? (files.length > 1 ? `${alt.trim()} (${n + 1})` : alt.trim()) : "");
        form.set("licence", licence);
        /* Asked of every photo until one becomes the lead: the server makes a
           photo the lead only while the product has none, so a first photo
           that fails or was already attached does not leave it without one. */
        form.set("makePrimary", makePrimary && !leadSet ? "1" : "0");
        const r = await upload(form);
        if (!r.ok) failed.push(`${file.name}: ${r.error ?? "upload failed"}`);
        else {
          if (r.isPrimary) leadSet = true;
          if (r.alreadyAttached) already += 1;
          else uploaded += 1;
          completed.push(`${file.name}: ${r.alreadyAttached ? "already attached" : "uploaded"}`);
        }
      }
      setProgress(null);
      const parts = [
        uploaded ? `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded. Customers see a photo only once it is approved: the lead photo under “Identity and photo approval” below, the others with Approve on each photo here.` : null,
        makePrimary && !leadSet && !hasLead ? "No lead photo was set. Choose Make lead on one of the photos." : null,
        already ? `${already} ${already === 1 ? "was" : "were"} already on this product.` : null,
        completed.length ? `${completed.join(". ")}.` : null,
        failed.length ? `Not uploaded — ${failed.join("; ")}.` : null,
      ].filter(Boolean);
      setMessage({ ok: failed.length === 0, text: parts.join(" ") });
      setFiles([]);
      setAlt("");
      if (fileRef.current) fileRef.current.value = "";
      /* The photo list, the approval form and the checklist above all read
         what was just attached; without this they showed it only after a reload. */
      router.refresh();
    });
  };

  return (
    <Panel title="Photos" id="photos">
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
                <span className="flex flex-wrap gap-x-2">
                  {!p.isPrimary && !p.approved && leadApproved && approveExtra && productId && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        run(() => approveExtra({ productId, imageIds: [p.id] }), "Photo approved. Customers see it in the gallery.");
                      }}
                      className="font-bold text-ink underline"
                    >
                      Approve
                    </button>
                  )}
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
      {(() => {
        const waiting = photos.filter((p) => !p.isPrimary && !p.approved);
        if (waiting.length === 0) return null;
        if (!leadApproved || !approveExtra || !productId) {
          return (
            <p className="text-[12px] font-medium leading-[17px] text-ink-700">
              {waiting.length} extra photo{waiting.length === 1 ? " is" : "s are"} waiting. Approve the product and its lead photo
              under &ldquo;Identity and photo approval&rdquo; first; the extra photos can then be approved here.
            </p>
          );
        }
        return (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                run(
                  () => approveExtra({ productId, imageIds: waiting.map((p) => p.id) }),
                  `${waiting.length} photo${waiting.length === 1 ? "" : "s"} approved. Customers see ${waiting.length === 1 ? "it" : "them"} in the gallery.`
                );
              }}
              className={primaryButton}
            >
              Approve {waiting.length === 1 ? "the extra photo" : `all ${waiting.length} extra photos`}
            </button>
            <span className="text-[12px] font-medium text-ink-700">Check each one shows this product before approving.</span>
          </div>
        );
      })()}
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
          <p className="text-[13px] font-bold text-ink">Add photos</p>
          {room === 0 ? (
            <p className="mt-2 text-[12.5px] font-semibold text-ops-warn">
              This product has {MAX_PHOTOS} photos, the most it can hold. Remove one to add another.
            </p>
          ) : (
            <>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => {
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files);
                }}
                className={
                  "mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed px-4 py-6 text-center " +
                  (dragging ? "border-ink bg-chip-soft" : "border-line bg-hush/40")
                }
              >
                <span className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold leading-10 text-white">
                  Choose photos from your computer
                </span>
                <span className="text-[12px] font-medium text-ink-700">
                  or drag them here · JPEG, PNG or WebP, up to 8 MB each · up to {room} more
                  {room === 1 ? " photo" : " photos"} on this product
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Photos from your computer"
                  className="sr-only"
                  disabled={pending}
                  onChange={(e) => {
                    pick(e.target.files);
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul aria-label="Chosen photos" className="mt-2 flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="rounded-chip bg-chip px-2.5 py-1 text-[11.5px] font-semibold text-ink-700">
                      {i === 0 && makePrimary ? "Lead · " : ""}
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>Describe the photos (optional)</span>
                  <input
                    value={alt}
                    onChange={(e) => {
                      setAlt(e.target.value);
                    }}
                    maxLength={200}
                    placeholder="Front of the 50 kg bag"
                    className={field}
                  />
                  <span className="mt-1 block text-[11.5px] font-medium text-ink-500">Left blank, the product&rsquo;s name is used.</span>
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
                {!photos.some((p) => p.isPrimary) && (
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
                    Make the first photo the lead photo
                  </label>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={pending || files.length === 0} className={primaryButton}>
                  {pending ? progress ?? "Uploading…" : files.length > 1 ? `Upload ${files.length} photos` : "Upload photo"}
                </button>
                {files.length > 0 && !pending && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="text-[12px] font-bold text-ink-500 underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </>
          )}
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
