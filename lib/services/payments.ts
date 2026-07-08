import "server-only";

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

const PROVIDERS: Record<PaymentMethodId, PaymentProvider> = {
  dummy: new DummyPaymentProvider(),
  cod: new CodPaymentProvider(),
  // razorpay: new RazorpayPaymentProvider(),  ← swap in later
  razorpay: new DummyPaymentProvider(),
};

export function getPaymentProvider(method: PaymentMethodId): PaymentProvider {
  return PROVIDERS[method] ?? PROVIDERS.dummy;
}

/** The online gateway currently in use (env-switchable). */
export function activeGateway(): PaymentMethodId {
  return process.env.PAYMENT_GATEWAY === "razorpay" ? "razorpay" : "dummy";
}
