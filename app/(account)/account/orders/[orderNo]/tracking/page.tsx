import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { getShipmentsForOrder } from "@/lib/services/shipments";
import { TrackingView } from "@/components/mobile/account/tracking-view";

export const metadata: Metadata = {
  title: "Tracking",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ orderNo: string }>;
}

/**
 * Artboard 13b.
 *
 * Ownership is enforced inside `getShipmentsForOrder`, in the query rather than
 * after it: order numbers are sequential and guessable, and this page shows the
 * delivery code a driver is asked for at the gate. A missing order and somebody
 * else's order both produce the same 404, which is the point.
 */
export default async function TrackingPage({ params }: PageProps) {
  const userId = await getAuthUserId();
  const { orderNo } = await params;
  if (!userId) redirect(`/login?next=/account/orders/${orderNo}/tracking`);

  const order = await getShipmentsForOrder(userId, orderNo);
  if (!order) notFound();

  return <TrackingView order={order} />;
}
