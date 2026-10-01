import type { Metadata } from "next";
import { withPlainGstRate } from "@/lib/order-display";
import { notFound, redirect } from "next/navigation";
import { OrderDetailSwitcher } from "@/components/mobile/account/order-detail-switcher";
import { getAuthUserId } from "@/lib/auth/current-user";
import { getOrderByNo } from "@/lib/services/orders";
import { getShipmentsForOrder } from "@/lib/services/shipments";

export const metadata: Metadata = {
  title: "Order Details",
  robots: { index: false },
};

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const userId = await getAuthUserId();
  if (!userId) redirect(`/login?next=/account/orders/${orderNo}`);

  const [order, withShipments] = await Promise.all([
    getOrderByNo(userId, orderNo),
    getShipmentsForOrder(userId, orderNo),
  ]);
  if (!order) notFound();

  /* Vehicle class controls the existing ETA; the saved express marker identifies
     the selected upgrade independently of that historical class name. */
  const shipments = (withShipments?.shipments ?? []).map((s) => ({
    speedClass: s.speedClass, sequence: s.sequence, expressRun: s.expressRun,
  }));
  /* `OrderItem.gstRate` is a Prisma Decimal, which cannot cross into a client
     component — see `withPlainGstRate`. */
  const forClient = withPlainGstRate(order);

  return (
    <OrderDetailSwitcher order={forClient} shipments={shipments} />
  );
}
