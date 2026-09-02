import type { Metadata } from "next";
import Link from "next/link";
import { listingFormOptions } from "@/lib/services/admin/product-create";
import { ListingForm } from "@/components/admin/listing-form";

export const metadata: Metadata = {
  title: "List a product | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminListing() {
  const options = await listingFormOptions();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">List a product</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          Put something new on the shelf.{" "}
          <Link href="/admin/products" className="font-bold text-ink no-underline hover:underline">
            All products
          </Link>
        </p>
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
        <ListingForm options={options} />
      )}
    </div>
  );
}
