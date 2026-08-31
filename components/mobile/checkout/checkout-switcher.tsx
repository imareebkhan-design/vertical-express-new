"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import type { AddressFormValues } from "@/components/account/address-form";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { CheckoutView } from "@/components/shop/checkout-view";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileCheckoutView } from "@/components/mobile/checkout/mobile-checkout-view";

interface CheckoutSwitcherProps {
  addresses: (AddressFormValues & { id: string })[];
  email: string | null;
}

export function CheckoutSwitcher({ addresses, email }: CheckoutSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileCheckoutView initialAddresses={addresses} email={email} />;
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">Where and when</h1>
        <p className="mb-6 text-sm font-medium text-ink-700">Two shipments, two slots. Both are set here before you pay.</p>
        <CheckoutView addresses={addresses} email={email} />
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

