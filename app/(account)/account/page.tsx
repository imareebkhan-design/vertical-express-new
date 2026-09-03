import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/current-user";
import { listOrders } from "@/lib/services/orders";
import { listAddresses } from "@/lib/services/addresses";
import { getWishlistProductIds } from "@/lib/services/wishlist";
import { AccountSwitcher } from "@/components/mobile/account/account-switcher";

export const metadata: Metadata = {
  title: "My Account",
  robots: { index: false },
};

export default async function AccountOverview() {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/account");
  const userId = user.id;

  const [orderResult, addresses, wishlistIds] = await Promise.all([
    listOrders(userId, 1, 3),
    listAddresses(userId),
    getWishlistProductIds(userId),
  ]);
  const { orders, total } = orderResult;

  return (
    <AccountSwitcher
      orders={orders}
      totalOrders={total}
      addresses={addresses}
      wishlistIds={wishlistIds}
      email={user.email}
      phone={user.phone}
    />
  );
}
