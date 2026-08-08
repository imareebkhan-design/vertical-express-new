"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Sparkles,
  Flame,
  ArrowRight,
  Clock,
  TrendingUp,
  HelpCircle,
  Layers,
  Package,
  ShieldCheck,
  Wrench,
  Paintbrush,
  Zap,
  Droplet,
} from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import type { Category } from "@prisma/client";
import type { RecentlyViewedItem } from "@/components/shop/recently-viewed";
import { MobileHeader } from "./mobile-header";
import { MobileSearchBar } from "./mobile-search-bar";
import { MobileProductCard } from "./mobile-product-card";
import { triggerHaptic } from "@/lib/native/haptics";
import { formatPaise } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATEGORY_ICONS: Record<string, React.ComponentType<any>> = {
  adhesives: Layers,
  cement: Package,
  waterproofing: ShieldCheck,
  tools: Wrench,
  painting: Paintbrush,
  electrical: Zap,
  plumbing: Droplet,
};

function getCategoryIcon(slug: string) {
  return CATEGORY_ICONS[slug] || HelpCircle;
}

interface HomeBanner {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  bgGradient: string;
}

const HERO_BANNERS: HomeBanner[] = [
  {
    id: "express-delivery",
    title: "60-Min Site Delivery",
    subtitle: "Cement, tools, and adhesives straight to your jobsite.",
    badge: "FASTEST DELIVERY",
    href: "/categories",
    bgGradient: "bg-gradient-to-r from-amber-500 to-orange-600",
  },
  {
    id: "bulk-savings",
    title: "Contractor Bulk Pricing",
    subtitle: "Save up to 15% extra on pallet & truckload orders.",
    badge: "BULK SAVINGS",
    href: "/category/cement",
    bgGradient: "bg-gradient-to-r from-blue-600 to-indigo-700",
  },
  {
    id: "gst-invoicing",
    title: "Get 18% GST Input Credit",
    subtitle: "Enter your GSTIN at checkout for instant formal tax invoices.",
    badge: "BUSINESS BENEFITS",
    href: "/account",
    bgGradient: "bg-gradient-to-r from-emerald-600 to-teal-700",
  },
];

interface MobileHomeViewProps {
  deals: CatalogItem[];
  featured: CatalogItem[];
  newArrivals: CatalogItem[];
  categories: Category[];
}

