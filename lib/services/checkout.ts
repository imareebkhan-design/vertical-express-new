import "server-only";
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

function orderNumber(seq: number): string {
  const year = new Date().getFullYear();
  return `VE-${year}-${String(seq).padStart(6, "0")}`;
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
}): Promise<PlaceOrderResult> {
  const { userId, addressId, paymentMethod, notes } = params;

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

  const order = await db.$transaction(async (tx) => {
    // Stock validation inside the transaction.
    for (const line of cart.lines) {
      const inv = await tx.inventory.aggregate({
        where: { variantId: line.variantId },
        _sum: { qtyOnHand: true, qtyReserved: true },
      });
      const available = (inv._sum.qtyOnHand ?? 0) - (inv._sum.qtyReserved ?? 0);
      if (available < line.qty) throw new Error(`OUT_OF_STOCK:${line.title}`);
    }

    const seq = (await tx.order.count()) + 1;
    const isCod = paymentMethod === "cod";
    const payResult = await provider.createPayment({
      orderId: "pending",
      amountPaise: totals.totalPaise,
    });

    const created = await tx.order.create({
      data: {
        orderNo: orderNumber(seq),
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

    // Decrement stock (single-warehouse simplification).
    for (const line of cart.lines) {
      const inv = await tx.inventory.findFirst({ where: { variantId: line.variantId } });
      if (inv) {
        await tx.inventory.update({
          where: { id: inv.id },
          data: { qtyOnHand: { decrement: line.qty } },
        });
      }
    }

    // Clear the cart.
    const dbCart = await tx.cart.findUnique({ where: { userId } });
    if (dbCart) await tx.cartItem.deleteMany({ where: { cartId: dbCart.id } });

    return created;
  });

  return {
    orderNo: order.orderNo,
    requiresPaymentConfirmation: order.status === "pending_payment",
  };
}
