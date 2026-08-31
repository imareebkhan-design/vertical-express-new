"use client";

import React from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
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
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileWalletView balancePaise={wallet.balancePaise} transactions={transactions} />;
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="mb-6 text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">Wallet &amp; credit</h1>
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <AccountNav active="/account/wallet" />
          <div>
            <WalletView
              balancePaise={wallet.balancePaise}
              transactions={transactions}
            />
          </div>
        </div>
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

