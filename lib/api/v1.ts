import "server-only";
import type { NextResponse } from "next/server";
import { apiFail, apiOk, apiResult } from "@/lib/api/response";
import { withApiUser, withApiPublic, readJson, type ApiDeps } from "@/lib/api/authed";
import { captureException } from "@/lib/observability";
import { storageGuidanceFor } from "@/lib/storage-guidance";
import {
  listProducts,
  getProductBySlug,
  listCategories,
  listRooms,
  mostOrderedRecently,
  type CatalogQuery,
  type CatalogSort,
  boughtWithProductRaw,
  getCategoryBySlug,
  brandsInCategory,
  brandsForSearchEntry,
  mostOrderedInCategory,
  closestInStock,
} from "@/lib/services/catalog";
import { getCartSummary, updateItemQty, removeItem } from "@/lib/services/cart";
import { rupeesToPaise } from "@/lib/money";
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/lib/services/addresses";
import { lookUpLocation } from "@/lib/services/location-lookup";
import { apiProfileSchema, firstProfileIssue, saveProfile } from "@/lib/services/profile";
import { getShipmentsForOrder } from "@/lib/services/shipments";
import { withShipments } from "@/lib/api/cart-shipments";
import { db } from "@/lib/db";
import { getUserWallet } from "@/lib/services/wallet";
import { getWishlistItems, toggleWishlist } from "@/lib/services/wishlist";

import { checkServiceability } from "@/lib/services/serviceability";
import { computeTotals, placeOrder, confirmOnlinePayment, LATE_PAYMENT_MESSAGE } from "@/lib/services/checkout";
import { resolveCoupon, refusalMessage } from "@/lib/services/coupon-eligibility";
import { activeGateway, type PaymentMethodId } from "@/lib/services/payments";
import {
  getOrderByNo,
  getOrderByIdempotencyKey,
  listOrders,
  reorder,
  reconcileWithGateway,
  type CapturedLookup,
  type OrderWithDetails,
} from "@/lib/services/orders";
import { classifyPlaceOrderError } from "@/lib/checkout-errors";
import { attributeConfigFor } from "@/lib/catalog-attributes";
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

/**
 * The Razorpay *key id* a device needs to open Checkout. Public by design — it
 * is the half of the pair Razorpay prints on the checkout page itself. The
 * secret half never appears in this file. `RAZORPAY_KEY_ID` is the fallback so
 * the app does not depend on a second, `NEXT_PUBLIC_`-prefixed copy being set.
 */
function razorpayKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
}

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

/** GET /api/v1/brands — stocked brand shortcuts for SearchEntry. */
export async function handleListBrands(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "brands", async () => apiOk(
    (await brandsForSearchEntry()).map((b) => ({ slug: b.slug, name: b.name, productCount: b.count }))
  ));
}

/** GET /api/v1/products?category=&brand=&q=&sort=&minPrice=&maxPrice=&<attribute>=&page=&perPage= — public.
 *
 * `brand` and the price bounds mirror the storefront's own `/search` route
 * (`app/(shop)/search/page.tsx`) exactly — same param names, same
 * comma-separated multi-brand convention — so both surfaces read the same
 * `listProducts` filtering rather than mobile getting a narrower version of
 * it. Price bounds arrive in rupees (what a filter UI collects) and are
 * converted with the same `rupeesToPaise` the storefront uses, so there is
 * one conversion site, not two that could drift.
 */
