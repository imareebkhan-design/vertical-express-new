import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { getUserWallet } from "@/lib/services/wallet";
import { WalletSwitcher } from "@/components/mobile/account/wallet-switcher";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your wallet balance and transaction history.",
};

export default async function WalletPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login?next=/account/wallet");

  const { wallet, transactions } = await getUserWallet(userId);

  return (
    <WalletSwitcher wallet={wallet} transactions={transactions} />
  );
}
