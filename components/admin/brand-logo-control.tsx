"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminRemoveBrandLogo } from "@/actions/brands";

/**
 * A brand's logo on the Brands page (issue #7): preview, upload or replace, remove.
 *
 * Uploading asks two things every time, because a name is not a licence to use
 * artwork (ISS-044): a declaration that the business may use this logo, and the
 * licence or agreement it is used under. Both are recorded with the file in the
 * audit log (lib/services/admin/brand-logos.ts).
 */
export function BrandLogoControl({
  slug,
  name,
  logoUrl,
  uploadEnabled,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
  uploadEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [licence, setLicence] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = () => {
    setOpen(false);
    setFile(null);
    setLicence("");
    setSourceUrl("");
    setRights(false);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("slug", slug);
      body.set("licence", licence);
      body.set("sourceUrl", sourceUrl);
      body.set("rightsConfirmed", rights ? "1" : "0");
      const res = await fetch("/api/admin/brand-logos", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; unchanged?: boolean } | null;
      if (res.ok && json?.ok) {
        setMessage({ ok: true, text: json.unchanged ? "That logo is already set; this declaration was recorded." : "Logo saved." });
        reset();
        router.refresh();
      } else {
        setMessage({ ok: false, text: json?.error ?? "The logo could not be uploaded" });
      }
    } catch {
      setMessage({ ok: false, text: "The logo could not be uploaded" });
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setMessage(null);
    start(async () => {
      const res = await adminRemoveBrandLogo(slug);
      if (res.ok) {
        setMessage({ ok: true, text: "Logo removed." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const field =
    "h-9 w-full rounded-field bg-chip-soft px-3 text-[12.5px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";
  const ready = file !== null && rights && licence.trim().length >= 3;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of a stored, sniffed raster file
          <img
            src={logoUrl}
            alt={`${name} logo`}
            width={40}
            height={40}
            className="h-10 w-10 rounded-field bg-white object-contain ring-1 ring-line"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-field bg-chip-soft text-[9px] font-bold uppercase text-ink-500">
            No logo
          </span>
        )}
        {uploadEnabled && (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            className="h-8 rounded-full bg-chip px-3 text-[12px] font-bold text-ink"
          >
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
        )}
        {logoUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="h-8 rounded-full bg-chip px-3 text-[12px] font-bold text-ink disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove logo"}
          </button>
        )}
      </div>

      {open && (
        <div className="flex max-w-[460px] flex-col gap-2 rounded-panel bg-chip-soft/60 p-3">
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Logo file (JPEG, PNG or WebP, up to 2 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
              }}
              aria-label={`Logo file for ${name}`}
              className="mt-1 block w-full text-[12px] font-semibold normal-case tracking-normal text-ink"
            />
          </label>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Licence or agreement
            <input
              value={licence}
              onChange={(e) => {
                setLicence(e.target.value);
              }}
              placeholder="e.g. dealer agreement with the brand, 2026"
              aria-label={`Licence for ${name} logo`}
              className={`${field} mt-1 normal-case tracking-normal`}
            />
          </label>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Where it came from (optional)
            <input
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
              }}
              placeholder="https://…"
              aria-label={`Source link for ${name} logo`}
              className={`${field} mt-1 normal-case tracking-normal`}
            />
          </label>
          <label className="flex items-start gap-2 text-[12px] font-semibold leading-[17px] text-ink">
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => {
                setRights(e.target.checked);
              }}
              aria-label={`The business has the right to use the ${name} logo`}
              className="mt-0.5"
            />
            The business has the right to use this logo. Stocking a brand alone does not give that right.
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void upload();
              }}
              disabled={!ready || busy}
              className="h-9 rounded-panel bg-ink px-4 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Save logo"}
            </button>
            <button type="button" onClick={reset} className="h-9 rounded-panel bg-chip px-4 text-[12.5px] font-bold text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={"text-[12px] font-semibold " + (message.ok ? "text-ink" : "text-ops-bad")} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
