import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listOrders } from "@/lib/services/orders";
import { listAddresses } from "@/lib/services/addresses";
import { getWishlistProductIds } from "@/lib/services/wishlist";
import { AccountSwitcher } from "@/components/mobile/account/account-switcher";

export const metadata: Metadata = {
  title: "My Account | Vertical Express",
  robots: { index: false },
};

export default async function AccountOverview() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account");
  const userId = data.user.id;

  const [{ orders, total }, addresses, wishlistIds] = await Promise.all([
    listOrders(userId, 1, 3),
    listAddresses(userId),
    getWishlistProductIds(userId),
  ]);

  return (
    <AccountSwitcher
      orders={orders}
      totalOrders={total}
      addresses={addresses}
      wishlistIds={wishlistIds}
      email={data.user.email ?? null}
    />
  );
}
