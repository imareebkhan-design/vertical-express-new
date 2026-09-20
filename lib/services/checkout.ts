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
import { getPaymentProvider, verifyRazorpaySignature, type PaymentMethodId } from "@/lib/services/payments";
import { computeGst, CATEGORY_TAX_CONFIGS, type GstBreakup } from "@/lib/services/tax";
import { planShipments, createShipmentsForOrder } from "@/lib/services/shipments";
import { trackEvent, MetricsTracker, captureException, triggerAlert } from "@/lib/observability";
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
  /** The order's status when this call returned. On an idempotent replay it is the
   *  stored order's *current* status, which may have moved on since the first call. */
  status: string;
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
   * Where to send this order's confirmation, when the account has no email.
   *
   * Trimmed and shape-checked by the caller. Stored on the order's address
   * snapshot, never on the user — see OrderAddressSnapshot for why.
   */
  contactEmail?: string | null;
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
  const { userId, addressId, paymentMethod, notes, idempotencyKey, couponCode, contactEmail, wantsExpress } =
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
        status: existing.status,
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
            /* Only when one was given. An absent key reads exactly as it did
               before for the accounts that carry an email of their own. */
            ...(contactEmail ? { email: contactEmail } : {}),
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
          status: existing.status,
          requiresPaymentConfirmation: existing.status === "pending_payment",
        };
      }
    }
    throw e;
  }

  return {
    orderNo: order.orderNo,
    status: order.status,
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

    let expiredMeanwhile = false;
    await db.$transaction(async (tx) => {
      /* Compare-and-set: two concurrent confirmations (callback + webhook, or a
         retry) both read `pending_payment` above; only one may make the move,
         and the loser must not write a second status event. */
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: "pending_payment" },
        data: { status: "confirmed" },
      });
      if (moved.count === 0) {
        /* Lost the race. If the winner was a *confirmation* this is a benign
           duplicate; if it was the expiry cron the order is dead and this call
           must not report it paid. */
        const now = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
        expiredMeanwhile = !!now && isDeadOrder(now.status);
        return;
      }
      await tx.payment.updateMany({
        where: { orderId: order.id },
        data: { status: "captured", gatewayPaymentId, signatureVerified: true },
      });
      await tx.orderStatusEvent.create({
        data: { orderId: order.id, fromStatus: "pending_payment", toStatus: "confirmed", note: "Payment verified" },
      });
    });

    if (expiredMeanwhile) {
      metric.end("mark_order_paid_expired_meanwhile");
      return { ok: false };
    }
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

/**
 * Confirm an online order from the Razorpay Checkout callback.
 *
 * The signature alone is not enough. It proves Razorpay signed
 * `order_id|payment_id` for *some* order; it says nothing about whether that
 * order is the one being confirmed. Without binding the two, a customer could
 * pay for a cheap order, then submit that valid signature against the order
 * number of an expensive one. So the Razorpay order id in the callback must
 * equal the one this order's payment row was created with, and the order must
 * belong to the caller. Both surfaces — the Server Action and the mobile API —
 * go through here so neither can forget it.
 *
 * Every refusal is the same `false`: telling a caller which check failed tells
 * whoever is guessing which part to fix.
 */
export async function confirmOnlinePayment(params: {
  userId: string;
  orderNo: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<{ ok: boolean; reason?: "late_payment" }> {
  const { userId, orderNo, razorpayOrderId, razorpayPaymentId, signature } = params;

  if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, signature })) {
    return { ok: false };
  }

  const payment = await db.payment.findFirst({
    where: { gatewayOrderId: razorpayOrderId, order: { orderNo, userId } },
    select: { id: true, orderId: true, amountPaise: true },
  });
  if (!payment) return { ok: false };

  const outcome = await settleCapturedPayment({
    paymentId: payment.id,
    orderId: payment.orderId,
    orderNo,
    amountPaise: payment.amountPaise,
    gatewayPaymentId: razorpayPaymentId,
    source: "client",
  });
  /* The customer did pay — Razorpay signed it — but the order had already
     expired. That is not a failure to be retried and not a success to be
     celebrated: the money is recorded and needs a human. */
  if (outcome === "late_recorded" || outcome === "late_already_recorded") {
    return { ok: false, reason: "late_payment" };
  }
  return { ok: true };
}