export async function handleListProducts(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "prod", async () => {
    const p = new URL(request.url).searchParams;
    const sort = p.get("sort");
    const page = Number(p.get("page") ?? "1");
    const perPage = Number(p.get("perPage") ?? "20");
    const brandParam = p.get("brand");
    const brandSlugs = brandParam ? brandParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const minPriceRupees = p.get("minPrice");
    const maxPriceRupees = p.get("maxPrice");
    const minPaise = minPriceRupees ? rupeesToPaise(Number(minPriceRupees)) : undefined;
    const maxPaise = maxPriceRupees ? rupeesToPaise(Number(maxPriceRupees)) : undefined;
    /* Attribute filters, named as the storefront's category page names them
       (`?grade=`, `?finish=`), and only for attributes this category is
       configured to browse by — a hand-edited URL cannot filter on anything. */
    const categorySlug = p.get("category") || undefined;
    const attrs: Record<string, string> = {};
    if (categorySlug) {
      for (const label of attributeConfigFor(categorySlug).attributes) {
        const value = p.get(label.toLowerCase())?.trim();
        if (value) attrs[label] = value;
      }
    }
    const query: CatalogQuery = {
      categorySlug,
      attrs,
      brandSlugs: brandSlugs?.length ? brandSlugs : undefined,
      search: p.get("q")?.trim() || undefined,
      sort: SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : undefined,
      minPaise: minPaise != null && Number.isFinite(minPaise) ? minPaise : undefined,
      maxPaise: maxPaise != null && Number.isFinite(maxPaise) ? maxPaise : undefined,
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

/**
 * GET /api/v1/search/closest?q= — public.
 *
 * The `SearchEmpty` artboard's "Closest things we do stock" — real on the
 * storefront (`app/(shop)/search/page.tsx` calls this same `closestInStock`
 * when a search finds nothing) and unreachable from the app because nothing
 * exposed it. Closeness is literal: the query is split into words and each
 * is tried on its own, so a phrase that matches nothing can still surface
 * shelves for the words inside it that do. `matchedOn` names which word(s)
 * hit, so the app can render the storefront's own honest framing rather than
 * presenting these as a guess at what the customer meant.
 */
export async function handleSearchClosest(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "search-closest", async () => {
    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q) return apiOk({ items: [], matchedOn: [] });
    return apiOk(await closestInStock(q));
  });
}

/** GET /api/v1/products/:slug — public. */
export async function handleGetProduct(request: Request, slug: string): Promise<NextResponse> {
  return withApiPublic(request, "pdp", async () => {
    const product = await getProductBySlug(slug);
    if (!product) return apiFail("NOT_FOUND", "Product not found");
    /**
     * "Also bought with this" is evidence, not a shelf.
     *
     * `boughtWithProduct` answers only from real baskets — it returns nothing
     * when there are no orders, ignores cancelled ones and never includes the
     * product itself. That is why it is used here rather than the catalogue's
     * `related` rail, which sorts by a fabricated rating (ISS-018) and would
     * dress "more cement" up as "what else this pour needs".
     *
     * An empty array is the ordinary early answer, and the app must render
     * nothing rather than substituting popularity for co-purchase.
     */
    /* The Raw reader, not the `unstable_cache` wrapper: that wrapper needs
       Next's incremental-cache context, which a route handler invoked outside a
       render does not have — it throws "incrementalCache missing". The cached
       variant is for Server Components; this path is an API handler. */
    const boughtWith = await boughtWithProductRaw(slug);
    return apiOk({ ...product, boughtWith, storageGuidance: storageGuidanceFor(product.categorySlug) });
  });
}

/**
 * GET /api/v1/products/popular — public.
 *
 * Ranked by what was actually ordered in the last seven days. Empty until
 * there is evidence, and the app must then not call anything "popular".
 */
export async function handlePopularProducts(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "popular", async () => apiOk({ days: 7, items: await mostOrderedRecently(7, 6) }));
}

/**
 * GET /api/v1/categories/:slug — public. The subcategory landing.
 *
 * One request rather than three, because the artboard is one screen: the
 * category itself, the brands actually stocked in it, and what has actually
 * been ordered from it.
 *
 * Both lists are evidence-bound. `brandsInCategory` returns only brands with
 * published products in this category, so a brand shortcut can never lead to an
 * empty results page. `mostOrderedInCategory` counts real order items and
 * excludes pending, cancelled and refunded orders, so it is empty until there
 * is something to count — and the app must then render nothing rather than
 * calling the catalogue's first few products "most ordered".
 */
export async function handleGetCategory(request: Request, slug: string): Promise<NextResponse> {
  return withApiPublic(request, "category", async () => {
    const category = await getCategoryBySlug(slug);
    if (!category) return apiFail("NOT_FOUND", "Category not found");

    const [brands, mostOrdered] = await Promise.all([
      brandsInCategory(slug),
      mostOrderedInCategory(slug),
    ]);

    return apiOk({
      slug: category.slug,
      name: category.name,
      group: category.group,
      isBulk: category.isBulk,
      brands: brands.map((b) => ({ slug: b.slug, name: b.name, productCount: b.count })),
      mostOrdered,
    });
  });
}

