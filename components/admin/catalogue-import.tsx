"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminImportCatalogue, adminPreviewCatalogue } from "@/actions/catalogue";
import { CATALOGUE_CSV_TEMPLATE, type CsvIssue } from "@/lib/catalogue-csv";
import type { ImportPreview, ImportResult } from "@/lib/services/admin/catalogue-import";
import { formatPaise } from "@/lib/money";

/**
 * Listing the catalogue from a spreadsheet.
 *
 * Five steps, in the order the screen shows them: download the template, choose
 * the file, read the preview, confirm, then open what was created. Two of them
 * are separate clicks on purpose — forty pincodes are a change somebody can
 * read back afterwards; two hundred products at two hundred prices are not, so
 * the file is checked and shown before anything is written.
 *
 * The file is read here, in the browser, and only its text crosses to the
 * server — the same shape as `serviceability-editor.tsx`. No upload endpoint,
 * no multipart, nothing to leave lying in a temp directory.
 *
 * The actions are props so the screen can be tested without a server.
 */
type PreviewAction = typeof adminPreviewCatalogue;
type ImportAction = typeof adminImportCatalogue;

export function CatalogueImport({
  preview: previewAction = adminPreviewCatalogue,
  confirm: importAction = adminImportCatalogue,
}: {
  preview?: PreviewAction;
  confirm?: ImportAction;
} = {}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [issues, setIssues] = useState<CsvIssue[]>([]);
  const [done, setDone] = useState<ImportResult | null>(null);

  /** Drop the file, its preview and its errors. The result is separate — after
      a successful import it is the only thing left saying what happened. */
  const clearFile = () => {
    setCsv(null);
    setFileName(null);
    setPreview(null);
    setIssues([]);
  };

  /**
   * The full error list, not the sentence, and the rows that were fine.
   *
   * The action puts every issue in `metadata` and also builds a message capped
   * at twelve for callers that can only show a string. This screen can show all
   * of them, and must: a 45-row file with twenty mistakes is twenty things to
   * fix, and hiding eight of them behind "…and 8 more" means a second upload to
   * discover what they were.
   */
  const readFailure = (metadata: unknown): { issues: CsvIssue[]; preview: ImportPreview | null } => {
    if (!metadata || typeof metadata !== "object") return { issues: [], preview: null };
    const m = metadata as { issues?: unknown; preview?: unknown };
    return {
      issues: Array.isArray(m.issues) ? (m.issues as CsvIssue[]) : [],
      preview: m.preview && typeof m.preview === "object" ? (m.preview as ImportPreview) : null,
    };
  };

  const onFile = async (file: File) => {
    clearFile();
    setMessage(null);
    setDone(null);
    setReading(true);
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    start(async () => {
      const res = await previewAction(text);
      setReading(false);
      if (res.ok) {
        setPreview(res.data);
      } else {
        const failure = readFailure(res.error.metadata);
        setIssues(failure.issues);
        setPreview(failure.preview);
        /* Only fall back to the sentence when there is no structured list —
           an auth or size refusal, which is one line and has no row. */
        if (failure.issues.length === 0) setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const doImport = () => {
    if (!csv) return;
    setMessage(null);
    start(async () => {
      const res = await importAction(csv);
      if (res.ok) {
        setDone(res.data);
        clearFile();
        router.refresh();
      } else {
        /* The file and its preview stay. Nothing was written, so the same file
           can be confirmed again, or a corrected one chosen. */
        const failure = readFailure(res.error.metadata);
        setIssues(failure.issues);
        setMessage({
          ok: false,
          text:
            failure.issues.length > 0
              ? "The file no longer passes the check. Nothing was written."
              : `${res.error.message}\nNothing was written. Press confirm to try the same file again, or choose a corrected file.`,
        });
      }
    });
  };

  const templateHref =
    "data:text/csv;charset=utf-8," + encodeURIComponent(CATALOGUE_CSV_TEMPLATE);

  const busy = pending || reading;
  const rejectedLines = new Set(issues.map((i) => i.line)).size;
  const blocked = issues.length > 0;
  const ready = preview !== null && preview.toCreate.length > 0 && !blocked;

  return (
    <section id="import" className="scroll-mt-4 rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">Import products from a CSV file</h2>
      <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
        For adding many products at once. Every imported product starts as a draft, and nothing is
        written until you have seen the preview and confirmed. An import only adds products: it
        never changes the price or stock of one that already exists.
      </p>

      <ol className="mt-3 grid gap-2 text-[12px] font-semibold text-ink-700 sm:grid-cols-5">
        {["Download the template", "Choose your file", "Read the preview", "Confirm", "Review the new drafts"].map(
          (label, i) => (
            <li key={label} className="rounded-field bg-chip-soft px-3 py-2">
              <span className="mr-1.5 font-extrabold text-ink">{i + 1}</span>
              {label}
            </li>
          )
        )}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={templateHref}
          download="vertical-express-catalogue-template.csv"
          className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold leading-10 text-ink no-underline"
        >
          Download template
        </a>
        <label className="h-10 cursor-pointer rounded-panel bg-ink px-4 text-[13px] font-bold leading-10 text-white">
          {reading ? "Reading…" : fileName ? "Choose another file" : "Choose CSV file"}
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
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
      <p className="mt-2 text-[11.5px] font-medium leading-[16px] text-ink-500">
        The template&rsquo;s first line is the header and must stay as it is. Its example lines begin
        with # and are ignored. Brand, category and warehouse must already exist here, spelled the
        same way. Prices include GST.
      </p>

      {done && (
        <div role="status" className="mt-3 rounded-panel bg-ops-ok-tint p-3.5">
          <p className="text-[12.5px] font-bold text-ops-ok">
            {done.created} {done.created === 1 ? "product" : "products"} created as{" "}
            {done.created === 1 ? "a draft" : "drafts"}
            {done.skipped > 0 ? `; ${done.skipped} already existed and ${done.skipped === 1 ? "was" : "were"} left alone.` : "."}
          </p>
          {done.products.length > 0 && (
            <>
              <p className="mt-1 text-[11.5px] font-medium leading-[16px] text-ink-700">
                Customers cannot see a draft. Open each one to add its photo and publish it.
              </p>
              <ul className="mt-2 flex flex-col gap-0.5">
                {done.products.map((p) => (
                  <li key={p.slug} className="text-[12px] font-semibold">
                    <Link href={`/admin/products/${p.slug}`} className="font-bold text-ink underline">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/products?status=draft"
                className="mt-2.5 inline-block text-[12px] font-bold text-ink underline"
              >
                See all drafts, most recently changed first
              </Link>
            </>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            "mt-3 whitespace-pre-line rounded-panel p-3.5 text-[12.5px] font-semibold leading-relaxed " +
            (message.ok ? "bg-chip-soft text-ink" : "bg-ops-bad-tint text-ops-bad")
          }
        >
          {message.text}
        </p>
      )}

      {(preview || issues.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Preview summary">
          <Count n={preview?.toCreate.length ?? 0} label="will be created" tone="ok" />
          <Count n={preview?.skipped.length ?? 0} label="skipped" tone="mute" />
          <Count n={rejectedLines} label="rejected" tone={rejectedLines > 0 ? "bad" : "mute"} />
        </div>
      )}

      {issues.length > 0 && <IssueList issues={issues} />}

      {preview && (
        <div className="mt-4 flex flex-col gap-3">
          {preview.toCreate.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-2 text-[12px] font-bold text-ink">
                {blocked ? "These rows are fine, and will be created once the rejected rows are fixed" : "Will be created"}
              </p>
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                    <th className="px-3 pb-2.5">Line</th>
                    <th className="px-3 pb-2.5">Product</th>
                    <th className="px-3 pb-2.5">Brand</th>
                    <th className="px-3 pb-2.5">Price</th>
                    <th className="px-3 pb-2.5">Stock</th>
                    <th className="px-3 pb-2.5">60-min</th>
                    <th className="px-3 pb-2.5">Starts as</th>
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
                        Draft
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
                Skipped — these already exist and are left exactly as they are
              </p>
              <p className="mt-1 text-[11.5px] font-medium leading-[16px] text-ink-500">
                An import never changes an existing product&rsquo;s price or stock. Edit those on the
                product&rsquo;s own page, deliberately.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {preview.skipped.map((s) => (
                  <li key={`${s.line}-${s.slug}`} className="text-[11.5px] font-semibold leading-[16px] text-ink-700">
                    <span className="font-extrabold text-ink">Line {s.line}</span> · {s.title} — {s.message}{" "}
                    <Link href={`/admin/products/${s.existingSlug}`} className="font-bold text-ink underline">
                      Open it
                    </Link>
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
                ? "Creating…"
                : `Confirm: create ${preview.toCreate.length} ${preview.toCreate.length === 1 ? "draft" : "drafts"}`}
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
            {blocked ? (
              <span className="text-[12px] font-semibold text-ops-bad">
                Fix the rejected rows in your file and choose it again. A file is created all together or not at all.
              </span>
            ) : (
              !ready && (
                <span className="text-[12px] font-semibold text-ink-500">
                  Every product in this file already exists, so there is nothing to create.
                </span>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Every problem in the file, grouped by the row it is on.
 *
 * Grouped rather than listed flat because the unit of work is a row: a person
 * fixes line 7 once, not three times. The column is named on each line so the
 * cell can be found without counting commas, and the count at the top is what
 * says whether this is a typo or the wrong file entirely.
 */
function IssueList({ issues }: { issues: CsvIssue[] }) {
  const byLine = new Map<number, CsvIssue[]>();
  for (const i of issues) {
    const list = byLine.get(i.line);
    if (list) list.push(i);
    else byLine.set(i.line, [i]);
  }
  const lines = [...byLine.entries()].sort((a, b) => a[0] - b[0]);
  const rowWord = lines.length === 1 ? "row" : "rows";

  return (
    <div role="alert" className="mt-3 rounded-panel bg-ops-bad-tint p-3.5">
      <p className="text-[12.5px] font-bold text-ops-bad">
        Rejected: {issues.length} {issues.length === 1 ? "problem" : "problems"} in {lines.length}{" "}
        {rowWord}. Nothing has been written.
      </p>
      <p className="mt-1 text-[11.5px] font-medium leading-[16px] text-ops-bad">
        Fix these in your spreadsheet and choose the file again. Line numbers count the
        header, so they match what the spreadsheet shows.
      </p>

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {lines.map(([line, forLine]) => (
          <li key={line} className="rounded-[12px] bg-white/70 px-3 py-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-ops-bad">
              Line {line}
            </span>
            <ul className="mt-1 flex flex-col gap-0.5">
              {forLine.map((i, n) => (
                <li key={n} className="text-[12px] font-semibold leading-[17px] text-ink">
                  {i.column && i.column !== "file" && i.column !== "header" && (
                    <span className="mr-1.5 rounded-chip bg-chip px-1.5 py-0.5 text-[10.5px] font-bold text-ink-700">
                      {i.column}
                    </span>
                  )}
                  {i.message}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: "ok" | "mute" | "bad" }) {
  return (
    <span
      className={
        "inline-flex items-baseline gap-1.5 rounded-chip px-3 py-1.5 " +
        (tone === "ok" ? "bg-ops-ok-tint text-ops-ok" : tone === "bad" ? "bg-ops-bad-tint text-ops-bad" : "bg-chip text-ink-700")
      }
    >
      <span className="text-[15px] font-extrabold tabular-nums">{n}</span>
      <span className="text-[11.5px] font-bold">{label}</span>
    </span>
  );
}
