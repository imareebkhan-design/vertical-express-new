import type { Metadata } from "next";
import Link from "next/link";
import { listingFormOptions } from "@/lib/services/admin/product-create";
import { ListingForm } from "@/components/admin/listing-form";
import { CatalogueImport } from "@/components/admin/catalogue-import";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Add products | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminListing() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const options = await listingFormOptions();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/products"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500 no-underline hover:underline"
        >
          ← Products
        </Link>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">Add products</h1>
        <p className="mt-0.5 text-[12px] font-semibold text-ink-500">
          Everything added here starts as a draft that customers cannot see. You decide when each one goes live, on its own page.
        </p>
        <nav aria-label="Ways to add products" className="mt-3 flex flex-wrap gap-2">
          <a href="#add" className="rounded-chip bg-ink px-3.5 py-1.5 text-[12px] font-bold text-white no-underline">
            Add one product
          </a>
          <a href="#import" className="rounded-chip bg-chip px-3.5 py-1.5 text-[12px] font-bold text-ink no-underline hover:bg-hush">
            Import a CSV file
          </a>
          <Link href="/admin/products?status=draft" className="rounded-chip bg-chip px-3.5 py-1.5 text-[12px] font-bold text-ink no-underline hover:bg-hush">
            Review &amp; publish drafts
          </Link>
        </nav>
      </div>

      {options.brands.length === 0 ? (
        /* A product cannot exist without a brand — the column is required. Sending
           somebody into a form whose first field has nothing in it wastes their
           time; say where to go instead. */
        <p className="rounded-panel bg-ops-warn-tint p-4 text-[12.5px] font-semibold leading-relaxed text-ops-warn">
          There are no active brands, and a product must have one.{" "}
          <Link href="/admin/brands" className="underline">
            Add a brand first
          </Link>
          .
        </p>
      ) : (
        <>
          {/* One product at a time comes first: the launch is a handful of
              products the owner enters by hand. The file is for the larger
              batches that follow, and sits below. */}
          <div id="add" className="flex scroll-mt-4 flex-col gap-3">
            <h2 className="text-[17px] font-extrabold tracking-tight">Add one product</h2>
            <ListingForm options={options} />
          </div>
          <CatalogueImport />
        </>
      )}
    </div>
  );
}
