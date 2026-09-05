import "server-only";
import { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { getCartSummary, type CartSummary } from "@/lib/services/cart";
import { resolveCoupon, redeemCoupon } from "@/lib/services/coupon-eligibility";
import { checkServiceability } from "@/lib/services/serviceability";
import {
  resolveExpressOption,
  type ExpressOption,
} from "@/lib/services/express-delivery";
import { getPaymentProvider, type PaymentMethodId } from "@/lib/services/payments";
import { computeGst, CATEGORY_TAX_CONFIGS, type GstBreakup } from "@/lib/services/tax";
import { planShipments, createShipmentsForOrder } from "@/lib/services/shipments";
import { trackEvent, MetricsTracker, captureException } from "@/lib/observability";
import { SETTING_KEYS, readSetting, parseFlag } from "@/lib/services/settings";

export interface CheckoutTotals {
  subtotalPaise: number;
  deliveryFeePaise: number;
  /**
   * What the 60-minute run would cost and whether it is on offer for this cart
   * and pincode. The service that decides it has existed and been tested since
   * `4b34a90`; nothing asked it until now, so no customer could ever choose it.
   */
  express: ExpressOption;
  /** Whether express was actually applied — and therefore charged. */
  expressChosen: boolean;
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
  couponCode?: string | null,
  /**
   * Who is buying. Optional because a signed-out preview has no identity, but
   * the per-customer coupon rules — perUserLimit, firstNOrders — cannot be
   * checked without it, so placement always passes it.
   */
  userId?: string | null,
  /**
   * Whether the customer asked for the 60-minute run.
   *
   * Requested, not granted. The option is re-resolved here rather than trusted
   * from the client for the same reason the price is: a browser must not be
   * able to name what it pays. Asking for express when it is not on offer
   * quietly gets standard, at the standard price.
   */
  wantsExpress = false
): Promise<CheckoutTotals> {
  const svc = await checkServiceability(pincode);
  const qualifiesFree = cart.qualifiesFreeDelivery;
  let deliveryFeePaise = qualifiesFree ? 0 : svc.deliveryFeePaise ?? 0;
  let discountPaise = 0;

  const express = await resolveExpressOption(
    cart.lines.map((l) => ({ variantId: l.variantId, productId: l.productId })),
    pincode
  );

  /* Charged on top, and NOT waived by the free-delivery threshold.
   *
   * That threshold zeroes the *standard* fee over ₹500 — a rule nobody chose
   * and which is already flagged (ISS-030). Express is a paid upgrade the
   * customer asked for; nothing the owner has said suggests spending over ₹500
   * makes a sixty-minute delivery free, and inventing that would give away the
   * one delivery service that costs real money to run. Flagged rather than
   * assumed either way. */
  const expressChosen = wantsExpress && express.available && express.feePaise !== null;
  if (expressChosen) deliveryFeePaise += express.feePaise!;

  if (couponCode) {
    /* Eligibility moved into resolveCoupon so that usageLimit, perUserLimit
       and firstNOrders are actually enforced. They had been on the model and
       on the console screen since the beginning and checked nowhere, which made
       "one per customer" a decoration. */
    const decision = await resolveCoupon({
      code: couponCode,
      subtotalPaise: cart.subtotalPaise,
      userId: userId ?? null,
    });
    const coupon = decision.ok ? decision.coupon : null;

    if (coupon) {
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
    express,
    expressChosen,
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
    /*
       Two gates, and both must open.

       The pincode gate has always been here: some areas we will not send cash
       to. The second is new — cash on delivery is switched off at the business
       level until the owner turns it on in the console, because collecting cash
       needs drivers, a float, a handover record and a reconciliation process,
       and none of those exist yet (see the COD cash ops screen).

       Defaulting to off is the safe direction. An unconfigured system that
       offers to take cash has promised something nobody can fulfil at the gate.
    */
    codAllowed: svc.codAllowed && parseFlag(await readSetting(SETTING_KEYS.codEnabled)),
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
  /**
   * The coupon the customer applied at checkout. Previously this never reached
   * here: the UI showed a discounted total from validateCoupon and then placed
   * the order without it, so the customer saw one price and was charged
   * another. The code is re-validated server-side below — the client is never
   * trusted for a discount. (ISS-011)
   */
  couponCode?: string | null;
  /**
   * Whether the customer chose the 60-minute run at checkout.
   *
   * Same treatment as the coupon directly above, and for the same reason: the
   * UI showing an express price and the order being placed without it would
   * charge one thing and display another. `computeTotals` re-resolves whether
   * express is genuinely on offer, so asking for it when it is not quietly
   * gets standard at the standard price.
   */
  wantsExpress?: boolean;
}): Promise<PlaceOrderResult> {
  const metric = new MetricsTracker("checkout-service");
  const { userId, addressId, paymentMethod, notes, idempotencyKey, couponCode, wantsExpress } =
    params;

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

  const totals = await computeTotals(
    cart,
    address.pincode,
    address.state,
    couponCode,
    userId,
    wantsExpress
  );
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

  // The warehouse must resolve before we touch the gateway. Creating a gateway
  // order we already know cannot be fulfilled leaves an avoidable orphan behind.
  if (!warehouse?.warehouseId) {
    metric.end("place_order_pincode_unserviceable");
    throw new Error("PINCODE_UNSERVICEABLE");
  }
  const warehouseId = warehouse.warehouseId;

  const provider = getPaymentProvider(paymentMethod);
  const isCod = paymentMethod === "cod";

  // ISS-003 — the gateway call happens BEFORE the transaction opens. For Razorpay
  // this is an outbound HTTPS request; running it inside `db.$transaction` held a
  // pooled connection and an open transaction across arbitrary network latency,
  // which exhausts the pool under concurrent checkout and takes down the whole
  // application rather than just checkout.
  //
  // If the transaction below then fails, the gateway order is orphaned — which is
  // harmless: it is never captured and expires on the gateway's side. A held
  // connection is not harmless.
  const payResult = await provider.createOrder({
    orderId: "pending",
    amountPaise: totals.totalPaise,
  });
  const gatewayOrderId = payResult.gatewayOrderId;

  let order;
  try {
    order = await db.$transaction(async (tx) => {
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
        // The created line ids are needed to attach shipment items below.
        include: { items: { select: { id: true, variantId: true } } },
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
          // Record which coupon produced the discount. The column existed but was
          // never written, so a discounted order carried no trace of why. (ISS-011)
          couponCode: totals.discountPaise > 0 ? couponCode?.trim().toUpperCase() ?? null : null,
          taxPaise: totals.taxPaise,
          deliveryFeePaise: totals.deliveryFeePaise,
          totalPaise: totals.totalPaise,
          etaMinutes: totals.etaMinutes,
          warehouseId,
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

      /* Spend the coupon inside the same transaction as the order.
       *
       * resolveCoupon() decided this coupon was usable, but that check and this
       * write are separate statements — two orders in the same instant both
       * passed it. This is where the limit is actually taken, atomically, and
       * where losing the race means the order does not get the discount rather
       * than the shop giving away one more than it agreed to (ISS-066).
       *
       * A refusal fails the order rather than silently repricing it. The
       * customer was shown a total including this discount; charging them a
       * different one because a counter moved is worse than telling them the
       * code ran out. */
      if (totals.discountPaise > 0 && couponCode) {
        const spent = await tx.coupon.findFirst({
          where: { code: couponCode.trim().toUpperCase() },
          select: { id: true },
        });
        if (spent) {
          const redemption = await redeemCoupon(tx, {
            couponId: spent.id,
            userId,
            orderId: created.id,
            discountPaise: totals.discountPaise,
          });
          if (!redemption.ok) throw new Error(`COUPON_UNAVAILABLE:${redemption.reason}`);
        }
      }

      // Atomic, race-free stock decrement
      for (const line of cart.lines) {
        const res = await tx.inventory.updateMany({
          where: {
            variantId: line.variantId,
            warehouseId,
            qtyOnHand: { gte: line.qty },
          },
          data: { qtyOnHand: { decrement: line.qty } },
        });
        if (res.count === 0) throw new Error(`OUT_OF_STOCK:${line.title}`);
      }

      // Split the order into physically separate deliveries.
      //
      // Inside the transaction on purpose: an order must never exist without its
      // shipments, or the dispatch board would have nothing to work and the
      // customer would have been shown a split that was not recorded.
      //
      // A cart holds one row per variant, so variantId identifies a line uniquely.
      const orderItemIdByRef: Record<string, string> = {};
      for (const item of created.items) orderItemIdByRef[item.variantId] = item.id;

      await createShipmentsForOrder(tx, {
        orderId: created.id,
        warehouseId,
        orderItemIdByRef,
        planned: planShipments(
          cart.lines.map((l) => ({
            ref: l.variantId,
            qty: l.qty,
            categoryIsBulk: l.categoryIsBulk,
          }))
        ),
      });

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
    const order = await db.order.findFirst({
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
