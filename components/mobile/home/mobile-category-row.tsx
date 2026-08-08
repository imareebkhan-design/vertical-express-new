"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck, Wrench, Package } from "lucide-react";
import { triggerHaptic } from "@/lib/native/haptics";

const CATEGORY_ITEMS = [
  { slug: "adhesives", name: "Adhesives", icon: Layers, count: "24 items" },
  { slug: "cement", name: "Cement", icon: Package, count: "18 items" },
  { slug: "waterproofing", name: "Waterproofing", icon: ShieldCheck, count: "12 items" },
  { slug: "tools", name: "Tools", icon: Wrench, count: "30 items" },
];

export function MobileCategoryRow() {
  const handleTouch = () => {
    triggerHaptic("light");
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-sm font-bold tracking-tight text-ink uppercase">Top Categories</h2>
        <Link
          href="/categories"
          onClick={handleTouch}
          className="flex items-center text-xs font-semibold text-brand-deep hover:underline"
        >
          View All <ArrowRight className="ml-1 size-3" />
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
        {CATEGORY_ITEMS.map((cat) => {
          const Icon = cat.icon;
          return (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              onClick={handleTouch}
              className="flex min-w-[110px] flex-col items-center justify-center rounded-2xl border border-mist/30 bg-surface p-3.5 text-center shadow-xs transition-transform active:scale-95"
            >
              <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-brand-deep/10 text-brand-deep">
                <Icon className="size-5" />
              </div>
              <span className="text-xs font-bold text-ink truncate w-full">{cat.name}</span>
              <span className="text-[10px] text-ink/50 mt-0.5">{cat.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
