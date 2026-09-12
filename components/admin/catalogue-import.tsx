"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminImportCatalogue, adminPreviewCatalogue } from "@/actions/catalogue";
import { CATALOGUE_CSV_TEMPLATE } from "@/lib/catalogue-csv";
import type { ImportPreview } from "@/lib/services/admin/catalogue-import";
import { formatPaise } from "@/lib/money";

/**
 * Listing the catalogue from a spreadsheet.
 *
 * Two steps, unlike the serviceability import, which writes as soon as a file
 * is chosen. Forty pincodes are a change somebody can read back afterwards; two
 * hundred products at two hundred prices are not, so the file is checked and
 * shown before anything is written and the write needs a second click.
 *
 * The file is read here, in the browser, and only its text crosses to the
 * server — the same shape as `serviceability-editor.tsx`. No upload endpoint,
 * no multipart, nothing to leave lying in a temp directory.
 */
export function CatalogueImport() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /** Drop the file and its preview. The message is separate — after a
      successful import it is the only thing left saying what happened. */
  const clearFile = () => {
    setCsv(null);
    setFileName(null);
    setPreview(null);
  };

  const onFile = async (file: File) => {
    clearFile();
    setMessage(null);
    setReading(true);
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    start(async () => {
      const res = await adminPreviewCatalogue(text);
      setReading(false);
      if (res.ok) setPreview(res.data);
      else setMessage({ ok: false, text: res.error.message });
    });
  };

  const doImport = () => {
    if (!csv) return;
    setMessage(null);
    start(async () => {
      const res = await adminImportCatalogue(csv);
      if (res.ok) {
        const { created, skipped } = res.data;
        setMessage({
          ok: true,
          text:
            `${created} ${created === 1 ? "product" : "products"} listed` +
            (skipped > 0 ? `, ${skipped} already on the shelf and left alone.` : "."),
        });
        clearFile();
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const templateHref =
    "data:text/csv;charset=utf-8," + encodeURIComponent(CATALOGUE_CSV_TEMPLATE);

  const busy = pending || reading;
  const ready = preview !== null && preview.toCreate.length > 0;

  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">Import a spreadsheet</h2>
        <a
          href={templateHref}
          download="vertical-express-catalogue-template.csv"
          className="text-[12px] font-bold text-ink no-underline hover:underline"
        >
          Download the template
        </a>
      </div>

      <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
        One row per product. Prices include GST — type what the customer pays. Nothing is
        written until the file has been checked and you confirm.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="h-10 cursor-pointer rounded-panel bg-chip px-4 text-[13px] font-bold leading-10 text-ink">
          {reading ? "Reading…" : fileName ? "Choose another file" : "Choose a file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              /* Cleared so picking the same file again re-fires the change. */
              e.target.value = "";
            }}
          />
        </label>

        {fileName && (
          <span className="text-[12px] font-semibold text-ink-500">{fileName}</span>
        )}
      </div>

      {message && (
        <p
          role="status"
          className={
            "mt-3 whitespace-pre-line rounded-panel p-3.5 text-[12.5px] font-semibold leading-relaxed " +
            (message.ok ? "bg-chip-soft text-ink" : "bg-ops-bad-tint text-ops-bad")
          }
        >
          {message.text}
        </p>
      )}

      {preview && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Count n={preview.toCreate.length} label="ready to list" tone="ok" />
            {preview.skipped.length > 0 && (
              <Count n={preview.skipped.length} label="already listed" tone="mute" />
            )}
          </div>

          {preview.toCreate.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                    <th className="px-3 pb-2.5">Line</th>
                    <th className="px-3 pb-2.5">Product</th>
                    <th className="px-3 pb-2.5">Brand</th>
                    <th className="px-3 pb-2.5">Price</th>
                    <th className="px-3 pb-2.5">Stock</th>
                    <th className="px-3 pb-2.5">60-min</th>
                    <th className="px-3 pb-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.toCreate.map((r) => (
                    <tr key={r.slug} className="border-t border-line">
                      <td className="px-3 py-2 text-[12px] font-semibold tabular-nums text-ink-500">
                        {r.line}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block text-[12.5px] font-bold text-ink">{r.title}</span>
                        {/* The slug is derived, so showing it is the only way to
                            see the web address before it exists. */}
                        <span className="block text-[11px] font-semibold text-ink-500">
                          /product/{r.slug}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-ink-700">
                        {r.brandName}
                      </td>
                      <td className="px-3 py-2 text-[12.5px] font-bold tabular-nums text-ink">
                        {formatPaise(r.pricePaise)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-semibold tabular-nums text-ink-700">
                        {r.stock}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-ink-700">
                        {r.express ? `${r.expressPincodes.length} pincodes` : "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-ink-700">
                        {r.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <div className="rounded-panel bg-chip-soft p-3.5">
              <p className="text-[12px] font-bold text-ink">
                Already on the shelf — left exactly as they are
              </p>
              <p className="mt-1 text-[11.5px] font-medium leading-[16px] text-ink-500">
                An import never changes an existing product&rsquo;s price or stock. Edit those in
                the product screen, deliberately.
              </p>
              <ul className="mt-2 flex flex-col gap-0.5">
                {preview.skipped.map((s) => (
                  <li key={s.slug} className="text-[11.5px] font-semibold text-ink-700">
                    Line {s.line}: {s.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !ready}
              onClick={doImport}
              className="h-11 rounded-panel bg-ink px-6 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {pending
                ? "Listing…"
                : `List ${preview.toCreate.length} ${preview.toCreate.length === 1 ? "product" : "products"}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                clearFile();
                setMessage(null);
              }}
              className="h-11 rounded-panel bg-chip px-5 text-[13px] font-bold text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            {!ready && (
              <span className="text-[12px] font-semibold text-ink-500">
                Every product in this file is already listed.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: "ok" | "mute" }) {
  return (
    <span
      className={
        "inline-flex items-baseline gap-1.5 rounded-chip px-3 py-1.5 " +
        (tone === "ok" ? "bg-ops-ok-tint text-ops-ok" : "bg-chip text-ink-700")
      }
    >
      <span className="text-[15px] font-extrabold tabular-nums">{n}</span>
      <span className="text-[11.5px] font-bold">{label}</span>
    </span>
  );
}
