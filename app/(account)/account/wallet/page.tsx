import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/supabase/server";
import { getUserWallet } from "@/lib/services/wallet";
import { WalletView } from "@/components/account/wallet-view";
import { AccountNav } from "@/components/account/account-nav";

export const metadata: Metadata = {
  title: "Wallet | Vertical Express",
  description: "View your cashback balance and wallet history.",
};

export default async function WalletPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login?next=/account/wallet");

  const { wallet, transactions } = await getUserWallet(userId);

  return (
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
  );
}
