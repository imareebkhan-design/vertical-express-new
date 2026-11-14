"use server";

import { db } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth/current-user";
import { listOrders } from "@/lib/services/orders";
import { HISTORY_EXCLUDED, orderAgainFrom, type OrderAgainItem } from "@/lib/order-again";

export interface MyHomeFacts {
  signedIn: boolean;
  /** Orders that count as history — the durable "have they bought before" fact. */
  historyCount: number;
  /** All orders, for "See all N". */
  totalOrders: number;
  orderAgain: OrderAgainItem[];
}

/**
 * What the phone-web home needs to know about the customer (W-07).
 *
 * Asked for from the client, after the page renders, so `/` stays one cached
 * page for everybody (`revalidate = 300`) rather than turning dynamic to read a
 * session. Signed out, or for nobody with history, the answer is the neutral
 * one and the home shows its first-run composition — the same rule as the app
 * (`mobile/src/lib/first-run.ts`): it never decides somebody is new, only that
 * there is nothing yet to reorder.
 */
export async function getMyHomeFacts(): Promise<MyHomeFacts> {
  const userId = await getAuthUserId();
  if (!userId) return { signedIn: false, historyCount: 0, totalOrders: 0, orderAgain: [] };

  const [historyCount, page] = await Promise.all([
    db.order.count({ where: { userId, status: { notIn: [...HISTORY_EXCLUDED] } } }),
    listOrders(userId, 1, 10),
  ]);

  const orderAgain = orderAgainFrom(
    page.orders.map((o) => ({
      status: o.status,
      placedAt: o.placedAt,
      items: o.items.map((i) => ({
        variantId: i.variantId,
        title: i.title,
        variantName: i.variantName,
        imageUrl: i.imageUrl,
        qty: i.qty,
        productSlug: i.variant?.product?.slug ?? null,
      })),
    }))
  );

  return { signedIn: true, historyCount, totalOrders: page.total, orderAgain };
}