export function MobileHomeView({ deals, featured, newArrivals, categories }: MobileHomeViewProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lastViewed, setLastViewed] = useState<RecentlyViewedItem | null>(null);

  // Pull to refresh gesture states
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
    // Load last viewed product from local storage
    try {
      const raw = localStorage.getItem("ve_recently_viewed_items");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.length > 0) {
          setLastViewed(parsed[0]);
        }
      }
    } catch {}
  }, []);

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good morning 👋";
    if (hrs < 17) return "Good afternoon ☀️";
    return "Good evening 🌙";
  };

  const handleRefresh = () => {
    triggerHaptic("medium");
    setRefreshing(true);
    setPullY(0);

    startTransition(async () => {
      router.refresh();
      // Reload last viewed product
      try {
        const raw = localStorage.getItem("ve_recently_viewed_items");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.length > 0) {
            setLastViewed(parsed[0]);
          }
        }
      } catch {}
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
      // Dragging down: apply elastic scaling
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

  if (!mounted) return <HomeSkeleton />;

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

      {/* Sticky Mobile Header */}
      <MobileHeader hasNotifications={true} />

      {/* Greeting Section */}
      <div className="px-4 pt-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-ink leading-tight">{getGreeting()}</h1>
          <p className="text-xs text-ink/50 mt-0.5">Quick site delivery for all materials</p>
        </div>
        <button
          onClick={handleRefresh}
          className={`flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink transition-transform ${
            refreshing ? "animate-spin text-brand-deep" : "hover:bg-mist/30"
          }`}
          title="Refresh Feed"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Search Bar Shortcut */}
      <MobileSearchBar />

      {/* Dynamic Continue Shopping Card */}
      {lastViewed && (
        <div className="px-4 py-1">
          <Link
            href={`/product/${lastViewed.slug}`}
            onClick={() => triggerHaptic("light")}
            className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/5 p-3 shadow-xs transition-transform active:scale-[0.98]"
          >
            <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-white border border-mist/20">
              {lastViewed.imageUrl ? (
                <Image
                  src={lastViewed.imageUrl}
                  alt={lastViewed.title}
                  fill
                  className="object-contain p-1"
                  sizes="48px"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-ink/30">No Image</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="inline-block rounded-full bg-brand-deep/10 px-2 py-0.5 text-[8px] font-extrabold uppercase text-brand-deep leading-none">
                Continue Shopping
              </span>
              <h4 className="truncate text-xs font-bold text-ink mt-0.5 leading-tight">{lastViewed.title}</h4>
              <p className="text-[10px] text-ink/50 leading-none mt-1">
                {lastViewed.brandName} • {formatPaise(lastViewed.pricePaise)}
              </p>
            </div>
            <ArrowRight className="size-3.5 text-brand-deep shrink-0 mr-1" />
          </Link>
        </div>
      )}

      {/* Hero Banners Carousel */}
      <div className="px-4 py-3">
        <div className="scrollbar-hide flex gap-3 overflow-x-auto snap-x snap-mandatory">
          {HERO_BANNERS.map((b) => (
            <Link
              key={b.id}
              href={b.href}
              onClick={() => triggerHaptic("light")}
              className={`snap-center relative min-w-[280px] max-w-[300px] flex-1 rounded-3xl p-5 text-white shadow-card transition-transform active:scale-[0.98] ${b.bgGradient}`}
            >
              <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-xs">
                {b.badge}
              </span>
              <h2 className="mt-2 text-base font-extrabold leading-snug">{b.title}</h2>
              <p className="mt-1 text-xs opacity-90">{b.subtitle}</p>
              <div className="mt-4 inline-flex items-center text-xs font-bold underline">
                Explore Offers <ArrowRight className="ml-1 size-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Categories Preview */}
      <div className="py-3">
        <div className="flex items-center justify-between px-4 mb-2.5">
          <h2 className="text-sm font-extrabold tracking-tight text-ink uppercase">Top Categories</h2>
          <Link
            href="/categories"
            onClick={() => triggerHaptic("light")}
            className="flex items-center text-xs font-bold text-brand-deep hover:underline"
          >
            View All <ArrowRight className="ml-1 size-3" />
          </Link>
        </div>

        <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-2">
          {categories.slice(0, 8).map((cat) => {
            const Icon = getCategoryIcon(cat.slug);
            return (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                onClick={() => triggerHaptic("light")}
                className="flex min-w-[100px] flex-col items-center justify-center rounded-2xl border border-mist/20 bg-surface p-3 text-center shadow-xs transition-transform active:scale-95"
              >
                <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-brand-deep/10 text-brand-deep">
                  <Icon className="size-5" />
                </div>
                <span className="text-xs font-bold text-ink truncate w-full">{cat.name}</span>
                <span className="text-[9px] text-ink/40 mt-0.5">Explore</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Product Scroller Feed */}
      <div className="space-y-4">
        {/* Hot Deals & Offers */}
        <ProductSection
          title="Hot Deals"
          subtitle="Exclusive discounts on core essentials"
          items={deals}
          icon={<Flame className="size-4 text-danger fill-danger" />}
        />

        {/* Featured Products */}
        <ProductSection
          title="Featured Supplies"
          subtitle="Top rated building products"
          items={featured}
          icon={<Sparkles className="size-4 text-brand" />}
        />

        {/* Best Sellers */}
        <ProductSection
          title="Best Sellers"
          subtitle="Most ordered on-site essentials"
          items={featured.slice().reverse()} // reversing list to generate seller diversity without extra query
          icon={<TrendingUp className="size-4 text-emerald-600" />}
        />

        {/* New Arrivals */}
        <ProductSection
          title="New Arrivals"
          subtitle="Fresh stock and tools catalogs"
          items={newArrivals}
          icon={<Clock className="size-4 text-blue-600" />}
        />
      </div>
    </div>
  );
}

interface ProductSectionProps {
  title: string;
  subtitle?: string;
  items: CatalogItem[];
  icon?: React.ReactNode;
}

function ProductSection({ title, subtitle, items, icon }: ProductSectionProps) {
  if (!items || items.length === 0) {
    return (
      <section className="px-4 py-3">
        <h2 className="text-sm font-extrabold text-ink uppercase mb-2">{title}</h2>
        <div className="rounded-2xl border border-dashed border-mist/30 p-8 text-center text-xs text-ink/40">
          No items found in this section.
        </div>
      </section>
    );
  }

  return (
    <section className="py-2.5">
      <div className="flex items-center justify-between px-4 mb-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            {icon}
            <h2 className="text-sm font-extrabold tracking-tight text-ink uppercase leading-none">{title}</h2>
          </div>
          {subtitle && <p className="text-[10px] text-ink/40 font-semibold mt-1 leading-none">{subtitle}</p>}
        </div>
      </div>
      <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
        {items.map((item) => (
          <div key={item.id} className="snap-center shrink-0 w-[148px]">
            <MobileProductCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)]">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-mist/30" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-16 bg-mist/30 rounded-full" />
            <div className="h-3 w-28 bg-mist/30 rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-full bg-mist/30" />
          <div className="size-9 rounded-full bg-mist/30" />
        </div>
      </div>

      {/* Greeting Skeleton */}
      <div className="px-4 pt-4 space-y-2">
        <div className="h-4 w-36 bg-mist/30 rounded-full" />
        <div className="h-3 w-48 bg-mist/20 rounded-full" />
      </div>

      {/* Search Bar Skeleton */}
      <div className="px-4 py-3">
        <div className="h-10 w-full bg-mist/30 rounded-2xl" />
      </div>

      {/* Hero Banners Skeleton */}
      <div className="px-4 py-2">
        <div className="h-32 w-[280px] bg-mist/30 rounded-3xl" />
      </div>

      {/* Categories Skeleton */}
      <div className="py-4 space-y-3">
        <div className="flex items-center justify-between px-4">
          <div className="h-3.5 w-24 bg-mist/30 rounded-full" />
          <div className="h-3.5 w-12 bg-mist/20 rounded-full" />
        </div>
        <div className="flex gap-3 px-4 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex min-w-[100px] flex-col items-center justify-center rounded-2xl bg-mist/20 p-4 space-y-2">
              <div className="size-10 rounded-xl bg-mist/30" />
              <div className="h-2.5 w-14 bg-mist/30 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Products Scroller Skeleton */}
      <div className="py-4 space-y-3">
        <div className="px-4">
          <div className="h-3.5 w-32 bg-mist/30 rounded-full" />
        </div>
        <div className="flex gap-3 px-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-[148px] h-52 rounded-2xl bg-mist/20 p-3 space-y-3">
              <div className="aspect-square w-full rounded-xl bg-mist/30" />
              <div className="h-2.5 w-20 bg-mist/30 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
