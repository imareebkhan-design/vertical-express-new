import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/supabase/server";
import { getOrderByNo } from "@/lib/services/orders";
import { ConfirmationSwitcher } from "@/components/mobile/checkout/confirmation-switcher";

export const metadata: Metadata = {
  title: "Order Confirmed | Vertical Express",
  robots: { index: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  const userId = await getAuthUserId();
  if (!userId) redirect(`/login?next=/checkout/confirmation/${orderNo}`);

  const order = await getOrderByNo(userId, orderNo);
  if (!order) notFound();

  return (
    <ConfirmationSwitcher order={order} />
  );
}
