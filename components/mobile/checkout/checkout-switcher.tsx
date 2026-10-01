"use client";

import React from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";
import type { AddressFormValues } from "@/components/account/address-form";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { CheckoutView } from "@/components/shop/checkout-view";
import { getCheckoutTotals, placeOrder, confirmRazorpayPayment, validateCoupon } from "@/actions/checkout";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileCheckoutView } from "@/components/mobile/checkout/mobile-checkout-view";

const checkoutActions = { getCheckoutTotals, placeOrder, confirmRazorpayPayment, validateCoupon };

interface CheckoutSwitcherProps {
  addresses: (AddressFormValues & { id: string })[];
  email: string | null;
}

export function CheckoutSwitcher({ addresses, email }: CheckoutSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileCheckoutView initialAddresses={addresses} email={email} />;
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        {/* The artboard's "Two shipments, two slots. Both are set here before
            you pay." described slot booking that does not exist (no Slot model),
            and not every order has two shipments. The step below says how this
            basket splits; nothing here promises a time. */}
        <h1 className="mb-2 text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">Where it’s going</h1>
        <p className="mb-6 text-sm font-medium text-ink-700">Choose the site, then pay. Heavy and quick items travel as separate shipments.</p>
        <CheckoutView addresses={addresses} email={email} actions={checkoutActions} />
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

