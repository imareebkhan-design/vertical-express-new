import "server-only";
import type { NextResponse } from "next/server";
import { apiFail, apiOk, apiResult } from "@/lib/api/response";
import { withApiUser, withApiPublic, readJson, type ApiDeps } from "@/lib/api/authed";
import { captureException } from "@/lib/observability";
import {
  listProducts,
  getProductBySlug,
  listCategories,
  type CatalogQuery,
  type CatalogSort,
} from "@/lib/services/catalog";
import { getCartSummary, updateItemQty, removeItem } from "@/lib/services/cart";
import { listAddresses, createAddress } from "@/lib/services/addresses";
import { checkServiceability } from "@/lib/services/serviceability";
import { computeTotals, placeOrder, confirmOnlinePayment } from "@/lib/services/checkout";
import { activeGateway, type PaymentMethodId } from "@/lib/services/payments";
import { getOrderByNo, listOrders, type OrderWithDetails } from "@/lib/services/orders";
import { classifyPlaceOrderError } from "@/lib/checkout-errors";
import { addressInputSchema, pincodeSchema } from "@/lib/validators";
import { z } from "zod";

/**
 * The customer-journey endpoints for the native app.
 *
 * Every function here is a thin door onto a service that already exists and is
 * already tested: catalogue, cart, addresses, checkout, orders. What this file
 * owns is the wire shape, the authentication, and the choice of which fields
 * leave the server. It decides nothing about price, stock, tax, delivery or
 * payment — see `lib/services/*` for that. If a rule appears here, it is in the
 * wrong file.
 *
 * Error contract is `lib/api/response.ts`: `{ ok, data }` or `{ ok:false, error }`
 * with the status mapped from the code.
 */

/* ------------------------------------------------------------------ catalogue */

const SORTS: readonly CatalogSort[] = ["popular", "price_asc", "price_desc", "newest", "discount"];

/** GET /api/v1/categories — public. */
export async function handleListCategories(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "cat", async () => {
    const rows = await listCategories();
    /* Named fields, not the row: SEO copy and timestamps are the web's. */
    return apiOk(
      rows.map((c) => ({
        slug: c.slug,
        name: c.name,
        group: c.group,
        imageUrl: c.imageUrl,
        isBulk: c.isBulk,
        productCount: c._count.products,
      }))
    );
  });
}

/** GET /api/v1/products?category=&q=&sort=&page=&perPage= — public. */
export async function handleListProducts(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "prod", async () => {
    const p = new URL(request.url).searchParams;
    const sort = p.get("sort");
    const page = Number(p.get("page") ?? "1");
    const perPage = Number(p.get("perPage") ?? "20");
    const query: CatalogQuery = {
      categorySlug: p.get("category") || undefined,
      search: p.get("q")?.trim() || undefined,
      sort: SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : undefined,
      page: Number.isInteger(page) && page >= 1 ? page : 1,
      /* Capped: an unbounded page size is a free way to make the database work. */
      perPage: Number.isInteger(perPage) && perPage >= 1 ? Math.min(perPage, 50) : 20,
    };
    try {
      return apiOk(await listProducts(query));
    } catch (error) {
      captureException(error, { route: "products" });
      return apiFail("NOT_FOUND", "Could not load products");
    }
  });
}

/** GET /api/v1/products/:slug — public. */
export async function handleGetProduct(request: Request, slug: string): Promise<NextResponse> {
  return withApiPublic(request, "pdp", async () => {
    const product = await getProductBySlug(slug);
    if (!product) return apiFail("NOT_FOUND", "Product not found");
    return apiOk(product);
  });
}

/** GET /api/v1/serviceability/:pincode — public. */
export async function handleServiceability(request: Request, pincode: string): Promise<NextResponse> {
  return withApiPublic(request, "svc", async () => {
    const parsed = pincodeSchema.safeParse(pincode);
    if (!parsed.success) return apiFail("VALIDATION", "Enter a valid 6-digit pincode", { field: "pincode" });
    return apiOk(await checkServiceability(parsed.data));
  });
}

/* ----------------------------------------------------------------------- cart */

