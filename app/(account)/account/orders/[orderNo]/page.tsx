import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderDetailSwitcher } from "@/components/mobile/account/order-detail-switcher";
import { getAuthUserId } from "@/lib/supabase/server";
import { getOrderByNo } from "@/lib/services/orders";

export const metadata: Metadata = {
  title: "Order Details | Vertical Express",
  robots: { index: false },
};

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const userId = await getAuthUserId();
  if (!userId) redirect(`/login?next=/account/orders/${orderNo}`);

  const order = await getOrderByNo(userId, orderNo);
  if (!order) notFound();

  return (
    <OrderDetailSwitcher order={order} />
  );
}