/**
 * GET /api/v1/wallet — authenticated. Balance and the last 50 transactions.
 *
 * Real: `Wallet`/`WalletTransaction` are modelled, and cashback is credited
 * from `getUserWallet`'s own cashback path when an order settles. The rate
 * defaults to 0 — `cashbackPercent()` reads the console setting and falls
 * back to `WALLET_CASHBACK_PERCENT`, never to a number nobody chose. So a
 * balance of zero here is the honest default, not an unbuilt screen: the app
 * shows whatever the wallet actually holds.
 */
export async function handleGetWallet(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "wallet-get", deps, async ({ userId }) => {
    const { wallet, transactions } = await getUserWallet(userId);
    return apiOk({
      balancePaise: wallet.balancePaise,
      transactions: transactions.map((t) => ({
        id: t.id,
        amountPaise: t.amountPaise,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt?.toISOString() ?? null,
      })),
    });
  });
}

/**
 * GET /api/v1/wishlist — authenticated. The customer's saved products.
 *
 * `Wishlist`/`WishlistItem` are real and already power the web account page;
 * this is the same reader, returning the same `CatalogItem` shape every other
 * catalogue endpoint uses so the mobile card component needs no special case.
 */
export async function handleGetWishlist(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "wishlist-get", deps, async ({ userId }) => apiOk(await getWishlistItems(userId)));
}

const wishlistToggleSchema = z.object({ productId: z.string().uuid() });

/**
 * POST /api/v1/wishlist/toggle — authenticated. Adds if absent, removes if
 * present, and reports which happened so the client can flip a heart icon
 * without a second read.
 */
export async function handleToggleWishlist(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "wishlist-toggle", deps, async ({ userId }) => {
    const parsed = wishlistToggleSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiFail("VALIDATION", "Invalid product", { field: "productId" });
    const saved = await toggleWishlist(userId, parsed.data.productId);
    return apiOk({ saved });
  });
}

