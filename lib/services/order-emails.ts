import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";
import { normaliseContactEmail } from "@/lib/contact-email";
import { orderConfirmationHtml, sendEmail } from "@/lib/services/email";

/** Enqueued in the order transaction. No external request can roll back money. */
export async function enqueueOrderConfirmation(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, user: { select: { email: true } } } });
  const address = order.address as { email?: string; name?: string } | null;
  const recipient = normaliseContactEmail(address?.email) ?? normaliseContactEmail(order.user.email);
  await tx.orderEmail.createMany({ data: [{
    orderId, recipient, state: recipient ? "queued" : "skipped",
    subject: `Order ${order.orderNo} confirmed · Vertical Express`,
    html: orderConfirmationHtml({ ...order, customerName: address?.name }),
    lastError: recipient ? null : "no_recipient",
  }], skipDuplicates: true });
}

export type OrderEmailSender = (message: { to: string; from: string; subject: string; html: string; idempotencyKey: string }) => Promise<boolean>;
const LEASE_MS = 120_000;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000; // within Resend's 24h idempotency window
const MAX_ATTEMPTS = 5;
const STALE_MS = 24 * 60 * 60 * 1000;

/** Run by the authenticated scheduler, at most five bounded sends per run. */
export async function deliverOrderEmails(opts: { send?: OrderEmailSender; from?: string; now?: Date; limit?: number } = {}) {
  const from = opts.from ?? process.env.EMAIL_FROM;
  if (!from || (!opts.send && !process.env.RESEND_API_KEY)) return { sent: 0, failed: 0, configured: false };
  const now = opts.now ?? new Date();
  const sender: OrderEmailSender = opts.send ?? sendEmail;
  let sent = 0, failed = 0;
  for (let i = 0; i < Math.min(opts.limit ?? 5, 5); i++) {
    const claim = await db.$transaction(async tx => {
      const candidates = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM order_emails
        WHERE (state = 'queued' AND available_at <= ${now})
           OR (state = 'sending' AND lease_until <= ${now})
        ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!candidates[0]) return null;
      const row = await tx.orderEmail.findUniqueOrThrow({ where: { id: candidates[0].id } });
      /* Never a days-late "your order is confirmed": a message that waited
         longer than a day for its first attempt (email configured later, or a
         long outage) is recorded as not sent instead. */
      if (!row.firstAttemptAt && now.getTime() - row.createdAt.getTime() >= STALE_MS) {
        await tx.orderEmail.update({ where: { id: row.id }, data: { state: "skipped", leaseUntil: null, leaseToken: null, lastError: "too_old_to_send" } });
        return { exhausted: true as const };
      }
      if (row.attempts >= MAX_ATTEMPTS || (row.firstAttemptAt && now.getTime() - row.firstAttemptAt.getTime() >= RETRY_WINDOW_MS)) {
        await tx.orderEmail.update({ where: { id: row.id }, data: { state: "failed", leaseUntil: null, leaseToken: null, lastError: "retry_limit_manual_reconciliation_required" } });
        return { exhausted: true as const };
      }
      const leaseToken = randomUUID();
      const updated = await tx.orderEmail.update({ where: { id: row.id }, data: {
        state: "sending", attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt ?? now,
        sender: row.sender ?? from, leaseUntil: new Date(now.getTime() + LEASE_MS), leaseToken,
      } });
      return { exhausted: false as const, row: updated, leaseToken };
    });
    if (!claim) break;
    if (claim.exhausted) { failed++; continue; }
    const { row, leaseToken } = claim;
    let ok = false;
    try {
      ok = await sender({ to: row.recipient!, from: row.sender!, subject: row.subject, html: row.html, idempotencyKey: `order-confirmation/${row.id}` });
    } catch { /* Unknown outcome: reuse the same payload/key on the next bounded attempt. */ }
    const exhausted = row.attempts >= MAX_ATTEMPTS;
    await db.orderEmail.updateMany({ where: { id: row.id, state: "sending", leaseToken }, data: {
      state: ok ? "sent" : exhausted ? "failed" : "queued",
      sentAt: ok ? now : null, leaseUntil: null, leaseToken: null,
      availableAt: new Date(now.getTime() + 60_000 * 2 ** row.attempts),
      lastError: ok ? null : exhausted ? "retry_limit_manual_reconciliation_required" : "provider_failed_or_outcome_unknown",
    } });
    if (ok) sent++; else failed++;
  }
  return { sent, failed, configured: true };
}
