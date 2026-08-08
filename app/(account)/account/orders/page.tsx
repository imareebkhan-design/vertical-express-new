import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrdersSwitcher } from "@/components/mobile/account/orders-switcher";
import { getAuthUserId } from "@/lib/supabase/server";
import { listOrders } from "@/lib/services/orders";

export const metadata: Metadata = {
  title: "My Orders | Vertical Express",
  robots: { index: false },
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login?next=/account/orders");

  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const { orders, total, perPage } = await listOrders(userId, page);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <OrdersSwitcher orders={orders} page={page} pages={pages} />
  );
}
