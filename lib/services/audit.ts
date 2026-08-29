import "server-only";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Append-only audit trail — ISS-015.
 *
 * `OrderStatusEvent` records order transitions and is customer-facing history.
 * This is the operator-facing forensic record: who changed money, stock, a price
 * or an order state, from what, to what, and from where.
 *
 * The single rule that makes it trustworthy: an audit row is written in the SAME
 * transaction as the change it describes. A mutation that commits without its
 * audit row is therefore impossible — pass the transaction client as `tx`.
 * Writing afterwards, outside the transaction, would leave gaps exactly when
 * something goes wrong, which is when the log matters.
 *
 * Rows are never updated and never deleted.
 */

/** Anything that can be given to a Prisma write — the client or a transaction. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export type AuditActorType = "admin" | "customer" | "system";

export interface AuditEntry {
  actorType: AuditActorType;
  /** Null for system and webhook actors, which have no user row. */
  actorId?: string | null;
  /** Verb in past tense, dot-namespaced: "order.status_changed", "inventory.released". */
  action: string;
  entityType: string;
  entityId: string;
  /** Only the fields that changed — not the whole row. */
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Record one action. Pass `tx` from inside a `$transaction` so the audit row
 * shares the change's fate — this is the point of the whole thing.
 */
export async function recordAudit(tx: DbClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? Prisma.DbNull,
      after: entry.after ?? Prisma.DbNull,
      ip: entry.ip ?? null,
    },
  });
}

/** Read an entity's history, newest first. For the operations console. */
export async function auditTrailFor(
  entityType: string,
  entityId: string,
  limit = 100
) {
  return db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