/** GET /api/v1/rooms — public. Curated rooms with their categories; [] until curated. */
export async function handleListRooms(request: Request): Promise<NextResponse> {
  return withApiPublic(request, "rooms", async () => apiOk(await listRooms()));
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
  return withApiUser(request, "cart-get", deps, async ({ userId }) =>
    apiOk(withShipments(await getCartSummary(userId, null)))
  );
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
      const res = await updateItemQty(userId, null, itemId, body.data.qty);
      return apiOk({ ...res, summary: withShipments(res.summary) });
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
      return apiOk(withShipments(await getCartSummary(userId, null)));
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
    /* Whether each saved site is delivered to — the same `ServiceablePincode`
       table checkout prices against, in one query. Without it the app opened
       checkout on a default address it could not deliver to, with no total
       and nothing saying which site would work. */
    const served = new Set(
      (
        await db.serviceablePincode.findMany({
          where: { pincode: { in: [...new Set(rows.map((a) => a.pincode))] }, isActive: true },
          select: { pincode: true },
        })
      ).map((r) => r.pincode)
    );
    return apiOk(
      rows.map((a) => ({
        serviceable: served.has(a.pincode),
        id: a.id,
        label: a.label,
        name: a.name,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        landmark: a.landmark,
        accessNote: a.accessNote,
        latitude: a.latitude,
        longitude: a.longitude,
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

const addressPatchSchema = z.object({ isDefault: z.literal(true) });

/**
 * PATCH /api/v1/addresses/:id
 *
 * Two shapes. `{ isDefault: true }` alone selects the site the customer is
 * delivering to — the Home location pill reads the default, so this is what
 * "deliver here" writes. Anything else is a full edit, validated exactly as
 * creation is, and answers with the serviceability of the (possibly new)
 * pincode.
 */
export async function handleUpdateAddress(
  request: Request,
  id: string,
  deps: ApiDeps = {}
): Promise<NextResponse> {
  return withApiUser(request, "addr-upd", deps, async ({ userId }) => {
    if (!z.string().uuid().safeParse(id).success) return apiFail("NOT_FOUND", "Address not found");
    const body = await readJson(request);
    const select = addressPatchSchema.strict().safeParse(body);
    if (select.success) {
      const owned = await db.address.findFirst({ where: { id, userId, deletedAt: null }, select: { pincode: true } });
      if (!owned) return apiFail("NOT_FOUND", "Address not found");
      await setDefaultAddress(userId, id);
      return apiOk({ id, serviceable: (await checkServiceability(owned.pincode)).serviceable });
    }
    const parsed = addressInputSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return apiFail("VALIDATION", issue?.message ?? "Invalid address", { field: issue?.path[0]?.toString() });
    }
    const updated = await updateAddress(userId, id, parsed.data);
    if (!updated) return apiFail("NOT_FOUND", "Address not found");
    return apiOk({ id: updated.id, serviceable: (await checkServiceability(updated.pincode)).serviceable });
  });
}

/** DELETE /api/v1/addresses/:id — soft delete; past orders keep their snapshot. */
export async function handleDeleteAddress(request: Request, id: string, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "addr-del", deps, async ({ userId }) => {
    if (!z.string().uuid().safeParse(id).success) return apiFail("NOT_FOUND", "Address not found");
    const owned = await db.address.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
    if (!owned) return apiFail("NOT_FOUND", "Address not found");
    await deleteAddress(userId, id);
    return apiOk({ id });
  });
}

/* ------------------------------------------------------------------- location */

/**
 * GET /api/v1/location/reverse?lat=&lng=
 *
 * Where the customer is standing, as an address they can confirm — and,
 * separately, whether we deliver there.
 *
 * The two answers come from different places on purpose. Google says what the
 * pincode is. `ServiceablePincode` says whether we deliver to it, how soon and
 * for what fee. Google never decides delivery.
 *
 * Authenticated, because every call spends money and the key must not be a
 * public amenity. Coordinates are neither stored nor logged. The lookup itself
 * (limit, validation, Google, serviceability) is `lookUpLocation`, shared with
 * the web's server action; this maps its answer onto HTTP.
 */
export async function handleReverseGeocode(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "geo-rev", deps, async ({ userId }) => {
    const p = new URL(request.url).searchParams;
    /* An absent parameter is NaN, not Number(null) = 0 — 0,0 is a valid spot. */
    const lat = p.get("lat") ? Number(p.get("lat")) : NaN;
    const lng = p.get("lng") ? Number(p.get("lng")) : NaN;

    const found = await lookUpLocation(userId, lat, lng, deps.geocode);
    switch (found.kind) {
      case "rate_limited":
        return apiFail("RATE_LIMITED", "Too many location lookups. Enter your pincode instead.", {
          headers: { "Retry-After": String(Math.ceil(found.retryAfterMs / 1000)) },
        });
      case "invalid_coordinates":
        return apiFail("VALIDATION", "Invalid coordinates", { field: "lat" });
      case "provider_error":
        if (found.status !== "NOT_CONFIGURED") captureException(new Error(`Geocoding failed: ${found.status}`), { route: "geo-rev" });
        return apiFail("UNAVAILABLE", "We couldn't look up your location. Enter your pincode instead.", {
          metadata: { reason: found.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "PROVIDER" },
        });
      case "no_pincode":
        return apiFail("NOT_FOUND", "We couldn't find a pincode for this spot. Enter it instead.", {
          metadata: { reason: "NO_PINCODE" },
        });
      case "found":
        return apiOk({ address: found.address, serviceability: found.serviceability });
    }
  });
}

/* ------------------------------------------------------------------------- me */

/**
 * Orders that count as history — something the customer could order again.
 * One abandoned at payment was never placed; one cancelled or refunded never
 * arrived. The same exclusions as `mostOrderedRecently` and the app's "Order
 * again" rail, so a customer whose only order was cancelled is not shown a
 * reorder home with nothing on it.
 */
const HISTORY_STATUSES = {
  notIn: ["pending_payment" as const, "cancelled" as const, "refunded" as const, "refund_initiated" as const],
};

/**
 * GET /api/v1/me — the customer as the server knows them.
 *
 * `orderCount` is the durable answer to "is this somebody's first visit". It
 * lives in the database, so it survives a reinstall, a new phone and a sign-out,
 * which no flag on the device can. A customer is new until they have placed an
 * order.
 */
export async function handleGetMe(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "me-get", deps, async ({ userId }) => {
    const [user, orderCount] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          phone: true,
          email: true,
          createdAt: true,
          profile: { select: { fullName: true, buyerType: true, onboardedAt: true, companyName: true, gstin: true } },
        },
      }),
      db.order.count({ where: { userId, status: HISTORY_STATUSES } }),
    ]);
    if (!user) return apiFail("NOT_FOUND", "Account not found");
    return apiOk({
      fullName: user.profile?.fullName ?? null,
      buyerType: user.profile?.buyerType ?? null,
      phone: user.phone,
      email: user.email,
      memberSince: user.createdAt.toISOString(),
      orderCount,
      onboardedAt: user.profile?.onboardedAt?.toISOString() ?? null,
      /* The customer's own business, as they entered it. Not ours — the
         supplier GSTIN is a setting, and absent until the owner registers. */
      companyName: user.profile?.companyName ?? null,
      gstin: user.profile?.gstin ?? null,
    });
  });
}

