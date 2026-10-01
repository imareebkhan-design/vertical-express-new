import "server-only";
import crypto from "crypto";

/**
 * Payment provider abstraction. The dummy provider simulates a gateway so the
 * full order flow works today; Razorpay drops in behind the same interface
 * once keys are provisioned (create order → verify signature → webhook).
 */
export type PaymentMethodId = "dummy" | "cod" | "razorpay" | "razorpay-test" | "razorpay-live";

export interface CreateOrderParams {
  orderId: string;
  amountPaise: number;
}

export interface CreateOrderResult {
  /** Whether the payment is considered settled at creation (dummy/COD) or
   *  requires a client confirmation step (razorpay). */
  settled: boolean;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
}

export interface VerifyPaymentParams {
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  signature?: string;
}

/** A payment the gateway reports as captured against one of its orders. */
export interface CapturedLookup {
  gatewayPaymentId: string;
  amountPaise: number;
  /**
   * "authorized": the bank approved it but it is not captured yet — the money
   * is held, not taken, and will normally be captured automatically. Neither
   * paid nor unpaid; nothing may be cancelled or settled on it. Absent means
   * "captured" (the only state the lookup returned before this field existed).
   */
  status?: "captured" | "authorized";
}

export interface PaymentProvider {
  readonly id: string;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyPayment(params: VerifyPaymentParams): boolean;
  verifyWebhook(rawBody: string, signature: string): boolean;
  refundPayment(paymentId: string, amountPaise: number): Promise<boolean>;
  healthCheck(): Promise<boolean>;
  /**
   * The captured payment of a gateway order, or null when none is captured.
   * Throws when the gateway cannot be asked or its answer cannot be read — a
   * caller must never treat "could not find out" as "not paid" (ISS-074).
   */
  findCapturedPayment(gatewayOrderId: string): Promise<CapturedLookup | null>;
}

/** Thrown when the payment gateway is misconfigured for the current environment. */
export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * May the Razorpay TEST gateway run in this process?
 *
 * Outside production, always. In production, only by explicit opt-in AND only
 * with test keys.
 *
 * WHY THERE IS AN OPT-IN AT ALL. Managed hosts (Firebase App Hosting, Cloud
 * Run, Vercel) run every deployed backend with `NODE_ENV=production`, including
 * a *staging* backend whose whole purpose is to exercise the real Razorpay test
 * API from a phone. Refusing the test gateway on `NODE_ENV` alone made a
 * reachable test deployment impossible.
 *
 * WHY IT IS SAFE. The flag must be set deliberately per backend, and it is not
 * enough on its own: the configured key id must start `rzp_test_`, so a live key
 * pasted under `razorpay-test` still refuses to boot. The `dummy` gateway —
 * which confirms orders with no money taken (ISS-002) — has NO such opt-in and
 * stays forbidden in production.
 */
