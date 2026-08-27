import "server-only";

export type NotificationType =
  | "order_placed"
  | "order_shipped"
  | "out_for_delivery"
  | "order_delivered"
  | "wallet_credited";

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Dispatch push/SMS notifications for order status transitions & wallet events. */
export async function sendNotification(payload: NotificationPayload): Promise<{ sent: boolean }> {
  console.info(`[notifications] dispatching ${payload.type} to user ${payload.userId}: "${payload.title}" - ${payload.body}`);

  // In production with Capacitor push plugin installed:
  // Trigger FCM / APNS push token lookup for userId and dispatch via Firebase Admin SDK / OneSignal
  return { sent: true };
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
    body = `Your order has been delivered. 5% cashback has been credited to your wallet!`;
  }

  return sendNotification({
    userId,
    type: status as NotificationType,
    title,
    body,
    data: { orderNo, status },
  });
}
