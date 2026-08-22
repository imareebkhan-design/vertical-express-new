"use client";

import React, { useState, useRef, useTransition, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  RefreshCw,
  Layers,
  Package,
  Wrench,
  Zap,
  Droplet,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Category } from "@/prisma/generated/client/client";
import { triggerHaptic } from "@/lib/native/haptics";

const GROUP_TITLES: Record<string, string> = {
  civil_interiors: "Civil & Interiors",
  furniture_hardware: "Furniture & Hardware",
  electrical: "Electrical & Power",
  plumbing_bath: "Plumbing & Bath",
  tools: "Tools & Equipment",
  other: "Other Materials",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GROUP_ICONS: Record<string, React.ComponentType<any>> = {
  civil_interiors: Package,
  furniture_hardware: Layers,
  electrical: Zap,
  plumbing_bath: Droplet,
  tools: Wrench,
  other: HelpCircle,
};

function getGroupIcon(group: string) {
  return GROUP_ICONS[group] || HelpCircle;
}

interface MobileCategoriesViewProps {
  categories: Category[];
}

export function MobileCategoriesView({ categories }: MobileCategoriesViewProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Pull to refresh gesture states
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const [, startTransition] = useTransition();

  // Accordion state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    civil_interiors: true, // open first by default
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRefresh = () => {
    triggerHaptic("medium");
    setRefreshing(true);
    setPullY(0);

    startTransition(async () => {
      router.refresh();
      setTimeout(() => {
        setRefreshing(false);
        triggerHaptic("light");
      }, 1000);
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0) {
      setPullY(Math.min(diff * 0.4, 80));
    }
  };

  const handleTouchEnd = () => {
    setIsPulling(false);
    if (pullY > 55) {
      handleRefresh();
    } else {
      setPullY(0);
    }
  };

  const toggleGroup = (group: string) => {
    triggerHaptic("light");
    setOpenGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  // Group categories by CategoryGroup enum
  const groupedCategories = categories.reduce((acc, cat) => {
    const grp = cat.group || "other";
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(cat);
    return acc;
  }, {} as Record<string, Category[]>);

  // Extract popular bulk categories for the header slider
  const popularCats = categories.filter((c) => c.isBulk).slice(0, 5);

  if (!mounted) return <CategoriesSkeleton />;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex flex-col min-h-screen bg-surface pb-24 overflow-x-hidden"
    >
      {/* Pull-to-refresh spinner */}
      <div
        className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-150"
        style={{
          top: `${pullY - 44}px`,
          opacity: pullY > 15 ? 1 : 0,
        }}
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-white shadow-md text-brand-deep">
          <RefreshCw className={`size-4 ${refreshing || pullY > 55 ? "animate-spin text-brand" : ""}`} />
        </div>
      </div>

      {/* Sticky Top Header */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <h1 className="text-base font-extrabold text-ink">All Categories</h1>
        <button
          onClick={handleRefresh}
          className={`flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink transition-transform ${
            refreshing ? "animate-spin text-brand-deep" : ""
          }`}
          title="Refresh Categories"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Popular Categories Horizontal Scroller */}
      {popularCats.length > 0 && (
        <div className="py-3.5 border-b border-mist/10">
          <div className="flex items-center gap-1.5 px-4 mb-2.5">
            <TrendingUp className="size-4 text-brand-deep" />
            <h2 className="text-xs font-extrabold text-ink uppercase tracking-wide">Popular Wholesale</h2>
          </div>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4">
            {popularCats.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                onClick={() => triggerHaptic("light")}
                className="flex items-center gap-2.5 shrink-0 rounded-2xl bg-white border border-mist/20 p-2.5 shadow-xs transition-transform active:scale-95"
              >
                <div className="relative size-8 overflow-hidden rounded-lg bg-surface-soft">
                  {cat.imageUrl ? (
                    <Image
                      src={cat.imageUrl}
                      alt={cat.name}
                      fill
                      className="object-cover"
                      sizes="32px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-brand-deep/10 text-[9px] font-extrabold text-brand-deep">VE</div>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink leading-tight">{cat.name}</h3>
                  <span className="text-[8px] font-bold text-brand-deep uppercase">Bulk savings</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Hierarchical Accordions */}
      <div className="p-4 space-y-3">
        {Object.entries(GROUP_TITLES).map(([groupKey, title]) => {
          const items = groupedCategories[groupKey] || [];
          if (items.length === 0) return null;

          const isOpen = !!openGroups[groupKey];
          const GroupIcon = getGroupIcon(groupKey);

          return (
            <div
              key={groupKey}
              className="overflow-hidden rounded-2xl border border-mist/20 bg-white shadow-xs"
            >
              {/* Accordion Group Header */}
              <button
                onClick={() => toggleGroup(groupKey)}
                className="flex w-full items-center justify-between px-4 py-4 text-left font-bold text-ink active:bg-mist/10"
                style={{ minHeight: "48px" }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-brand-deep/10 text-brand-deep">
                    <GroupIcon className="size-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-ink leading-none">{title}</h3>
                    <span className="text-[10px] text-ink/40 font-semibold mt-1 block">
                      {items.length} {items.length === 1 ? "category" : "categories"}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`size-4 text-ink/45 transition-transform duration-300 ${
                    isOpen ? "rotate-180 text-brand-deep" : ""
                  }`}
                />
              </button>

              {/* Accordion Children Panel */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: "easeInOut" }}
                  >
                    <div className="border-t border-mist/15 bg-surface-container-low/30 p-4">
                      <div className="grid grid-cols-2 gap-3">
                        {items.map((cat) => (
                          <Link
                            key={cat.slug}
                            href={`/category/${cat.slug}`}
                            onClick={() => triggerHaptic("light")}
                            className="flex flex-col items-center justify-center rounded-xl border border-mist/20 bg-white p-3.5 text-center shadow-xs transition-transform active:scale-[0.97]"
                          >
                            <div className="relative aspect-square w-full max-w-[80px] overflow-hidden rounded-lg bg-surface-soft mb-2.5">
                              {cat.imageUrl ? (
                                <Image
                                  src={cat.imageUrl}
                                  alt={cat.name}
                                  fill
                                  loading="lazy"
                                  className="object-cover"
                                  sizes="80px"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center bg-brand-deep/5 text-xs font-bold text-brand-deep/30">
                                  No Image
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-ink leading-tight truncate w-full">
                              {cat.name}
                            </span>
                            {cat.isBulk && (
                              <span className="mt-1 rounded-md bg-brand-deep/10 px-1 py-0.5 text-[8px] font-extrabold uppercase text-brand-deep leading-none">
                                Wholesale
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)]">
        <div className="h-4.5 w-32 bg-mist/30 rounded-full" />
        <div className="size-8 rounded-full bg-mist/30" />
      </div>

      {/* Horizontal List Skeleton */}
      <div className="py-4 space-y-3">
        <div className="h-3 w-28 bg-mist/30 px-4 rounded-full" />
        <div className="flex gap-3 px-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex min-w-[120px] items-center gap-2 rounded-2xl bg-mist/20 p-3">
              <div className="size-8 rounded-lg bg-mist/30" />
              <div className="space-y-1">
                <div className="h-2 w-12 bg-mist/30 rounded-full" />
                <div className="h-1.5 w-8 bg-mist/20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accordion Skeletons */}
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-mist/20 border border-mist/20" />
        ))}
      </div>
    </div>
  );
}
