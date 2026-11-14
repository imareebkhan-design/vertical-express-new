import "server-only";

export type NotificationType =
  | "order_placed" |"order_shipped" |"out_for_delivery" |"order_delivered" |"wallet_credited";

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Push/SMS notifications for order status transitions and wallet events.
 *
 * No delivery channel is wired yet (no push tokens, SMS or WhatsApp provider —
 * the channel is an owner decision). Until one is, this reports `sent: false`
 * and logs that nothing was sent: it used to log "dispatching" and answer
 * `sent: true`, which told operators the customer had been informed when nobody
 * had (readiness review item 16).
 */
export async function sendNotification(payload: NotificationPayload): Promise<{ sent: boolean }> {
  console.info(`[notifications] not sent — no delivery channel configured: ${payload.type} for user ${payload.userId}`);
  return { sent: false };
}

export async function notifyOrderStatusChange(params: {
  userId: string;
  orderNo: string;
  status: string;
}) {
  const { userId, orderNo, status } = params;

  let title = `Order #${orderNo} Update`;
  let body = `Your order status is now ${status}.`;

  if (status === "confirmed") {
    title = `Order #${orderNo} Confirmed!`;
    body = `We've received your order and are processing it.`;
  } else if (status === "packed") {
    title = `Order #${orderNo} Packed`;
    body = `Your items have been packed and are ready for dispatch.`;
  } else if (status === "out_for_delivery") {
    title = `Order #${orderNo} is out for delivery`;
    body = `Our delivery partner is on the way with your order.`;
  } else if (status === "delivered") {
    title = `Order #${orderNo} delivered`;
    body = `Your order has been delivered.`;
  }

  return sendNotification({
    userId,
    type: status as NotificationType,
    title,
    body,
    data: { orderNo, status },
  });
}
