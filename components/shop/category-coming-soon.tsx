import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductPanel } from "@/components/ui/product-panel";
import type { DirectoryEntry } from "@/lib/category-directory";

/**
 * A designated category with nothing approved on it yet (lib/category-directory.ts).
 *
 * Says so plainly, and always offers somewhere to go (issue #26): stocked
 * categories in the same department, topped up from other departments when
 * that one has none (`comingSoonNextSteps`), then the full index. Deliberately
 * carries no product count, price, stock line, date or basket action: there is
 * nothing here to buy, and nothing here may imply otherwise.
 */
export function CategoryComingSoon({
  slug,
  name,
  siblings,
  elsewhere = [],
}: {
  slug: string;
  name: string;
  /** Stocked categories in the same department. */
  siblings: DirectoryEntry[];
  /** Stocked categories from other departments, when this one has too few. */
  elsewhere?: DirectoryEntry[];
}) {
  return (
    <section aria-labelledby="coming-soon-title" className="mx-auto w-full max-w-[720px] text-center">
      <ProductPanel
        use="category"
        categorySlug={slug}
        label={name}
        className="mx-auto aspect-square w-[min(56vw,220px)] rounded-[24px]"
        glyphClassName="size-1/2"
      />
      <p className="mt-5 inline-flex rounded-full bg-chip px-3 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-ink-700">
        Coming soon
      </p>
      <h2 id="coming-soon-title" className="mt-3 text-2xl font-extrabold tracking-[-0.025em] text-ink">
        {name} is on its way
      </h2>
      <p className="mx-auto mt-2 max-w-[440px] text-[14px] leading-[21px] text-ink-700">
        We are still adding products to this category. Nothing here is available to order yet.
      </p>

      <NextList title="Available in this department" entries={siblings} />
      <NextList title={siblings.length ? "Also available" : "Available now"} entries={elsewhere} />

      <Link
        href="/categories"
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-bold text-white no-underline hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Browse all categories
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

function NextList({ title, entries }: { title: string; entries: DirectoryEntry[] }) {
  if (entries.length === 0) return null;
  const id = `next-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="mt-8 text-left">
      <h3 id={id} className="text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h3>
      <ul aria-labelledby={id} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/category/${c.slug}`}
              className="group flex flex-col items-center rounded-[20px] no-underline outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink"
            >
              <ProductPanel
                use="category"
                categorySlug={c.slug}
                label={c.name}
                className="ve-cat-tile aspect-square w-full rounded-[18px]"
                glyphClassName="size-1/2"
              />
              <span className="mt-2 text-center text-[12.5px] font-semibold leading-4 text-ink">{c.shortName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