/** Order states a payment can no longer confirm. */
export const DEAD_ORDER_STATES = ["cancelled", "refund_initiated", "refunded"] as const;
export function isDeadOrder(status: string): boolean {
  return (DEAD_ORDER_STATES as readonly string[]).includes(status);
}

/** What the customer is told when their payment lands on an expired order. */
export const LATE_PAYMENT_MESSAGE =
  "This order expired before your payment completed. Your payment has been recorded and will be reviewed for a refund. Please do not pay again.";

export type SettleOutcome = "confirmed" | "already_confirmed" | "late_recorded" | "late_already_recorded";

/**
 * Apply a *verified* Razorpay capture to a payment and its order — the single
 * place both the client callback and the webhook go through, so the two cannot
 * disagree about what a capture means.
 *
 * The caller has already verified authenticity (HMAC on the callback or on the
 * webhook body) and, for the webhook, the amount. This function owns state.
 *
 *   order pending_payment  -> confirmed, payment captured        ("confirmed")
 *   order already confirmed+ -> payment marked captured if it was
 *                               not yet; nothing else moves      ("already_confirmed")
 *   order cancelled/refund*  -> payment marked captured, order NOT
 *                               resurrected, an explicit event and
 *                               an alert are raised              ("late_recorded")
 *   the same late capture again                                  ("late_already_recorded")
 *
 * Every transition is a compare-and-set in one transaction, so a callback, a
 * webhook and a retry racing each other produce exactly one status event.
 * Money that arrived is never dropped: the payment row says `captured` even
 * when the order cannot be fulfilled. That pair (payment captured, order
 * cancelled) IS the refund-required state; see `listCapturedPaymentsOnDeadOrders`.
 *
 * No refund is initiated or claimed here. Refunding is the owner's policy
 * (ISS-025) and needs Razorpay account decisions.
 */
export async function settleCapturedPayment(params: {
  paymentId: string;
  orderId: string;
  orderNo: string;
  amountPaise: number;
  gatewayPaymentId: string | null;
  eventId?: string | null;
  raw?: Prisma.InputJsonValue;
  source: "client" | "webhook";
  note?: string;
}): Promise<SettleOutcome> {
  const { paymentId, orderId, orderNo, amountPaise, gatewayPaymentId, eventId, raw, source, note } = params;

  const captured = {
    status: "captured" as const,
    ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
    ...(eventId ? { gatewayEventId: eventId } : {}),
    signatureVerified: true,
    ...(raw !== undefined ? { raw } : {}),
  };

  const outcome = await db.$transaction(async (tx): Promise<SettleOutcome> => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: "pending_payment" },
      data: { status: "confirmed" },
    });
    if (moved.count === 1) {
      await tx.payment.updateMany({ where: { id: paymentId }, data: captured });
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: "pending_payment",
          toStatus: "confirmed",
          note: note ?? (source === "webhook" ? "Razorpay webhook: payment captured" : "Payment verified"),
        },
      });
      return "confirmed";
    }

    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    /* First writer wins: a payment already `captured` keeps its payment id. */
    const first = await tx.payment.updateMany({
      where: { id: paymentId, status: { not: "captured" } },
      data: captured,
    });

    if (isDeadOrder(current.status)) {
      if (first.count === 0) return "late_already_recorded";
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: current.status,
          toStatus: current.status,
          note: "Payment received after this order expired. Under review for refund.",
        },
      });
      return "late_recorded";
    }
    return "already_confirmed";
  });

  if (outcome === "confirmed") {
    trackEvent("payment_success", { orderNo, gatewayPaymentId, source });
  } else if (outcome === "late_recorded") {
    /* Loud on purpose. This is a customer's money against an order we cancelled. */
    triggerAlert(
      "late_payment_captured",
      "Payment captured for an order that was already cancelled — refund/reconciliation required",
      { orderNo, gatewayPaymentId, amountPaise, source }
    );
    trackEvent("late_payment_captured", { orderNo, amountPaise, source });
  }
  return outcome;
}

/**
 * The refund-required set: money captured, order dead. Read-only; the operator's
 * worklist until a refund workflow exists.
 */
export async function listCapturedPaymentsOnDeadOrders() {
  return db.payment.findMany({
    where: { status: "captured", order: { status: { in: [...DEAD_ORDER_STATES] } } },
    select: {
      id: true,
      gatewayOrderId: true,
      gatewayPaymentId: true,
      amountPaise: true,
      updatedAt: true,
      order: { select: { orderNo: true, status: true, userId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
