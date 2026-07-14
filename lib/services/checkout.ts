import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCartSummary, type CartSummary } from "@/lib/services/cart";
import { checkServiceability } from "@/lib/services/serviceability";
import { getPaymentProvider, type PaymentMethodId } from "@/lib/services/payments";

export interface CheckoutTotals {
  subtotalPaise: number;
  deliveryFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  etaMinutes: number | null;
  serviceable: boolean;
  codAllowed: boolean;
}

/** Compute totals for a cart against a delivery pincode. */
export async function computeTotals(cart: CartSummary, pincode: string): Promise<CheckoutTotals> {
  const svc = await checkServiceability(pincode);
  const qualifiesFree = cart.qualifiesFreeDelivery;
  const deliveryFeePaise = qualifiesFree ? 0 : svc.deliveryFeePaise ?? 0;
  return {
    subtotalPaise: cart.subtotalPaise,
    deliveryFeePaise,
    discountPaise: 0,
    totalPaise: cart.subtotalPaise + deliveryFeePaise,
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

  const totals = await computeTotals(cart, address.pincode);
  if (!totals.serviceable) throw new Error("PINCODE_UNSERVICEABLE");
  if (paymentMethod === "cod" && !totals.codAllowed) throw new Error("COD_UNAVAILABLE");

  const warehouse = await db.serviceablePincode.findFirst({
    where: { pincode: address.pincode, isActive: true },
    select: { warehouseId: true },
  });

  const provider = getPaymentProvider(paymentMethod);

  let order;
  try {
    order = await db.$transaction(async (tx) => {
    const isCod = paymentMethod === "cod";
    const payResult = await provider.createPayment({
      orderId: "pending",
      amountPaise: totals.totalPaise,
    });

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
  };
}
