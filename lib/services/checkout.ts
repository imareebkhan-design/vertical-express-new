import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCartSummary, type CartSummary } from "@/lib/services/cart";
import { checkServiceability } from "@/lib/services/serviceability";
import { getPaymentProvider, type PaymentMethodId } from "@/lib/services/payments";
import { computeGst, type GstBreakup } from "@/lib/services/tax";

export interface CheckoutTotals {
  subtotalPaise: number;
  deliveryFeePaise: number;
  discountPaise: number;
  taxPaise: number;
  gst: GstBreakup;
  totalPaise: number;
  etaMinutes: number | null;
  serviceable: boolean;
  codAllowed: boolean;
}

/** Compute totals for a cart against a delivery pincode and optional coupon code. */
export async function computeTotals(
  cart: CartSummary,
  pincode: string,
  deliveryState?: string | null,
  couponCode?: string | null
): Promise<CheckoutTotals> {
  const svc = await checkServiceability(pincode);
  const qualifiesFree = cart.qualifiesFreeDelivery;
  let deliveryFeePaise = qualifiesFree ? 0 : svc.deliveryFeePaise ?? 0;
  let discountPaise = 0;

  if (couponCode) {
    const now = new Date();
    const coupon = await db.coupon.findFirst({
      where: {
        code: { equals: couponCode.trim().toUpperCase() },
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
    });

    if (coupon && cart.subtotalPaise >= coupon.minOrderPaise) {
      if (coupon.type === "flat") {
        discountPaise = coupon.value;
      } else if (coupon.type === "percent") {
        const rawDiscount = Math.round((cart.subtotalPaise * coupon.value) / 100);
        discountPaise = coupon.maxDiscountPaise
          ? Math.min(rawDiscount, coupon.maxDiscountPaise)
          : rawDiscount;
      } else if (coupon.type === "free_delivery") {
        deliveryFeePaise = 0;
      }
    }
  }

  const taxableBase = Math.max(0, cart.subtotalPaise - discountPaise);
  const gst = computeGst(taxableBase, deliveryState);
  return {
    subtotalPaise: cart.subtotalPaise,
    deliveryFeePaise,
    discountPaise,
    taxPaise: gst.taxPaise,
    gst,
    totalPaise: Math.max(0, taxableBase + gst.taxPaise + deliveryFeePaise),
    etaMinutes: svc.etaMinutes,
    serviceable: svc.serviceable,
    codAllowed: svc.codAllowed,
  };
}

function orderNumber(): string {
  const year = new Date().getFullYear();
  // Use Date.now() + random hex suffix for collision-safe order numbers.
  // A DB-level UNIQUE constraint on `orderNo` will still catch the astronomically
  // unlikely collision — retry is handled by the outer catch in actions/checkout.ts.
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `VE-${year}-${ts}${rand}`;
}

export interface PlaceOrderResult {
  orderNo: string;
  requiresPaymentConfirmation: boolean;
  /** Present only for the online gateway path (Razorpay Checkout inputs). */
  gatewayOrderId?: string | null;
  amountPaise?: number;
}

/**
 * Create an order from the user's cart. Validates stock, snapshots prices,
 * reserves/decrements inventory, records payment, clears the cart — all in a
 * transaction. Guest checkout is not allowed (auth enforced by caller).
 */
export async function placeOrder(params: {
  userId: string;
  addressId: string;
  paymentMethod: PaymentMethodId;
  notes?: string;
  idempotencyKey?: string;
}): Promise<PlaceOrderResult> {
  const { userId, addressId, paymentMethod, notes, idempotencyKey } = params;

  // Idempotency (P0-6): if this attempt was already processed, return that order
  // instead of creating a duplicate (handles retry / refresh / double-submit).
  if (idempotencyKey) {
    const existing = await db.order.findFirst({
      where: { idempotencyKey, userId },
      select: { orderNo: true, status: true },
    });
    if (existing) {
      return {
        orderNo: existing.orderNo,
        requiresPaymentConfirmation: existing.status === "pending_payment",
      };
    }
  }

  const address = await db.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
  });
  if (!address) throw new Error("ADDRESS_NOT_FOUND");

  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) throw new Error("CART_EMPTY");

  const totals = await computeTotals(cart, address.pincode, address.state);
  if (!totals.serviceable) throw new Error("PINCODE_UNSERVICEABLE");
  if (paymentMethod === "cod" && !totals.codAllowed) throw new Error("COD_UNAVAILABLE");

  const warehouse = await db.serviceablePincode.findFirst({
    where: { pincode: address.pincode, isActive: true },
    select: { warehouseId: true },
  });

  const provider = getPaymentProvider(paymentMethod);

  let gatewayOrderId: string | null = null;
  let order;
  try {
    order = await db.$transaction(async (tx) => {
    const isCod = paymentMethod === "cod";
    const payResult = await provider.createPayment({
      orderId: "pending",
      amountPaise: totals.totalPaise,
    });
    gatewayOrderId = payResult.gatewayOrderId;

    const created = await tx.order.create({
      data: {
        orderNo: orderNumber(),
        idempotencyKey: idempotencyKey ?? null,
        userId,
        address: {
          label: address.label,
          name: address.name,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        },
        status: isCod || payResult.settled ? "confirmed" : "pending_payment",
        paymentMethod,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        taxPaise: totals.taxPaise,
        deliveryFeePaise: totals.deliveryFeePaise,
        totalPaise: totals.totalPaise,
        etaMinutes: totals.etaMinutes,
        warehouseId: warehouse?.warehouseId ?? null,
        notes: notes || null,
        items: {
          create: cart.lines.map((l) => ({
            variantId: l.variantId,
            title: l.title,
            variantName: l.variantName,
            imageUrl: l.imageUrl,
            unitPricePaise: l.unitPricePaise,
            appliedTierMinQty: l.appliedTierMinQty,
            qty: l.qty,
            lineTotalPaise: l.lineTotalPaise,
          })),
        },
        payments: {
          create: {
            gateway: paymentMethod,
            gatewayOrderId: payResult.gatewayOrderId,
            gatewayPaymentId: payResult.gatewayPaymentId,
            amountPaise: totals.totalPaise,
            status: isCod ? "created" : payResult.settled ? "captured" : "created",
            signatureVerified: payResult.settled,
          },
        },
        statusEvents: {
          create: {
            toStatus: isCod || payResult.settled ? "confirmed" : "pending_payment",
            note: "Order placed",
            actorUserId: userId,
          },
        },
      },
    });

    // Atomic, race-free stock decrement (P0-5). The `qtyOnHand: { gte }` guard
    // compiles to `UPDATE ... WHERE qty_on_hand >= qty`, which the DB evaluates
    // under a row lock — a concurrent order can't drive stock negative. 0 rows
    // affected ⇒ insufficient stock ⇒ throw to roll back the whole transaction
    // (order, items, payment all rolled back).
    for (const line of cart.lines) {
      const res = await tx.inventory.updateMany({
        where: {
          variantId: line.variantId,
          ...(warehouse?.warehouseId ? { warehouseId: warehouse.warehouseId } : {}),
          qtyOnHand: { gte: line.qty },
        },
        data: { qtyOnHand: { decrement: line.qty } },
      });
      if (res.count === 0) throw new Error(`OUT_OF_STOCK:${line.title}`);
    }

    // Clear the cart.
    const dbCart = await tx.cart.findUnique({ where: { userId } });
    if (dbCart) await tx.cartItem.deleteMany({ where: { cartId: dbCart.id } });

    return created;
    });
  } catch (e) {
    // Concurrent submit with the same idempotency key: the other request won the
    // unique constraint. Return that order instead of surfacing an error (P0-6).
    if (
      idempotencyKey &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const existing = await db.order.findFirst({
        where: { idempotencyKey, userId },
        select: { orderNo: true, status: true },
      });
      if (existing) {
        return {
          orderNo: existing.orderNo,
          requiresPaymentConfirmation: existing.status === "pending_payment",
        };
      }
    }
    throw e;
  }

  return {
    orderNo: order.orderNo,
    requiresPaymentConfirmation: order.status === "pending_payment",
    gatewayOrderId,
    amountPaise: totals.totalPaise,
  };
}

/**
 * Mark a `pending_payment` order as paid after signature verification (Razorpay
 * client callback or webhook). Idempotent: a second call on an already-confirmed
 * order is a no-op. Stock was already reserved at placement, so nothing to
 * decrement here.
 */
export async function markOrderPaid(params: {
  orderNo: string;
  userId?: string;
  gatewayPaymentId: string;
}): Promise<{ ok: boolean }> {
  const { orderNo, userId, gatewayPaymentId } = params;
  const order = await db.order.findFirst({
    where: { orderNo, ...(userId ? { userId } : {}) },
    select: { id: true, status: true },
  });
  if (!order) return { ok: false };
  if (order.status !== "pending_payment") return { ok: true }; // already handled

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
    await tx.payment.updateMany({
      where: { orderId: order.id },
      data: { status: "captured", gatewayPaymentId, signatureVerified: true },
    });
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, fromStatus: "pending_payment", toStatus: "confirmed", note: "Payment verified" },
    });
  });
  return { ok: true };
}