function testGatewayAllowedHere(): boolean {
  if (!isProduction()) return true;
  return process.env.ALLOW_TEST_GATEWAY === "1" && (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_");
}

/** Simulated gateway — instant success. Development/test only (see ISS-002). */
class DummyPaymentProvider implements PaymentProvider {
  readonly id = "dummy" as const;

  async createOrder(): Promise<CreateOrderResult> {
    if (isProduction()) {
      throw new PaymentConfigError(
        "DUMMY_GATEWAY_IN_PRODUCTION: the dummy payment provider cannot be used in production."
      );
    }
    return {
      settled: true,
      /* Unique per call: `orderId` names an order not yet written, and a
         gateway order id names exactly one payment row (unique in the schema). */
      gatewayOrderId: `dummy_${crypto.randomUUID()}`,
      gatewayPaymentId: `dummy_pay_${Date.now()}`,
    };
  }

  verifyPayment(): boolean {
    if (isProduction()) throw new PaymentConfigError("DUMMY_GATEWAY_IN_PRODUCTION");
    return true;
  }

  verifyWebhook(): boolean {
    if (isProduction()) throw new PaymentConfigError("DUMMY_GATEWAY_IN_PRODUCTION");
    return true;
  }

  async refundPayment(): Promise<boolean> {
    if (isProduction()) throw new PaymentConfigError("DUMMY_GATEWAY_IN_PRODUCTION");
    return true;
  }

  async healthCheck(): Promise<boolean> {
    if (isProduction()) throw new PaymentConfigError("DUMMY_GATEWAY_IN_PRODUCTION");
    return true;
  }

  /** The dummy settles at creation; there is never a capture to find later. */
  async findCapturedPayment(): Promise<CapturedLookup | null> {
    if (isProduction()) throw new PaymentConfigError("DUMMY_GATEWAY_IN_PRODUCTION");
    return null;
  }
}

/** Pay-on-delivery — no gateway; collected at doorstep. */
class CodPaymentProvider implements PaymentProvider {
  readonly id = "cod" as const;

  async createOrder(): Promise<CreateOrderResult> {
    return { settled: false, gatewayOrderId: null, gatewayPaymentId: null };
  }

  verifyPayment(): boolean {
    return true;
  }

  verifyWebhook(): boolean {
    return true;
  }

  /**
   * There is no gateway to ask. Cash going back to a customer is a physical act
   * by a person, and returning `true` here would record it as done by software.
   * Until there is a cash-handling operation to record it against (ISS-010),
   * this refuses rather than lies.
   */
  async refundPayment(): Promise<boolean> {
    throw new Error("COD_REFUND_NOT_AUTOMATABLE");
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  /** No gateway: cash is never captured online. */
  async findCapturedPayment(): Promise<CapturedLookup | null> {
    return null;
  }
}

/**
 * Base Razorpay provider. Creates a Razorpay Order server-side and returns it
 * UNSETTLED — the browser opens Razorpay Checkout with `gatewayOrderId`, then
 * verifyPayment verifies the callback signature before the order is marked confirmed.
 */
abstract class RazorpayPaymentProviderBase implements PaymentProvider {
  abstract readonly id: string;

  protected creds() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new PaymentConfigError("RAZORPAY_KEYS_MISSING");
    return { keyId, keySecret };
  }

  async createOrder({ orderId, amountPaise }: CreateOrderParams): Promise<CreateOrderResult> {
    const { keyId, keySecret } = this.creds();
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: orderId.slice(0, 40),
        payment_capture: 1,
      }),
    });
    if (!res.ok) throw new Error(`RAZORPAY_ORDER_FAILED:${res.status}`);
    const data = (await res.json()) as { id: string };
    return { settled: false, gatewayOrderId: data.id, gatewayPaymentId: null };
  }

  verifyPayment(params: VerifyPaymentParams): boolean {
    const { keySecret } = this.creds();
    if (!params.razorpayOrderId || !params.razorpayPaymentId || !params.signature) {
      return false;
    }
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, params.signature);
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signature);
  }

  /**
   * Refund a captured payment.
   *
   * THIS USED TO RETURN `true` WITHOUT CALLING ANYTHING.
   *
   * The body was `// Future placeholder` and an unconditional `return true`, so
   * every caller was told the money had gone back when nothing had been asked
   * of Razorpay at all. That is the same failure shape as the dummy gateway
   * confirming orders with no money taken (ISS-002), pointed the other way: a
   * customer who is owed money is recorded as having been paid.
   *
   * A stub that reports success is worse than one that fails loudly, so this
   * now either performs the refund or throws.
   *
   * `speed: "optimum"` lets Razorpay refund instantly where the payment method
   * allows and fall back to the normal rail otherwise; `normal` is always the
   * slow rail. Amount is in paise, the same unit as everything else here.
   * Omitting it would refund the full payment — it is always passed explicitly
   * so a partial refund cannot silently become a full one.
   */
  async refundPayment(paymentId: string, amountPaise: number): Promise<boolean> {
    const { keyId, keySecret } = this.creds();

    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new Error(`RAZORPAY_REFUND_INVALID_AMOUNT:${amountPaise}`);
    }

    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        },
        body: JSON.stringify({ amount: amountPaise, speed: "optimum" }),
      }
    );

    if (!res.ok) {
      /* The status is carried so a caller can tell a declined refund from an
         outage. The body is not — it can echo request detail. */
      throw new Error(`RAZORPAY_REFUND_FAILED:${res.status}`);
    }

    const data = (await res.json()) as { id?: string; status?: string };

    /* Razorpay returns `processed` when the money has moved and `pending` when
       it is queued on the slow rail. Both mean the refund was accepted and is
       real. Anything else — notably `failed` — must not read as success. */
    if (data.status === "processed" || data.status === "pending") return true;

    throw new Error(`RAZORPAY_REFUND_NOT_ACCEPTED:${data.status ?? "unknown"}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.creds();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask Razorpay whether any payment on this order was captured.
   *
   * Used by the payment-window expiry before it cancels an order (ISS-074): a
   * capture whose browser callback was lost and whose webhook has not arrived
   * yet exists only here. `payment_capture: 1` on order creation means an
   * authorised payment is captured automatically, so `captured` is the only
   * state that means the customer's money is taken. An `authorized` payment
   * (approved, capture pending — including a bank's late authorization) is
   * returned with `status: "authorized"` so no caller mistakes held money for
   * no payment. A captured payment wins over an authorized one.
   *
   * Any failure throws — the caller must treat "could not find out" as "do not
   * cancel yet", never as "not paid". The status is carried; the body is not.
   */
  async findCapturedPayment(gatewayOrderId: string): Promise<CapturedLookup | null> {
    const { keyId, keySecret } = this.creds();
    const res = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(gatewayOrderId)}/payments`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
        /* The expiry job asks for up to 20 orders per run; one hung request must
           not stall the rest. An abort is a failed lookup: the order is skipped. */
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) throw new Error(`RAZORPAY_LOOKUP_FAILED:${res.status}`);
    const data = (await res.json()) as { items?: { id?: string; status?: string; amount?: number }[] };
    if (!Array.isArray(data.items)) throw new Error("RAZORPAY_LOOKUP_UNREADABLE");
    const found =
      data.items.find((p) => p.status === "captured") ?? data.items.find((p) => p.status === "authorized");
    if (!found) return null;
    if (typeof found.id !== "string" || !Number.isInteger(found.amount)) {
      throw new Error("RAZORPAY_LOOKUP_UNREADABLE");
    }
    return {
      gatewayPaymentId: found.id,
      amountPaise: found.amount as number,
      status: found.status === "captured" ? "captured" : "authorized",
    };
  }
}

