"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import type { AddressFormValues } from "@/components/account/address-form";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
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
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Checkout</h1>
        <CheckoutView addresses={addresses} email={email} />
      </main>
      <Footer />
    </>
  );
}
