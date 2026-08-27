import "server-only";
import { formatPaise } from "@/lib/money";

/**
 * Transactional email via Resend (P1-1).
 *
 * Uses Resend's REST API directly (no SDK dependency). The whole module is a
 * no-op unless RESEND_API_KEY is set, so the app runs fine in the prototype
 * without email configured — set the key + a verified EMAIL_FROM to activate.
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Resend's shared sandbox sender works without domain verification for testing.
const DEFAULT_FROM = "Vertical Express <onboarding@resend.dev>";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

/** Low-level send. Resolves to true on success, false on any failure (never throws). */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not configured — succeed silently so callers stay simple in the prototype.
    console.info(`[email] skipped (no RESEND_API_KEY): "${subject}" → ${to}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

// ---- Templates -------------------------------------------------------------

const BRAND = "#efc41a";

function shell(title: string, body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <div style="background:${BRAND};padding:20px 24px;border-radius:12px 12px 0 0">
      <span style="font-size:18px;font-weight:800;letter-spacing:-0.02em">Vertical Express</span>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
      ${body}
      <p style="color:#888;font-size:12px;margin-top:28px">Vertical Express · Srinagar, Jammu &amp; Kashmir</p>
    </div>
  </div>`;
}

interface OrderEmailData {
  orderNo: string;
  paymentMethod: string;
  items: { title: string; qty: number; lineTotalPaise: number }[];
  subtotalPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  etaMinutes: number | null;
  customerName?: string | null;
}

export async function sendOrderConfirmationEmail(to: string, order: OrderEmailData): Promise<boolean> {
  const isCod = order.paymentMethod === "cod";
  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${i.title} × ${i.qty}</td><td style="padding:6px 0;text-align:right">${formatPaise(
          i.lineTotalPaise
        )}</td></tr>`
    )
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;color:#666${bold ? ";font-weight:800;color:#1a1a1a" : ""}">${label}</td><td style="padding:4px 0;text-align:right${
      bold ? ";font-weight:800" : ""
    }">${value}</td></tr>`;

  const body = `
    <p style="margin:0 0 16px">Hi ${order.customerName || "there"}, thanks for your order! We've received it and are getting it ready.</p>
    <p style="margin:0 0 4px"><strong>Order ${order.orderNo}</strong></p>
    <p style="margin:0 0 16px;color:#666">${isCod ? "Payment: Pay on delivery" : "Payment received"}${
      order.etaMinutes ? ` · ETA ~${order.etaMinutes} min` : ""
    }</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows}
      <tr><td colspan="2" style="border-top:1px solid #eee;padding-top:8px"></td></tr>
      ${line("Subtotal", formatPaise(order.subtotalPaise))}
      ${line("GST (18%)", formatPaise(order.taxPaise))}
      ${line("Delivery", order.deliveryFeePaise === 0 ? "FREE" : formatPaise(order.deliveryFeePaise))}
      ${line("Total", formatPaise(order.totalPaise), true)}
    </table>`;
  return sendEmail({
    to,
    subject: `Order ${order.orderNo} confirmed · Vertical Express`,
    html: shell("Order confirmed", body),
  });
}

interface BookingEmailData {
  bookingNo: string;
  serviceName: string;
  name: string;
  phone: string;
  preferredDate?: Date | null;
}

export async function sendBookingConfirmationEmail(to: string, booking: BookingEmailData): Promise<boolean> {
  const body = `
    <p style="margin:0 0 16px">Hi ${booking.name}, we've received your service request. Our team will call you on ${booking.phone} to confirm.</p>
    <p style="margin:0 0 4px"><strong>Booking ${booking.bookingNo}</strong></p>
    <p style="margin:0 0 4px;color:#666">Service: ${booking.serviceName}</p>
    ${booking.preferredDate ? `<p style="margin:0;color:#666">Preferred date: ${booking.preferredDate.toDateString()}</p>` : ""}`;
  return sendEmail({
    to,
    subject: `Booking ${booking.bookingNo} received · Vertical Express`,
    html: shell("Service request received", body),
  });
}
