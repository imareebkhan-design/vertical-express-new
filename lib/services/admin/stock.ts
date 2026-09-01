import "server-only";
import { db } from "@/lib/db";

/**
 * Inventory view for the operations console.
 *
 * READ-ONLY, deliberately. Stock adjustment is not offered here because there is
 * no StockMovement model: `Inventory.quantity` moves with no history, no reason
 * and no actor. Adding a button that silently mutates stock would create an
 * unauditable, money-adjacent action — the exact gap ISS-015 already describes.
 * Adjustment arrives with the movement ledger.
 */

const LOW_STOCK_THRESHOLD = 10;

export interface StockRow {
  variantId: string;
  warehouseId: string;
  sku: string;
  productTitle: string;
  productSlug: string;
  variantName: string;
  warehouseName: string;
  qtyOnHand: number;
  qtyReserved: number;
  available: number;
  pricePaise: number;
}

export type StockFilter = "all" | "low" | "out";

export async function adminListStock(filter: StockFilter = "all", page = 1, perPage = 40) {
  const where =
    filter === "out"
      ? { qtyOnHand: { lte: 0 } }
      : filter === "low"
        ? { qtyOnHand: { lte: LOW_STOCK_THRESHOLD } }
        : {};

  const [rows, total, lowCount, outCount, totalUnits, skusInStock] = await Promise.all([
    db.inventory.findMany({
      where,
      orderBy: [{ qtyOnHand: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        variantId: true,
        warehouseId: true,
        qtyOnHand: true,
        qtyReserved: true,
        warehouse: { select: { name: true } },
        variant: {
          select: {
            sku: true,
            name: true,
            pricePaise: true,
            product: { select: { title: true, slug: true } },
          },
        },
      },
    }),
    db.inventory.count({ where }),
    db.inventory.count({ where: { qtyOnHand: { lte: LOW_STOCK_THRESHOLD, gt: 0 } } }),
    db.inventory.count({ where: { qtyOnHand: { lte: 0 } } }),
    db.inventory.aggregate({ _sum: { qtyOnHand: true } }),
    /* Distinct SKUs actually holding units — a different question from total
       units. Forty bags of one cement is not the same shop as one bag each of
       forty things, and a buyer needs both numbers to read the shelf. */
    db.inventory.count({ where: { qtyOnHand: { gt: 0 } } }),
  ]);

  return {
    rows: rows.map(
      (r): StockRow => ({
        variantId: r.variantId,
        warehouseId: r.warehouseId,
        sku: r.variant.sku,
        productTitle: r.variant.product.title,
        productSlug: r.variant.product.slug,
        variantName: r.variant.name,
        warehouseName: r.warehouse.name,
        qtyOnHand: r.qtyOnHand,
        qtyReserved: r.qtyReserved,
        available: r.qtyOnHand - r.qtyReserved,
        pricePaise: r.variant.pricePaise,
      })
    ),
    total,
    page,
    perPage,
    lowCount,
    outCount,
    totalUnits: totalUnits._sum.qtyOnHand ?? 0,
    threshold: LOW_STOCK_THRESHOLD,
    skusInStock,
  };
}

export interface CustomerRow {
  id: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  orderCount: number;
  lifetimePaise: number;
  lastOrderAt: Date | null;
}

/**
 * Customers with their order history rolled up.
 *
 * There is no CRM model — no notes, no tickets, no segments — so this is what the
 * data honestly supports: who they are, what they have bought, when they last
 * ordered. Segmentation beyond that would be invented.
 */
export async function adminListCustomers(page = 1, perPage = 30, search?: string) {
  const where = {
    role: "customer" as const,
    ...(search
      ? {
          OR: [
            { phone: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        phone: true,
        email: true,
        createdAt: true,
        orders: {
          where: { status: { notIn: ["cancelled", "refunded"] } },
          select: { totalPaise: true, placedAt: true },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  return {
    rows: users.map(
      (u): CustomerRow => ({
        id: u.id,
        phone: u.phone,
        email: u.email,
        createdAt: u.createdAt,
        orderCount: u.orders.length,
        lifetimePaise: u.orders.reduce((s, o) => s + o.totalPaise, 0),
        lastOrderAt: u.orders.reduce<Date | null>(
          (latest, o) => (!latest || o.placedAt > latest ? o.placedAt : latest),
          null
        ),
      })
    ),
    total,
    page,
    perPage,
  };
}

/** Serviceable pincodes with their warehouse, fee and COD flag. */
export async function adminListServiceability() {
  const [pincodes, warehouses] = await Promise.all([
    db.serviceablePincode.findMany({
      orderBy: { pincode: "asc" },
      include: { warehouse: { select: { name: true, city: true } } },
    }),
    db.warehouse.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true, pincode: true, isActive: true },
    }),
  ]);
  return { pincodes, warehouses };
}

/** Coupons with their window and limits. */
export async function adminListCoupons() {
  return db.coupon.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
}

/** Recent payments with their order, for gateway reconciliation. */
export async function adminListPayments(page = 1, perPage = 30) {
  const [payments, total] = await Promise.all([
    db.payment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { order: { select: { orderNo: true, totalPaise: true, status: true } } },
    }),
    db.payment.count(),
  ]);
  return { payments, total, page, perPage };
}

/**
 * The payment health figures the operations artboard leads with.
 *
 * Captured and failed today are the two an accountant checks first, and both
 * come straight off `Payment`. The artboard also asks for webhook lag and a
 * duplicate-event count, and neither is computable: we record our own
 * `createdAt`, not the gateway's event timestamp, so there is no lag to measure;
 * and duplicates are *prevented* by the unique constraint on `gatewayEventId`
 * rather than recorded, so a rejected one leaves no row to count.
 *
 * Both are worth having and both need work that is not this — measuring lag
 * means storing the gateway timestamp, and counting duplicates means logging
 * the rejection rather than swallowing it.
 */
export async function adminPaymentHealth() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [capturedToday, failedToday, unverifiedToday] = await Promise.all([
    db.payment.aggregate({
      where: { status: "captured", createdAt: { gte: startOfToday } },
      _sum: { amountPaise: true },
      _count: true,
    }),
    db.payment.count({ where: { status: "failed", createdAt: { gte: startOfToday } } }),
    /* A captured payment whose signature never verified is the one row on this
       screen that should stop somebody's morning. */
    db.payment.count({
      where: { status: "captured", signatureVerified: false, createdAt: { gte: startOfToday } },
    }),
  ]);

  return {
    capturedCount: capturedToday._count,
    capturedPaise: capturedToday._sum.amountPaise ?? 0,
    failedCount: failedToday,
    unverifiedCapturedCount: unverifiedToday,
  };
}