/** GET /api/v1/cart */
export async function handleGetCart(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "cart-get", deps, async ({ userId }) => apiOk(await getCartSummary(userId, null)));
}

const qtySchema = z.object({ qty: z.number().int().min(0).max(999) });

/** PATCH /api/v1/cart/items/:itemId  { qty } — 0 removes. */
export async function handleUpdateCartItem(
  request: Request,
  itemId: string,
  deps: ApiDeps = {}
): Promise<NextResponse> {
  return withApiUser(request, "cart-upd", deps, async ({ userId }) => {
    const body = qtySchema.safeParse(await readJson(request));
    if (!body.success) return apiFail("VALIDATION", "Invalid quantity", { field: "qty" });
    try {
      return apiOk(await updateItemQty(userId, null, itemId, body.data.qty));
    } catch (error) {
      captureException(error, { itemId });
      return apiFail("NOT_FOUND", "Could not update item quantity");
    }
  });
}

/** DELETE /api/v1/cart/items/:itemId */
export async function handleRemoveCartItem(
  request: Request,
  itemId: string,
  deps: ApiDeps = {}
): Promise<NextResponse> {
  return withApiUser(request, "cart-del", deps, async ({ userId }) => {
    try {
      await removeItem(userId, null, itemId);
      return apiOk(await getCartSummary(userId, null));
    } catch (error) {
      captureException(error, { itemId });
      return apiFail("NOT_FOUND", "Could not remove item from cart");
    }
  });
}

/* ------------------------------------------------------------------ addresses */

/** GET /api/v1/addresses */
export async function handleListAddresses(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "addr-list", deps, async ({ userId }) => {
    const rows = await listAddresses(userId);
    return apiOk(
      rows.map((a) => ({
        id: a.id,
        label: a.label,
        name: a.name,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        landmark: a.landmark,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        isDefault: a.isDefault,
      }))
    );
  });
}

/** POST /api/v1/addresses */
export async function handleCreateAddress(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "addr-new", deps, async ({ userId }) => {
    const parsed = addressInputSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return apiFail("VALIDATION", issue?.message ?? "Invalid address", { field: issue?.path[0]?.toString() });
    }
    const svc = await checkServiceability(parsed.data.pincode);
    const created = await createAddress(userId, parsed.data);
    if (!created) return apiFail("NOT_FOUND", "Address not found");
    return apiOk({ id: created.id, serviceable: svc.serviceable });
  });
}

/* ------------------------------------------------------------------- checkout */

const totalsSchema = z.object({
  pincode: pincodeSchema,
  couponCode: z.string().max(40).optional(),
  wantsExpress: z.boolean().optional(),
});

/** POST /api/v1/checkout/totals  { pincode, couponCode?, wantsExpress? } */
export async function handleCheckoutTotals(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "co-totals", deps, async ({ userId }) => {
    const body = totalsSchema.safeParse(await readJson(request));
    if (!body.success) return apiFail("VALIDATION", "Invalid checkout request", { field: body.error.issues[0]?.path[0]?.toString() });
    const cart = await getCartSummary(userId, null);
    if (cart.lines.length === 0) return apiFail("CONFLICT", "Your cart is empty");
    /* Requested, not granted — `computeTotals` re-resolves express. */
    return apiOk(
      await computeTotals(cart, body.data.pincode, null, body.data.couponCode, userId, body.data.wantsExpress ?? false)
    );
  });
}

const placeSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum(["online", "cod"]),
  idempotencyKey: z.string().min(8).max(80),
  couponCode: z.string().max(40).nullish(),
  notes: z.string().max(500).optional(),
  wantsExpress: z.boolean().optional(),
});

/**
 * POST /api/v1/checkout/orders
 *
 * Creates the order and, for online payment, the Razorpay order. Never confirms
 * payment: an online order stays `pending_payment` until the signature is
 * verified server-side (or the webhook says so).
 */
