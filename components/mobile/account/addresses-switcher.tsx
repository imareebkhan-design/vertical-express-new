"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AddressManager } from "@/components/account/address-manager";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileAddressesView } from "@/components/mobile/account/mobile-addresses-view";

interface AddressesSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addresses: any[];
}

export function AddressesSwitcher({ addresses }: AddressesSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileAddressesView initialAddresses={addresses} />;
  }

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">My Addresses</h1>
        <AddressManager addresses={addresses} />
      </main>
      <Footer />
    </>
  );
}