/** PATCH /api/v1/me  { fullName?, buyerType?, onboardedAt?: "now", companyName?, gstin? }
 *  Rules and write are `lib/services/profile.ts`, shared with the web. */
export async function handleUpdateMe(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "me-upd", deps, async ({ userId }) => {
    const parsed = apiProfileSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      const { message, field } = firstProfileIssue(parsed.error);
      return apiFail("VALIDATION", message, { field });
    }
    const profile = await saveProfile(userId, parsed.data);
    return apiOk({ ...profile, onboardedAt: profile.onboardedAt?.toISOString() ?? null });
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

const couponValidateSchema = z.object({
  code: z.string().min(1).max(40),
  pincode: pincodeSchema,
});

/**
 * POST /api/v1/coupon/validate  { code, pincode } — authenticated.
 *
 * A dedicated endpoint rather than reusing `/checkout/totals` with a coupon
 * code, because that route already has the exact ambiguity the web's own
 * `validateCoupon` action (`actions/checkout.ts`) was written to fix: calling
 * `computeTotals` directly with an invalid code returns `discountPaise: 0`
 * with no error, which cannot be told apart from a valid coupon that happens
 * to reduce nothing. This route checks `resolveCoupon` first and returns an
 * explicit `VALIDATION` failure naming why, mirroring the web action exactly
 * rather than reimplementing its logic a second time.
 */
export async function handleValidateCoupon(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "coupon-validate", deps, async ({ userId }) => {
    const body = couponValidateSchema.safeParse(await readJson(request));
    if (!body.success) return apiFail("VALIDATION", "Invalid request", { field: body.error.issues[0]?.path[0]?.toString() });
    const cart = await getCartSummary(userId, null);
    if (cart.lines.length === 0) return apiFail("CONFLICT", "Your cart is empty");
    const decision = await resolveCoupon({ code: body.data.code, subtotalPaise: cart.subtotalPaise, userId });
    if (!decision.ok) return apiFail("VALIDATION", refusalMessage(decision.reason));
    return apiOk(await computeTotals(cart, body.data.pincode, null, body.data.code, userId));
  });
}

const placeSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum(["online", "cod"]),
  idempotencyKey: z.string().min(8).max(80),
  couponCode: z.string().max(40).nullish(),
  notes: z.string().max(500).optional(),
  wantsExpress: z.boolean().optional(),
  /* The total the app showed. When sent, placement refuses (CONFLICT +
     `totalChanged`) if the cart now prices differently — the web's E8 guard.
     Optional so app builds that predate it keep working. */
  expectedTotalPaise: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
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
        expectedTotalPaise: body.data.expectedTotalPaise,
      });
      return apiOk({
        orderNo: result.orderNo,
        status: result.status,
        razorpay:
          result.requiresPaymentConfirmation && result.gatewayOrderId
            ? {
                orderId: result.gatewayOrderId,
                amountPaise: result.amountPaise ?? 0,
                keyId: razorpayKeyId(),
              }
            : null,
      });
    } catch (e) {
      captureException(e, { route: "place-order" });
      return apiResult(classifyPlaceOrderError(e));
    }
  });
}

const keySchema = z.string().min(8).max(80);

/**
 * GET /api/v1/checkout/orders?idempotencyKey=…
 *
 * "Did my place-order request create an order?" — answered without creating
 * one. 404 means: for this customer, no order carries that key.
 */
export async function handleFindOrderByKey(request: Request, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "co-find", deps, async ({ userId }) => {
    const key = keySchema.safeParse(new URL(request.url).searchParams.get("idempotencyKey"));
    if (!key.success) return apiFail("VALIDATION", "Invalid idempotency key", { field: "idempotencyKey" });
    const order = await getOrderByIdempotencyKey(userId, key.data);
    if (!order) return apiFail("NOT_FOUND", "No order for that attempt");
    return apiOk(orderDto(order, { detail: true }));
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
    if (res.reason === "late_payment") {
      /* The customer paid; the order had already expired. Distinct from a failed
         verification so the app never tells them to pay again. */
      return apiFail("CONFLICT", LATE_PAYMENT_MESSAGE, { metadata: { reason: "LATE_PAYMENT" } });
    }
    if (!res.ok) return apiFail("PAYMENT_FAILED", "Payment could not be verified");
    return apiOk({ orderNo, status: "confirmed" });
  });
}