export async function handlePlaceOrder(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "co-place", deps, async ({ userId }) => {
    const body = placeSchema.safeParse(await readJson(request));
    if (!body.success) return apiFail("VALIDATION", "Invalid order", { field: body.error.issues[0]?.path[0]?.toString() });

    try {
      const method: PaymentMethodId = body.data.paymentMethod === "cod" ? "cod" : activeGateway();
      const result = await placeOrder({
        userId,
        addressId: body.data.addressId,
        paymentMethod: method,
        notes: body.data.notes,
        idempotencyKey: body.data.idempotencyKey,
        couponCode: body.data.couponCode,
        wantsExpress: body.data.wantsExpress,
      });
      return apiOk({
        orderNo: result.orderNo,
        status: result.requiresPaymentConfirmation ? "pending_payment" : "confirmed",
        razorpay:
          result.requiresPaymentConfirmation && result.gatewayOrderId
            ? {
                orderId: result.gatewayOrderId,
                amountPaise: result.amountPaise ?? 0,
                keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
              }
            : null,
      });
    } catch (e) {
      captureException(e, { route: "place-order" });
      return apiResult(classifyPlaceOrderError(e));
    }
  });
}

const confirmSchema = z.object({
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});

/**
 * POST /api/v1/orders/:orderNo/confirm-payment
 *
 * The device reports what Razorpay handed it; the server decides whether to
 * believe it. Nothing here trusts the client: the signature is checked against
 * the server's secret and bound to this order's Razorpay order id.
 */
export async function handleConfirmPayment(
  request: Request,
  orderNo: string,
  deps: ApiDeps = {}
): Promise<NextResponse> {
  return withApiUser(request, "co-confirm", deps, async ({ userId }) => {
    const body = confirmSchema.safeParse(await readJson(request));
    if (!body.success) return apiFail("VALIDATION", "Invalid payment result");
    const res = await confirmOnlinePayment({ userId, orderNo, ...body.data });
    if (!res.ok) return apiFail("PAYMENT_FAILED", "Payment could not be verified");
    return apiOk({ orderNo, status: "confirmed" });
  });
}

/* --------------------------------------------------------------------- orders */

/** What leaves the server about an order. Not the row: no userId, no gateway internals. */
function orderDto(o: OrderWithDetails, opts: { detail: boolean }) {
  const payment = o.payments[0];
  const base = {
    orderNo: o.orderNo,
    status: o.status,
    paymentMethod: o.paymentMethod,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    taxPaise: o.taxPaise,
    deliveryFeePaise: o.deliveryFeePaise,
    totalPaise: o.totalPaise,
    etaMinutes: o.etaMinutes,
    placedAt: o.placedAt.toISOString(),
    paymentStatus: payment?.status ?? null,
    items: o.items.map((i) => ({
      title: i.title,
      variantName: i.variantName,
      imageUrl: i.imageUrl,
      qty: i.qty,
      unitPricePaise: i.unitPricePaise,
      lineTotalPaise: i.lineTotalPaise,
    })),
  };
  if (!opts.detail) return base;
  return {
    ...base,
    address: o.address,
    events: o.statusEvents.map((e) => ({ status: e.toStatus, note: e.note, at: e.createdAt.toISOString() })),
    /* Only while awaiting payment, so a device can resume a payment it lost
       track of (an idempotent retry returns no Razorpay details). */
    razorpay:
      o.status === "pending_payment" && payment?.gatewayOrderId
        ? {
            orderId: payment.gatewayOrderId,
            amountPaise: payment.amountPaise,
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
          }
        : null,
  };
}

/** GET /api/v1/orders?page= */
export async function handleListOrders(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "ord-list", deps, async ({ userId }) => {
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    const res = await listOrders(userId, Number.isInteger(page) && page >= 1 ? page : 1, 20);
    return apiOk({
      total: res.total,
      page: res.page,
      perPage: res.perPage,
      orders: res.orders.map((o) => orderDto({ ...o, statusEvents: [] } as OrderWithDetails, { detail: false })),
    });
  });
}

/** GET /api/v1/orders/:orderNo */
export async function handleGetOrder(request: Request, orderNo: string, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "ord-get", deps, async ({ userId }) => {
    const order = await getOrderByNo(userId, orderNo);
    if (!order) return apiFail("NOT_FOUND", "Order not found");
    return apiOk(orderDto(order, { detail: true }));
  });
}
