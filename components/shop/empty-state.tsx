import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  caption,
  actionLabel = "Browse all categories",
  actionHref = "/categories",
}: {
  title: string;
  caption: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="mb-4 grid size-20 place-items-center rounded-full bg-tile">
        <PackageSearch className="size-10 text-sky-900/30" strokeWidth={1.4} aria-hidden />
      </span>
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm font-semibold text-neutral-500">{caption}</p>
      <Link href={actionHref} className="mt-6">
        <Button>{actionLabel}</Button>
      </Link>
    </div>
  );
}