/* --------------------------------------------------------------------- orders */

function siteOf(address: unknown): { label: string | null; name: string | null; line1: string | null; pincode: string | null } | null {
  if (!address || typeof address !== "object") return null;
  const a = address as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return { label: str(a.label), name: str(a.name), line1: str(a.line1), pincode: str(a.pincode) };
}

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
    /* Where it went — the label and pincode only, enough to group orders by
       site. The full snapshot is on the detail. */
    site: siteOf(o.address),
    items: o.items.map((i) => ({
      variantId: i.variantId,
      productSlug: i.variant?.product.slug ?? null,
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
            keyId: razorpayKeyId(),
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
      orders: res.orders.map((o) => ({
        ...orderDto({ ...o, statusEvents: [] } as OrderWithDetails, { detail: false }),
        /* Travel mode and progress per shipment, no codes or drivers — the
           detail carries those, behind the same ownership check. */
        shipments: o.shipments.map((s) => ({ sequence: s.sequence, speedClass: s.speedClass, status: s.status })),
      })),
    });
  });
}

/** GET /api/v1/orders/:orderNo */
export async function handleGetOrder(
  request: Request,
  orderNo: string,
  deps: ApiDeps & { findCaptured?: (gatewayOrderId: string) => Promise<CapturedLookup | null> } = {}
): Promise<NextResponse> {
  return withApiUser(request, "ord-get", deps, async ({ userId }) => {
    let order = await getOrderByNo(userId, orderNo);
    if (!order) return apiFail("NOT_FOUND", "Order not found");
    /* E5: this is where the app gets the details to "Complete payment". Before
       handing them out, ask Razorpay whether the first attempt already went
       through (lost callback, late webhook). Paid → the order comes back
       confirmed. Cannot tell → no payment details, and the app says "check
       again in a minute; do not pay again" instead of inviting a second payment. */
    let paymentCheckUnavailable = false;
    if (order.status === "pending_payment" && order.payments[0]?.gatewayOrderId) {
      const check = await reconcileWithGateway(order, { context: "retry", findCaptured: deps.findCaptured });
      if (check === "settled" || check === "late") {
        order = (await getOrderByNo(userId, orderNo)) ?? order;
      } else if (check === "unknown" || check === "authorized") {
        paymentCheckUnavailable = true;
      }
    }
    const dto = { ...orderDto(order, { detail: true }), ...(paymentCheckUnavailable ? { razorpay: null } : {}) };
    const tracked = await getShipmentsForOrder(userId, orderNo);
    return apiOk({
      ...dto,
      /* The real shipments checkout persisted. `promisedAt` stays null until
         delivery slots exist — the app must not fill it in. */
      shipments: (tracked?.shipments ?? []).map((sh) => ({
        sequence: sh.sequence,
        speedClass: sh.speedClass,
        status: sh.status,
        promisedAt: sh.promisedAt?.toISOString() ?? null,
        dispatchedAt: sh.dispatchedAt?.toISOString() ?? null,
        deliveredAt: sh.deliveredAt?.toISOString() ?? null,
        deliveryCode: sh.deliveryCode,
        driverName: sh.driver?.name ?? null,
        vehicle: sh.vehicle?.registration ?? null,
        items: sh.items.map((it) => ({ title: it.orderItem.title, qty: it.qty })),
      })),
    });
  });
}

/**
 * POST /api/v1/orders/:orderNo/reorder
 *
 * Copies the order's still-sold items into the cart and answers with the cart.
 * Prices are whatever they are now — the cart stores no price — so a reorder
 * can never resurrect an old one.
 */
export async function handleReorder(request: Request, orderNo: string, deps: ApiDeps = {}): Promise<NextResponse> {
  return withApiUser(request, "ord-reorder", deps, async ({ userId }) => {
    try {
      await reorder(userId, orderNo);
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_FOUND") return apiFail("NOT_FOUND", "Order not found");
      captureException(e, { route: "reorder" });
      return apiFail("CONFLICT", "Could not add those items to your cart");
    }
    return apiOk(withShipments(await getCartSummary(userId, null)));
  });
}
