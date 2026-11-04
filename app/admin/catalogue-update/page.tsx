import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/services/admin/authz";
import { CatalogueUpdate } from "@/components/admin/catalogue-update";
import { adminApplyCatalogueUpdate, adminExportCatalogueUpdate, adminPreviewCatalogueUpdate } from "@/actions/catalogue";

export const metadata: Metadata = {
  title: "Prices & stock files | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCatalogueUpdate() {
  /* Backstop for the layout gate, as on the listing page. */
  if (!(await getAdminUser())) return null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Prices &amp; stock files</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          Update variants, MRPs, prices and shelf counts of products already in the catalogue. New products are listed on{" "}
          <Link href="/admin/listing" className="font-bold text-ink no-underline hover:underline">Listing</Link>; publishing is done on each{" "}
          <Link href="/admin/products" className="font-bold text-ink no-underline hover:underline">product</Link>.
        </p>
      </div>
      <CatalogueUpdate
        actions={{ preview: adminPreviewCatalogueUpdate, apply: adminApplyCatalogueUpdate, exportSheet: adminExportCatalogueUpdate }}
      />
    </div>
  );
}
