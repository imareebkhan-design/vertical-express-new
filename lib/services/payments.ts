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

export interface PaymentProvider {
  readonly id: string;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyPayment(params: VerifyPaymentParams): boolean;
  verifyWebhook(rawBody: string, signature: string): boolean;
  refundPayment(paymentId: string, amountPaise: number): Promise<boolean>;
  healthCheck(): Promise<boolean>;
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

/** Simulated gateway — instant success. Development/test only (see ISS-002). */
class DummyPaymentProvider implements PaymentProvider {
  readonly id = "dummy" as const;

  async createOrder({ orderId }: CreateOrderParams): Promise<CreateOrderResult> {
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

  async refundPayment(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    return true;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refundPayment(paymentId: string, amountPaise: number): Promise<boolean> {
    // Future placeholder
    return true;
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.creds();
      return true;
    } catch {
      return false;
    }
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
    if (isProduction()) {
      throw new PaymentConfigError(
        "RAZORPAY_TEST_IN_PRODUCTION: razorpay-test is not allowed in production. Use razorpay-live."
      );
    }
    return "razorpay-test";
  }
  if (gateway === "razorpay-live") {
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
