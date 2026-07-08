import "server-only";
import { db } from "@/lib/db";

export interface AdminKpis {
  ordersTotal: number;
  ordersToday: number;
  gmvPaise: number;
  aovPaise: number;
  productsPublished: number;
  lowStockCount: number;
  bookingsOpen: number;
  customers: number;
}

export async function getAdminKpis(): Promise<AdminKpis> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [ordersTotal, ordersToday, gmv, productsPublished, lowStock, bookingsOpen, customers] =
    await Promise.all([
      db.order.count(),
      db.order.count({ where: { placedAt: { gte: startOfToday } } }),
      db.order.aggregate({
        where: { status: { notIn: ["cancelled", "refunded"] } },
        _sum: { totalPaise: true },
      }),
      db.product.count({ where: { status: "published" } }),
      db.inventory.count({ where: { qtyOnHand: { lte: 10 } } }),
      db.booking.count({ where: { status: { in: ["received", "scheduled", "visited", "quoted", "in_progress"] } } }),
      db.user.count({ where: { role: "customer" } }),
    ]);

  const paidOrders = await db.order.count({
    where: { status: { notIn: ["cancelled", "refunded", "pending_payment"] } },
  });
  const gmvPaise = gmv._sum.totalPaise ?? 0;

  return {
    ordersTotal,
    ordersToday,
    gmvPaise,
    aovPaise: paidOrders > 0 ? Math.round(gmvPaise / paidOrders) : 0,
    productsPublished,
    lowStockCount: lowStock,
    bookingsOpen,
    customers,
  };
}
