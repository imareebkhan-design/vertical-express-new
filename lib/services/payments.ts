import "server-only";
import crypto from "node:crypto";

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

/** Simulated gateway — instant success. Placeholder until Razorpay. */
class DummyPaymentProvider implements PaymentProvider {
  readonly id = "dummy" as const;
  async createPayment({ orderId }: CreatePaymentParams): Promise<CreatePaymentResult> {
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

/** The online gateway currently in use (env-switchable). Falls back to dummy
 *  unless Razorpay is both selected AND has keys configured. */
export function activeGateway(): PaymentMethodId {
  const razorpayReady =
    process.env.PAYMENT_GATEWAY === "razorpay" &&
    !!process.env.RAZORPAY_KEY_ID &&
    !!process.env.RAZORPAY_KEY_SECRET;
  return razorpayReady ? "razorpay" : "dummy";
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
