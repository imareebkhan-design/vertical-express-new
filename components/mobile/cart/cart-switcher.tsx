"use client";

import React from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { CartView } from "@/components/shop/cart-view";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileCartView } from "@/components/mobile/cart/mobile-cart-view";

export function CartSwitcher() {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileCartView />;
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="mb-6 text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">Your Cart</h1>
        <CartView />
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

