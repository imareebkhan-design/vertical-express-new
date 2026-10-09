"use client";

import { useState, useTransition } from "react";
import type { ApprovalInput } from "@/lib/services/admin/catalogue-approval";
import type { ActionResult } from "@/lib/validators";

type Submit = (input: ApprovalInput) => Promise<ActionResult<{ public: boolean }>>;

const FIELD = "w-full rounded-field border border-neutral-300 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none";

/**
 * One product's decision. Nothing is pre-filled: every field starts empty so a
 * decision is always made, never inherited. The hidden expected sha256 and
 * updatedAt make the server refuse a decision about something that changed.
 */
export function ApprovalForm(props: {
  productId: string; imageId: string; sha256: string; updatedAt: string; packSensitive: boolean; submit: Submit;
}) {
  const [identity, setIdentity] = useState<"" | "CONFIRMED" | "REJECTED">("");
  const [image, setImage] = useState<"" | "APPROVED_EXACT" | "APPROVED_WITH_LIMITATION" | "REJECTED">("");
  const [severity, setSeverity] = useState<"" | "P2" | "P3">("");
  const [packDecision, setPack] = useState("");
  const [evidence, setEvidence] = useState("");
  const [limitations, setLimitations] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      aria-label="Approval decision"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!identity || !image) return setMsg({ ok: false, text: "Choose an identity and an image decision" });
        start(async () => {
          const r = await props.submit({
            productId: props.productId, imageId: props.imageId,
            expectedImageSha256: props.sha256, expectedProductUpdatedAt: props.updatedAt,
            identity, image, severity: severity || null, packDecision, evidence, limitations,
          });
          setMsg(r.ok ? { ok: true, text: r.data.public ? "Recorded — the product is now public (catalog-only)" : "Recorded — the product stays hidden" } : { ok: false, text: r.error.message });
        });
      }}
    >
      <fieldset>
        <legend className="text-xs font-extrabold uppercase tracking-widest text-neutral-500">Product identity</legend>
        {(["CONFIRMED", "REJECTED"] as const).map((v) => (
          <label key={v} className="mr-4 text-sm font-bold"><input type="radio" name={`id-${props.productId}`} checked={identity === v} onChange={() => setIdentity(v)} /> {v === "CONFIRMED" ? "Exact model confirmed" : "Wrong / unsure"}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="text-xs font-extrabold uppercase tracking-widest text-neutral-500">Primary photo</legend>
        {(["APPROVED_EXACT", "APPROVED_WITH_LIMITATION", "REJECTED"] as const).map((v) => (
          <label key={v} className="mr-4 text-sm font-bold"><input type="radio" name={`img-${props.productId}`} checked={image === v} onChange={() => setImage(v)} /> {v.replaceAll("_", " ").toLowerCase()}</label>
        ))}
      </fieldset>
      {image === "APPROVED_WITH_LIMITATION" && (
        <label className="block text-sm font-bold">Severity
          <select aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as "P2" | "P3")} className={FIELD}>
            <option value="">Choose</option><option value="P2">P2 — correct product, low resolution / crop</option><option value="P3">P3 — cosmetic</option>
          </select>
        </label>
      )}
      {props.packSensitive && (
        <label className="block text-sm font-bold">Pack / accessories (required — the title names a set, kit, pack or battery)
          <input aria-label="Pack / accessories" value={packDecision} onChange={(e) => setPack(e.target.value)} maxLength={500} className={FIELD} />
        </label>
      )}
      <label className="block text-sm font-bold">Evidence (what you checked)
        <input aria-label="Evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={1000} className={FIELD} />
      </label>
      <label className="block text-sm font-bold">Limitations (optional)
        <input aria-label="Limitations" value={limitations} onChange={(e) => setLimitations(e.target.value)} maxLength={1000} className={FIELD} />
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm font-bold text-ink" : "text-sm font-bold text-danger"}>{msg.text}</p>}
      <button type="submit" disabled={pending} className="rounded-full bg-ink px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">
        {pending ? "Recording…" : "Record decision"}
      </button>
    </form>
  );
}
