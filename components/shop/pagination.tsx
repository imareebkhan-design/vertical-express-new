"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, perPage, total }: { page: number; perPage: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;

  const go = (p: number) => {
    const params = new URLSearchParams(searchParams);
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  const windowPages = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pages || Math.abs(p - page) <= 1
  );

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="grid size-10 cursor-pointer place-items-center rounded-full border border-neutral-200 transition-all hover:border-ink disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      {windowPages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && windowPages[i - 1] !== p - 1 && (
            <span className="px-1 text-sm font-bold text-neutral-400">…</span>
          )}
          <button
            onClick={() => go(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-full text-sm font-extrabold transition-all",
              p === page ? "bg-ink text-white" : "border border-neutral-200 hover:border-ink"
            )}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        onClick={() => go(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
        className="grid size-10 cursor-pointer place-items-center rounded-full border border-neutral-200 transition-all hover:border-ink disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
