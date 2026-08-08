import { AsyncLocalStorage } from "async_hooks";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { createHash } from "crypto";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL" | "DEBUG";

export interface LogPayload {
  service: string;
  event: string;
  orderId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface RequestContext {
  requestId: string;
  userId?: string;
}

// 1. Request Correlation Store using AsyncLocalStorage
export const requestStore = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}

export function getUserId(): string | undefined {
  return requestStore.getStore()?.userId;
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestStore.run(context, fn);
}

// 2. Sensitive data hashing & PII masking
const SENSITIVE_KEYS = [
  "password",
  "otp",
  "jwt",
  "token",
  "secret",
  "key",
  "card",
  "cvv",
  "pin",
  "phone",
  "email",
  "address",
  "authorization",
  "apikey",
];

export function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      sanitized[key] = "[MASKED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

// 3. Structured Logging Formatter
export function log(level: LogLevel, payload: LogPayload) {
  const requestId = getRequestId();
  const userId = getUserId();

  const structuredLog = {
    timestamp: new Date().toISOString(),
    level,
    service: payload.service,
    event: payload.event,
    requestId,
    userId: userId ? hashUserId(userId) : undefined,
    orderId: payload.orderId,
    durationMs: payload.durationMs,
    metadata: sanitizeMetadata(payload.metadata),
  };

  // Skip printing debug logs in production
  if (level === "DEBUG" && process.env.NODE_ENV === "production") {
    return;
  }

  const output = JSON.stringify(structuredLog);
  if (level === "ERROR" || level === "FATAL") {
    console.error(output);
  } else {
    console.log(output);
  }
}

// 4. Sentry wrapper integration
let sentryInitialized = false;

export function initSentry() {
  if (sentryInitialized) return;
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.1,
    });
    sentryInitialized = true;
  }
}

export function captureException(error: unknown, metadata?: Record<string, unknown>) {
  initSentry();
  const requestId = getRequestId();
  const userId = getUserId();

  log("ERROR", {
    service: "sentry-tracker",
    event: "exception_captured",
    metadata: {
      error: error instanceof Error ? error.message : String(error),
      ...metadata,
    },
  });

  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("requestId", requestId);
    if (userId) scope.setUser({ id: hashUserId(userId) });
    if (metadata) {
      const sanitized = sanitizeMetadata(metadata);
      if (sanitized) scope.setExtras(sanitized);
    }
    Sentry.captureException(error);
  });
}

// 5. PostHog Product Analytics Tracker
let posthogInitialized = false;

export function initPostHog() {
  if (posthogInitialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (key && typeof window !== "undefined") {
    posthog.init(key, { api_host: host, autocapture: false });
    posthogInitialized = true;
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  initPostHog();
  const userId = getUserId();
  const requestId = getRequestId();

  const sanitizedProps = sanitizeMetadata(properties) || {};
  const enrichedProps = {
    ...sanitizedProps,
    requestId,
    distinct_id: userId ? hashUserId(userId) : "anonymous",
  };

  log("INFO", {
    service: "analytics",
    event,
    metadata: enrichedProps,
  });

  if (posthogInitialized && typeof window !== "undefined") {
    posthog.capture(event, enrichedProps);
  }
}

// 6. Metrics & Duration Tracking Helper
export class MetricsTracker {
  private startTime: number;
  private service: string;

  constructor(service: string) {
    this.startTime = Date.now();
    this.service = service;
  }

  end(event: string, metadata?: Record<string, unknown>) {
    const durationMs = Date.now() - this.startTime;
    log("INFO", {
      service: this.service,
      event,
      durationMs,
      metadata,
    });
    return durationMs;
  }
}

// 7. Production Alert Instrumentation Points
export function triggerAlert(alertType: string, message: string, metadata?: Record<string, unknown>) {
  log("FATAL", {
    service: "alert-notifier",
    event: alertType,
    metadata: {
      message,
      ...metadata,
    },
  });

  captureException(new Error(`Alert triggered: ${alertType} - ${message}`), metadata);
}