class RazorpayTestProvider extends RazorpayPaymentProviderBase {
  readonly id = "razorpay-test" as const;
}

class RazorpayLiveProvider extends RazorpayPaymentProviderBase {
  readonly id = "razorpay-live" as const;
}

const PROVIDERS = {
  dummy: new DummyPaymentProvider(),
  cod: new CodPaymentProvider(),
  "razorpay-test": new RazorpayTestProvider(),
  "razorpay-live": new RazorpayLiveProvider(),
};

export function getPaymentProvider(method: PaymentMethodId): PaymentProvider {
  if (method === "cod") return PROVIDERS.cod;

  const active = activeGateway();

  if (method === "dummy" && active === "dummy") {
    return PROVIDERS.dummy;
  }

  if (method === "razorpay") {
    if (active === "razorpay-test") return PROVIDERS["razorpay-test"];
    if (active === "razorpay-live") return PROVIDERS["razorpay-live"];
  }

  if (method === "razorpay-test" && active === "razorpay-test") {
    return PROVIDERS["razorpay-test"];
  }

  if (method === "razorpay-live" && active === "razorpay-live") {
    return PROVIDERS["razorpay-live"];
  }

  throw new PaymentConfigError(`Payment method ${method} does not match active gateway ${active}`);
}

/**
 * The online gateway currently in use (env-switchable).
 */
