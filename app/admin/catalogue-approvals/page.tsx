import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/services/admin/authz";
import { APPROVAL_BATCHES, PACK_SENSITIVE, approvalBatchView } from "@/lib/services/admin/catalogue-approval";
import { BoundApprovalForm } from "@/components/admin/approval-form-bound";
import { BoundBulkApproval } from "@/components/admin/bulk-approval-bound";

export const metadata: Metadata = { title: "Catalogue approvals | Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Owner review of product identity and primary photo, one product at a time.
 * A product becomes public (catalog-only) only through a decision recorded
 * here. Approvals from history, checksums or licences are never assumed.
 */
export default async function CatalogueApprovals({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  if (!(await getAdminUser())) return null;
  const { batch: requested } = await searchParams;
  const batches = Object.keys(APPROVAL_BATCHES);
  const batch = requested && APPROVAL_BATCHES[requested] ? requested : batches[0];
  const products = await approvalBatchView(batch);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">Catalogue approvals — {batch}</h1>
      <p className="mb-4 text-sm font-semibold text-neutral-500">
        Check the photo against the title and specifications. Record a decision per product. Changing a photo or the
        product later clears the approval automatically.
      </p>
      <nav aria-label="Batches" className="mb-6 flex flex-wrap gap-2">
        {batches.map((b) => (
          <Link key={b} href={`/admin/catalogue-approvals?batch=${b}`} aria-current={b === batch ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-extrabold ${b === batch ? "border-ink bg-ink text-white" : "border-neutral-300"}`}>
            {b} ({APPROVAL_BATCHES[b].length})
          </Link>
        ))}
      </nav>
      <BoundBulkApproval
        rows={products.flatMap((p) => {
          const img = p.images.find((i) => i.isPrimary);
          if (!img || !img.sha256 || p.identityApprovedAt) return [];
          return [{
            productId: p.id, imageId: img.id, sha256: img.sha256, updatedAt: p.updatedAt.toISOString(),
            title: p.title, brand: p.brand.name, url: img.url, packSensitive: PACK_SENSITIVE.test(p.title),
          }];
        })}
      />
      <ol className="space-y-6">
        {products.map((p) => {
          const primary = p.images.find((i) => i.isPrimary);
          return (
            <li key={p.id} className="grid gap-4 rounded-card border border-neutral-100 bg-white p-4 shadow-card md:grid-cols-[280px_1fr]">
              <div>
                {primary ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the exact stored bytes, not an optimised variant
                  <img src={primary.url} alt={p.title} className="aspect-square w-full rounded-lg bg-white object-contain" />
                ) : <p className="text-sm font-bold text-danger">No primary image — cannot be approved</p>}
                {primary && (
                  <p className="mt-2 break-all text-[11px] font-semibold text-neutral-500">
                    image {primary.id}<br />sha256 {primary.sha256}<br />status {primary.approvalStatus}{primary.severity ? ` ${primary.severity}` : ""}
                    {primary.sourceUrl && (<><br /><a href={primary.sourceUrl} className="underline" target="_blank" rel="noreferrer">manufacturer source</a></>)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-neutral-500">{p.brand.name} · {p.category.name} · {p.status}</p>
                <h2 className="text-lg font-extrabold">{p.title}</h2>
                <p className="mb-3 text-xs font-semibold text-neutral-500">
                  {p.identityConfirmed ? `Identity confirmed — ${p.identityApprovalReason}` : "Identity not confirmed"}
                </p>
                {p.specs && typeof p.specs === "object" && (
                  <dl className="mb-4 grid grid-cols-2 gap-x-4 text-xs">
                    {Object.entries(p.specs as Record<string, unknown>).slice(0, 12).map(([k, v]) => (
                      <div key={k} className="contents"><dt className="font-bold text-neutral-500">{k}</dt><dd className="font-semibold">{String(v)}</dd></div>
                    ))}
                  </dl>
                )}
                {primary?.sha256 ? (
                  <BoundApprovalForm productId={p.id} imageId={primary.id} sha256={primary.sha256} updatedAt={p.updatedAt.toISOString()} packSensitive={PACK_SENSITIVE.test(p.title)} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
