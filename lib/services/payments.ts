import "server-only";
import crypto from "crypto";

/**
 * Payment provider abstraction. The dummy provider simulates a gateway so the
 * full order flow works today; Razorpay drops in behind the same interface
 * once keys are provisioned (create order → verify signature → webhook).
 */
export type PaymentMethodId = "dummy" | "cod" | "razorpay";

export interface CreatePaymentParams {
  orderId: string;
  amountPaise: number;
}

export interface CreatePaymentResult {
  /** Whether the payment is considered settled at creation (dummy/COD) or
   *  requires a client confirmation step (razorpay). */
  settled: boolean;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
}

export interface PaymentProvider {
  readonly id: PaymentMethodId;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
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

/** True only when Razorpay is explicitly selected AND both server keys are present. */
function razorpayConfigured(): boolean {
  return (
    process.env.PAYMENT_GATEWAY === "razorpay" &&
    !!process.env.RAZORPAY_KEY_ID &&
    !!process.env.RAZORPAY_KEY_SECRET
  );
}

/** Simulated gateway — instant success. Development/test only (see ISS-002). */
class DummyPaymentProvider implements PaymentProvider {
  readonly id = "dummy" as const;
  async createPayment({ orderId }: CreatePaymentParams): Promise<CreatePaymentResult> {
    // ISS-002: the dummy gateway fabricates a settled payment. If it ever ran in
    // production it would confirm an order and decrement stock with no money
    // taken. Selection is already gated by activeGateway(); this is the last-line
    // guard so no code path can produce a fake capture in production.
    if (isProduction()) {
      throw new PaymentConfigError(
        "DUMMY_GATEWAY_IN_PRODUCTION: the dummy payment provider cannot be used in production."
      );
    }
    return {
      settled: true,
      gatewayOrderId: `dummy_${orderId.slice(0, 8)}`,
      gatewayPaymentId: `dummy_pay_${Date.now()}`,
    };
  }
}

/** Pay-on-delivery — no gateway; collected at doorstep. */
class CodPaymentProvider implements PaymentProvider {
  readonly id = "cod" as const;
  async createPayment(): Promise<CreatePaymentResult> {
    return { settled: false, gatewayOrderId: null, gatewayPaymentId: null };
  }
}

/**
 * Real Razorpay gateway. Creates a Razorpay Order server-side and returns it
 * UNSETTLED — the browser opens Razorpay Checkout with `gatewayOrderId`, then
 * `confirmRazorpayPayment` verifies the callback signature (below) before the
 * order is marked confirmed. A webhook reconciles asynchronously.
 * Activated only when PAYMENT_GATEWAY=razorpay and keys are present.
 */
class RazorpayPaymentProvider implements PaymentProvider {
  readonly id = "razorpay" as const;

  private creds() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("RAZORPAY_KEYS_MISSING");
    return { keyId, keySecret };
  }

  async createPayment({ orderId, amountPaise }: CreatePaymentParams): Promise<CreatePaymentResult> {
    const { keyId, keySecret } = this.creds();
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: amountPaise, // Razorpay expects the smallest unit (paise) — matches our storage
        currency: "INR",
        receipt: orderId.slice(0, 40),
        payment_capture: 1,
      }),
    });
    if (!res.ok) throw new Error(`RAZORPAY_ORDER_FAILED:${res.status}`);
    const data = (await res.json()) as { id: string };
    return { settled: false, gatewayOrderId: data.id, gatewayPaymentId: null };
  }
}

const PROVIDERS: Record<PaymentMethodId, PaymentProvider> = {
  dummy: new DummyPaymentProvider(),
  cod: new CodPaymentProvider(),
  razorpay: new RazorpayPaymentProvider(),
};

export function getPaymentProvider(method: PaymentMethodId): PaymentProvider {
  return PROVIDERS[method] ?? PROVIDERS.dummy;
}

/**
 * The online gateway currently in use (env-switchable).
 *
 * ISS-002: production MUST NOT silently fall back to the dummy gateway. When
 * Razorpay is not fully configured in production this throws, so checkout fails
 * loudly rather than confirming an order with no money taken. The dummy gateway
 * remains available in development and test.
 */
export function activeGateway(): PaymentMethodId {
  if (razorpayConfigured()) return "razorpay";
  if (isProduction()) {
    throw new PaymentConfigError(
      "PAYMENT_GATEWAY_MISCONFIGURED: production requires PAYMENT_GATEWAY=razorpay with RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET set; refusing to fall back to the dummy gateway."
    );
  }
  return "dummy";
}

/**
 * Boot-time assertion (called from Next instrumentation). Fails fast in a
 * misconfigured production environment and logs which gateway is active. Never
 * logs secret values.
 */
export function assertPaymentConfig(): void {
  const gateway = activeGateway(); // throws in a misconfigured production env
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