export function activeGateway(): "dummy" | "razorpay-test" | "razorpay-live" {
  const gateway = process.env.PAYMENT_GATEWAY;
  if (!gateway) {
    if (isProduction()) {
      throw new PaymentConfigError("PAYMENT_GATEWAY environment variable is missing.");
    }
    return "dummy";
  }
  if (gateway === "dummy") {
    if (isProduction()) {
      throw new PaymentConfigError(
        "DUMMY_GATEWAY_IN_PRODUCTION: the dummy payment provider cannot be used in production."
      );
    }
    return "dummy";
  }
  if (gateway === "razorpay-test") {
    if (!testGatewayAllowedHere()) {
      throw new PaymentConfigError(
        "RAZORPAY_TEST_IN_PRODUCTION: razorpay-test is not allowed in production. Use razorpay-live " +
          "(or, for a staging backend only, set ALLOW_TEST_GATEWAY=1 with rzp_test_ keys)."
      );
    }
    return "razorpay-test";
  }
  if (gateway === "razorpay-live") {
    /* Live mode on a TEST key would confirm orders against Razorpay's test mode
       — no money collected (the ISS-002 class). apphosting.yaml carries the
       staging rzp_test_ key id as a plain value, so a production environment
       file that switches the gateway but not the key would do exactly this. */
    const keyId = process.env.RAZORPAY_KEY_ID ?? "";
    if (keyId && !keyId.startsWith("rzp_live_")) {
      throw new PaymentConfigError("RAZORPAY_LIVE_WITH_TEST_KEY: razorpay-live requires an rzp_live_ RAZORPAY_KEY_ID.");
    }
    return "razorpay-live";
  }
  throw new PaymentConfigError(`Invalid PAYMENT_GATEWAY: "${gateway}"`);
}

/**
 * Boot-time assertion (called from Next instrumentation). Fails fast in a
 * misconfigured production environment and logs which gateway is active. Never
 * logs secret values.
 */
export function assertPaymentConfig(): void {
  const gateway = activeGateway(); // validates gateway name and throws if incorrect

  // Database URL check
  if (!process.env.DATABASE_URL) {
    throw new PaymentConfigError("DATABASE_URL environment variable is missing.");
  }

  if (gateway === "razorpay-live") {
    if (!process.env.RAZORPAY_KEY_ID) {
      throw new PaymentConfigError("RAZORPAY_KEY_ID is missing in production.");
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      throw new PaymentConfigError("RAZORPAY_KEY_SECRET is missing in production.");
    }
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      throw new PaymentConfigError("RAZORPAY_WEBHOOK_SECRET is missing in production.");
    }
    /* The browser/app is handed NEXT_PUBLIC_RAZORPAY_KEY_ID first (`razorpayKeyId`
       in lib/api/v1.ts). A leftover staging value there would open checkout under
       a different account than the server verifies against. */
    const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (publicKeyId && publicKeyId !== process.env.RAZORPAY_KEY_ID) {
      throw new PaymentConfigError("NEXT_PUBLIC_RAZORPAY_KEY_ID must equal RAZORPAY_KEY_ID in live mode.");
    }
  } else if (gateway === "razorpay-test") {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new PaymentConfigError(`PAYMENT_GATEWAY="${gateway}" requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.`);
    }
  }

  if (gateway === "dummy") {
    console.warn(
      "[payments] DUMMY gateway active — development/test only; no real payments are captured."
    );
  } else {
    console.info(`[payments] payment gateway active: ${gateway}`);
  }
}

/** Verify the signature Razorpay returns to the browser after Checkout.
 *  HMAC_SHA256(order_id|payment_id, key_secret) === signature. */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, params.signature);
}

/** Verify a Razorpay webhook body against the webhook secret. */
export function verifyRazorpayWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}
