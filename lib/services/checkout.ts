import "server-only";
import { Prisma } from "@/prisma/generated/client";
import { db } from "@/lib/db";
import { getCartSummary, type CartSummary } from "@/lib/services/cart";
import { checkServiceability } from "@/lib/services/serviceability";
import { getPaymentProvider, type PaymentMethodId } from "@/lib/services/payments";
import { computeGst, CATEGORY_TAX_CONFIGS, type GstBreakup } from "@/lib/services/tax";
import { trackEvent, MetricsTracker, captureException } from "@/lib/observability";

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

  // Calculate line-level inclusive totals and extract GST per line
  let remainingDiscount = discountPaise;
  let totalTaxableValuePaise = 0;
  let totalTaxPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;

  const linesCount = cart.lines.length;
  cart.lines.forEach((line, idx) => {
    const lineSubtotal = line.lineTotalPaise;
    let lineDiscount = 0;
    if (cart.subtotalPaise > 0) {
      if (idx === linesCount - 1) {
        lineDiscount = remainingDiscount;
      } else {
        lineDiscount = Math.round((lineSubtotal * discountPaise) / cart.subtotalPaise);
        remainingDiscount -= lineDiscount;
      }
    }
    const lineInclusiveTotal = Math.max(0, lineSubtotal - lineDiscount);
    const lineGst = computeGst(lineInclusiveTotal, deliveryState, line.categorySlug);

    totalTaxPaise += lineGst.taxPaise;
    totalCgstPaise += lineGst.cgstPaise;
    totalSgstPaise += lineGst.sgstPaise;
    totalIgstPaise += lineGst.igstPaise;
    totalTaxableValuePaise += (lineInclusiveTotal - lineGst.taxPaise);
  });

  const totalPaise = Math.max(0, totalTaxableValuePaise + totalTaxPaise + deliveryFeePaise);

  return {
    subtotalPaise: totalTaxableValuePaise, // exclusive subtotal
    deliveryFeePaise,
    discountPaise, // total discount
    taxPaise: totalTaxPaise,
    gst: {
      ratePct: totalTaxableValuePaise > 0 ? Math.round((totalTaxPaise * 100) / totalTaxableValuePaise) : 18,
      hsn: linesCount === 1 ? (cart.lines[0]?.categorySlug ? (CATEGORY_TAX_CONFIGS[cart.lines[0].categorySlug]?.hsn ?? "7308") : "7308") : "MULTIPLE",
      taxPaise: totalTaxPaise,
      cgstPaise: totalCgstPaise,
      sgstPaise: totalSgstPaise,
      igstPaise: totalIgstPaise,
      intraState: totalIgstPaise === 0,
    },
    totalPaise,
    etaMinutes: svc.etaMinutes,
    serviceable: svc.serviceable,
    codAllowed: svc.codAllowed,
  };
}

