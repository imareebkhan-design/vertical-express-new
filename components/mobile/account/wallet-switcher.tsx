"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { WalletView } from "@/components/account/wallet-view";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileWalletView } from "@/components/mobile/account/mobile-wallet-view";

interface WalletSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[];
}

export function WalletSwitcher({ wallet, transactions }: WalletSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileWalletView balancePaise={wallet.balancePaise} transactions={transactions} />;
  }

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <AccountNav active="/account/wallet" />
          <div>
            <h1 className="mb-6 text-2xl font-extrabold tracking-tight">My Wallet</h1>
            <WalletView
              balancePaise={wallet.balancePaise}
              transactions={transactions}
            />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
