"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/validators";
import type { ApprovalInput } from "@/lib/services/admin/catalogue-approval";
import { STATUS_MEANING, type LiveStep, type ProductStatus, type StorefrontLine } from "@/lib/product-live";
import { ApprovalForm } from "@/components/admin/approval-form";

/**
 * The top of the product page: what state the product is in, what is left
 * before it can be published, and what a customer gets once it is.
 *
 * It shows; it does not decide. The steps come from lib/product-live.ts, the
 * publish button calls the same gated, audited status change the editor's Save
 * does (lib/services/admin/product-status.ts), and a refusal is shown in the
 * gate's own words. Actions are props, so the panel tests without a server.
 */
export type SetStatus = (input: { productId: string; to: ProductStatus }) => Promise<ActionResult<{ changed: boolean }>>;

const button = "h-10 rounded-field px-4 text-[13px] font-bold disabled:opacity-50";

export function ProductLivePanel({
  productId,
  slug,
  status,
  steps,
  otherReasons,
  storefront,
  setStatus,
}: {
  productId: string;
  slug: string;
  status: ProductStatus;
  steps: LiveStep[];
  /** Publish-gate reasons no step covers, in the gate's words. */
  otherReasons: string[];
  storefront: { headline: string; visible: boolean; lines: StorefrontLine[] };
  setStatus: SetStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const left = steps.filter((s) => !s.done);
  const ready = left.length === 0 && otherReasons.length === 0;
  const meaning = STATUS_MEANING[status];

  const move = (to: ProductStatus, done: string) => {
    setMessage(null);
    setConfirmArchive(false);
    start(async () => {
      const r = await setStatus({ productId, to });
      if (!r.ok) {
        setMessage({ ok: false, text: to === "published" ? `Not published. Still missing: ${r.error.message}.` : r.error.message });
        return;
      }
      setMessage({ ok: true, text: done });
      router.refresh();
    });
  };

  return (
    <section id="live" aria-label="Getting this product live" className="scroll-mt-4 rounded-panel bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">
          Status: {meaning.label}
        </h2>
        <p className="text-[12px] font-semibold leading-relaxed text-ink-700">{meaning.meaning}</p>
      </div>

      {status !== "archived" && (
        <>
          <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            {status === "published"
              ? "What publishing requires"
              : ready
                ? "Ready to publish"
                : `Before it can be published — ${left.length} of ${steps.length} left`}
          </h3>
          <ol className="mt-2 flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <li key={s.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-field bg-chip-soft px-3 py-2">
                <span
                  className={
                    "mt-0.5 inline-flex h-5 min-w-[52px] items-center justify-center rounded-chip px-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] " +
                    (s.done ? "bg-ops-ok-tint text-ops-ok" : "bg-ops-warn-tint text-ops-warn")
                  }
                >
                  {s.done ? "Done" : "To do"}
                </span>
                <span className="min-w-[200px] flex-1">
                  <span className="block text-[12.5px] font-bold text-ink">
                    {i + 1}. {s.title}
                  </span>
                  <span className="block text-[12px] font-medium leading-[17px] text-ink-700">{s.detail}</span>
                </span>
                {s.href && s.action && (
                  <a href={s.href} className="text-[12px] font-bold text-ink underline">
                    {s.action}
                  </a>
                )}
              </li>
            ))}
          </ol>
          {otherReasons.length > 0 && (
            <div className="mt-2 rounded-field bg-ops-warn-tint px-3 py-2 text-[12px] font-semibold text-ops-warn">
              The publish check also reports:
              <ul className="mt-1 list-disc pl-5">
                {otherReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {status !== "published" && status !== "archived" && (
          <button
            type="button"
            disabled={pending || !ready}
            onClick={() => move("published", "Published. See “On the storefront” below for what customers get.")}
            className={`${button} bg-ink text-white`}
          >
            {pending ? "Working…" : "Publish"}
          </button>
        )}
        {status === "published" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => move("draft", "Taken off the storefront. It is a draft again.")}
            className={`${button} bg-chip text-ink`}
          >
            Take off the storefront
          </button>
        )}
        {status === "archived" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => move("draft", "Brought back as a draft. Customers still cannot see it until it is published.")}
            className={`${button} bg-chip text-ink`}
          >
            Bring back as a draft
          </button>
        ) : confirmArchive ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => move("archived", "Archived. It is hidden from customers; its orders and stock history are kept.")}
            className={`${button} bg-ops-bad-tint text-ops-bad`}
          >
            Confirm archive
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmArchive(true)} className={`${button} text-ink-500 underline`}>
            Archive
          </button>
        )}
        {status !== "published" && status !== "archived" && !ready && (
          <span className="text-[12px] font-semibold text-ink-500">Publish unlocks when every step above says Done.</span>
        )}
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={"mt-2 text-[12.5px] font-bold " + (message.ok ? "text-success" : "text-danger")}>
          {message.text}
        </p>
      )}

      <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">On the storefront</h3>
      <p className="mt-1 text-[13px] font-bold text-ink">{storefront.headline}</p>
      <dl className="mt-2 grid gap-1.5">
        {storefront.lines.map((l) => (
          <div key={l.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
            <dt className="w-[130px] shrink-0 font-bold text-ink-500">{l.label}</dt>
            <dd className={"min-w-[200px] flex-1 font-semibold " + (l.tone === "no" ? "text-ops-bad" : l.tone === "note" ? "text-ops-warn" : "text-ink")}>
              {l.text}{" "}
              {l.href && l.action && (
                <Link href={l.href} className="font-bold text-ink underline">
                  {l.action}
                </Link>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {storefront.visible ? (
        <Link href={`/product/${slug}`} target="_blank" className="mt-2 inline-block text-[12px] font-bold text-ink underline">
          Open the customer page
        </Link>
      ) : (
        <p className="mt-2 text-[12px] font-medium text-ink-500">
          Its customer link (/product/{slug}) shows “not found” until it is shown to customers.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ stock record */

export type CreateStockRecord = (input: { variantIds: string[]; warehouseId: string }) => Promise<ActionResult<{ created: number }>>;

/** A first stock record, at zero, for packs that have none. Quantities are counted in on Inventory. */
export function StockRecordPanel({
  variants,
  warehouses,
  create,
}: {
  /** Active packs with no stock record at any active warehouse. */
  variants: { id: string; name: string; sku: string }[];
  warehouses: { id: string; name: string }[];
  create: CreateStockRecord;
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (variants.length === 0) return null;
  return (
    <section id="stock" className="scroll-mt-4 rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">Stock record</h2>
      <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
        {variants.map((v) => v.name).join(", ")} {variants.length === 1 ? "has" : "have"} no stock record, so the shop does not
        know whether there is any. Create the record at zero here, then count the real quantity in on Inventory.
      </p>
      {warehouses.length === 0 ? (
        <p className="mt-2 text-[12px] font-bold text-ops-bad">There is no active warehouse to hold stock.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Warehouse</span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-10 rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !warehouseId}
            onClick={() => {
              setMessage(null);
              start(async () => {
                /* All packs in one transaction: either every record is made or none. */
                const r = await create({ variantIds: variants.map((v) => v.id), warehouseId });
                if (!r.ok) {
                  setMessage({ ok: false, text: r.error.message });
                  return;
                }
                setMessage({ ok: true, text: "Stock record created at zero." });
                router.refresh();
              });
            }}
            className={`${button} bg-ink text-white`}
          >
            {pending ? "Creating…" : "Create stock record at zero"}
          </button>
          <Link href="/admin/inventory" className="pb-2.5 text-[12px] font-bold text-ink underline">
            Inventory
          </Link>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={"mt-2 text-[12px] font-bold " + (message.ok ? "text-success" : "text-danger")}>
          {message.text}
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- approval */

export type RecordApproval = (input: ApprovalInput) => Promise<ActionResult<{ public: boolean }>>;

/**
 * The identity and photo decision, on the product's own page.
 *
 * The Approvals screen lists only the batches named in
 * lib/catalog/approval-batches.json, so a product added from the dashboard was
 * never offered for approval and could not be published. This is the same form
 * and the same action (`recordCatalogueApproval`): the approver is the signed-in
 * operator, and the decision is refused if the photo or product changed since
 * the page was drawn.
 */
export function ProductApprovalPanel({
  productId,
  title,
  photo,
  approved,
  approvalNote,
  updatedAt,
  packSensitive,
  record,
}: {
  productId: string;
  title: string;
  /** The lead photo, or null when there is none to approve. */
  photo: { id: string; url: string; sha256: string | null } | null;
  approved: boolean;
  /** What was recorded, when a decision is on file. */
  approvalNote: string | null;
  updatedAt: string;
  packSensitive: boolean;
  record: RecordApproval;
}) {
  const router = useRouter();
  return (
    <section id="approval" className="scroll-mt-4 rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">Identity and photo approval</h2>
      <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
        Customers never see a product until someone has confirmed it is exactly what its name says and approved its lead
        photo. Changing the name, brand, unit, specifications or the photo clears the decision.
      </p>
      {!photo ? (
        <p className="mt-2 text-[12.5px] font-bold text-ops-warn">
          There is no lead photo to approve yet.{" "}
          <a href="#photos" className="text-ink underline">
            Upload one
          </a>
          .
        </p>
      ) : !photo.sha256 ? (
        <p className="mt-2 text-[12.5px] font-bold text-ops-warn">
          This lead photo was not uploaded through the dashboard and has no checksum, so it cannot be approved. Upload the
          photo again below and make it the lead.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- the exact stored bytes, not an optimised variant */}
            <img src={photo.url} alt={title} className="aspect-square w-full rounded-field bg-white object-contain" />
            <p className="mt-1 text-[11px] font-semibold text-ink-500">Lead photo · {approved ? "approved" : "awaiting approval"}</p>
          </div>
          <div>
            {approved && approvalNote && (
              <p className="mb-3 rounded-field bg-ops-ok-tint px-3 py-2 text-[12px] font-semibold text-ops-ok">
                On file: {approvalNote}. Recording a new decision replaces it.
              </p>
            )}
            <ApprovalForm
              /* A different photo is a different decision: nothing chosen
                 for the old photo carries over to the new one. */
              key={`${photo.id}:${photo.sha256}`}
              productId={productId}
              imageId={photo.id}
              sha256={photo.sha256}
              updatedAt={updatedAt}
              packSensitive={packSensitive}
              submit={async (input) => {
                const r = await record(input);
                if (r.ok) router.refresh();
                return r;
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