function orderNumber(): string {
  const year = new Date().getFullYear();
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
  const metric = new MetricsTracker("checkout-service");
  const { userId, addressId, paymentMethod, notes, idempotencyKey } = params;

  trackEvent("checkout_started", { paymentMethod });

  if (idempotencyKey) {
    const existing = await db.order.findFirst({
      where: { idempotencyKey, userId },
      select: { orderNo: true, status: true },
    });
    if (existing) {
      metric.end("place_order_idempotent_duplicate");
      return {
        orderNo: existing.orderNo,
        requiresPaymentConfirmation: existing.status === "pending_payment",
      };
    }
  }

  const address = await db.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
  });
  if (!address) {
    metric.end("place_order_address_not_found");
    throw new Error("ADDRESS_NOT_FOUND");
  }

  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) {
    metric.end("place_order_cart_empty");
    throw new Error("CART_EMPTY");
  }

  const totals = await computeTotals(cart, address.pincode, address.state);
  if (!totals.serviceable) {
    metric.end("place_order_pincode_unserviceable");
    throw new Error("PINCODE_UNSERVICEABLE");
  }
  if (paymentMethod === "cod" && !totals.codAllowed) {
    metric.end("place_order_cod_unavailable");
    throw new Error("COD_UNAVAILABLE");
  }

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
      const payResult = await provider.createOrder({
        orderId: "pending",
        amountPaise: totals.totalPaise,
      });
      gatewayOrderId = payResult.gatewayOrderId;

      // Prepare line items with full financial snapshots
      let remainingDiscount = totals.discountPaise;
      const orderItemsData = cart.lines.map((l, idx) => {
        const lineSubtotal = l.lineTotalPaise;
        let lineDiscount = 0;
        if (cart.subtotalPaise > 0) {
          if (idx === cart.lines.length - 1) {
            lineDiscount = remainingDiscount;
          } else {
            lineDiscount = Math.round((lineSubtotal * totals.discountPaise) / cart.subtotalPaise);
            remainingDiscount -= lineDiscount;
          }
        }
        const lineInclusiveTotal = Math.max(0, lineSubtotal - lineDiscount);
        const lineGst = computeGst(lineInclusiveTotal, address.state, l.categorySlug);
        const taxableValuePaise = lineInclusiveTotal - lineGst.taxPaise;

        return {
          variantId: l.variantId,
          title: l.title,
          variantName: l.variantName,
          imageUrl: l.imageUrl,
          unitPricePaise: l.unitPricePaise,
          appliedTierMinQty: l.appliedTierMinQty,
          qty: l.qty,
          lineTotalPaise: lineSubtotal,
          subtotalPaise: lineSubtotal,
          discountPaise: lineDiscount,
          taxableValuePaise,
          cgstPaise: lineGst.cgstPaise,
          sgstPaise: lineGst.sgstPaise,
          igstPaise: lineGst.igstPaise,
          gstRate: new Prisma.Decimal(lineGst.ratePct),
          hsnCode: lineGst.hsn,
          totalPaise: lineInclusiveTotal,
        };
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
          paymentMethod: (paymentMethod === "razorpay-test" || paymentMethod === "razorpay-live") ? "razorpay" : paymentMethod,
          subtotalPaise: totals.subtotalPaise,
          discountPaise: totals.discountPaise,
          taxPaise: totals.taxPaise,
          deliveryFeePaise: totals.deliveryFeePaise,
          totalPaise: totals.totalPaise,
          etaMinutes: totals.etaMinutes,
          warehouseId: warehouse?.warehouseId ?? null,
          notes: notes || null,
          items: {
            create: orderItemsData,
          },
          payments: {
            create: {
              gateway: (paymentMethod === "razorpay-test" || paymentMethod === "razorpay-live") ? "razorpay" : paymentMethod,
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

      if (!warehouse?.warehouseId) {
        throw new Error("PINCODE_UNSERVICEABLE");
      }

      // Atomic, race-free stock decrement
      for (const line of cart.lines) {
        const res = await tx.inventory.updateMany({
          where: {
            variantId: line.variantId,
            warehouseId: warehouse.warehouseId,
            qtyOnHand: { gte: line.qty },
          },
          data: { qtyOnHand: { decrement: line.qty } },
        });
        if (res.count === 0) throw new Error(`OUT_OF_STOCK:${line.title}`);
      }

      // Clear the cart
      const dbCart = await tx.cart.findUnique({ where: { userId } });
      if (dbCart) await tx.cartItem.deleteMany({ where: { cartId: dbCart.id } });

      return created;
    });
    
    trackEvent("order_created", { orderNo: order.orderNo, totalPaise: totals.totalPaise });
    metric.end("place_order_success", { orderNo: order.orderNo });
  } catch (e) {
    captureException(e, { userId, paymentMethod });
    metric.end("place_order_failed");
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
 * Mark a `pending_payment` order as paid after signature verification.
 */
export async function markOrderPaid(params: {
  orderNo: string;
  userId?: string;
  gatewayPaymentId: string;
}): Promise<{ ok: boolean }> {
  const metric = new MetricsTracker("checkout-service");
  const { orderNo, userId, gatewayPaymentId } = params;
  try {
    let order = await db.order.findFirst({
      where: { orderNo, ...(userId ? { userId } : {}) },
      select: { id: true, status: true },
    });
    if (!order) {
      metric.end("mark_order_paid_order_not_found");
      return { ok: false };
    }
    if (order.status !== "pending_payment") {
      metric.end("mark_order_paid_already_confirmed");
      return { ok: true };
    }

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

    trackEvent("payment_success", { orderNo, gatewayPaymentId });
    metric.end("mark_order_paid_success");
    return { ok: true };
  } catch (error) {
    captureException(error, { params });
    trackEvent("payment_failure", { orderNo, gatewayPaymentId, error: error instanceof Error ? error.message : String(error) });
    metric.end("mark_order_paid_failed");
    return { ok: false };
  }
}
