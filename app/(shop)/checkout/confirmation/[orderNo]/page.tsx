import type { Metadata } from "next";
import { withPlainGstRate } from "@/lib/order-display";
import { notFound, redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { getOrderByNo } from "@/lib/services/orders";
import { getShipmentsForOrder } from "@/lib/services/shipments";
import { ConfirmationSwitcher } from "@/components/mobile/checkout/confirmation-switcher";

export const metadata: Metadata = {
  title: "Order Confirmed",
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

  const [order, withShipments] = await Promise.all([
    getOrderByNo(userId, orderNo),
    getShipmentsForOrder(userId, orderNo),
  ]);
  if (!order) notFound();

  const shipments = (withShipments?.shipments ?? []).map((s) => ({ speedClass: s.speedClass }));
  /* `OrderItem.gstRate` is a Prisma Decimal, which cannot cross into a client
     component ("Only plain objects can be passed…" on every render). Nothing
     on these screens reads it; it travels as a number. */
  const forClient = withPlainGstRate(order);

  return (
    <ConfirmationSwitcher order={forClient} shipments={shipments} />
  );
}
