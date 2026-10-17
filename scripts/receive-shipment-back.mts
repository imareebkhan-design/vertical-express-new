/**
 * Receive back a shipment that left on a vehicle and was never handed over
 * (receiveShipmentBack). Read-only report unless --apply.
 *
 *   VE_ALLOW_REMOTE_DB=1 DATABASE_URL=<staging> npx tsx scripts/receive-shipment-back.mts \
 *     --expect-ref=gjhxhmcsuhxcmrvtkggz --order=VE-2026-... \
 *     [--apply --actor-email=<admin> --reason="..." --goods-received-back]
 *
 * Same target guard as the QA scripts: staging or a disposable local DB only.
 * The report lists every precondition from the database; --apply refuses unless
 * all of them hold, and then performs the one audited operation — nothing else.
 */
import { qaTargetRefusal } from "../lib/catalog/qa-target";

{
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const flag = (n: string) => process.argv.includes(`--${n}`);
  const refusal = qaTargetRefusal(process.env.DATABASE_URL ?? "", arg("expect-ref"), process.env);
  if (refusal) { console.error(refusal); process.exit(1); }
  const { db } = await import("@/lib/db");
  const { receiveShipmentBack } = await import("@/lib/services/admin/shipments-write");
  try {
    const orderNo = arg("order");
    if (!orderNo) throw new Error("--order is required");
    const order = await db.order.findUnique({
      where: { orderNo },
      select: {
        id: true, status: true,
        payments: { select: { status: true, amountPaise: true } },
        shipments: { select: { id: true, sequence: true, status: true, deliveredAt: true, dispatchedAt: true, driverId: true } },
      },
    });
    if (!order) throw new Error(`${orderNo} not found`);
    const onRoad = order.shipments.filter((s) => s.status === "out_for_delivery");
    const ids = order.shipments.map((s) => s.id);
    const audits = await db.auditLog.findMany({ where: { entityId: { in: [...ids, order.id] } }, select: { action: true, after: true } });
    const delivered = audits.some((a) => (a.after as { status?: string } | null)?.status === "delivered");
    const inventoryMoves = audits.filter((a) => a.action.startsWith("inventory.")).length;
    const live = await db.shipmentLiveLocation.findMany({ where: { shipmentId: { in: ids } }, select: { latitude: true, longitude: true, recordedAt: true } });

    const checks: [string, boolean, string][] = [
      ["order is active", !["pending_payment", "cancelled", "refund_initiated", "refunded"].includes(order.status), order.status],
      ["exactly one shipment out for delivery", onRoad.length === 1, `${onRoad.length}`],
      ["no delivery recorded (row)", onRoad.every((s) => !s.deliveredAt), "deliveredAt"],
      ["no delivery recorded (audit trail)", !delivered, delivered ? "a delivered event exists" : "none"],
      ["no stock movement recorded", inventoryMoves === 0, `${inventoryMoves}`],
    ];
    console.log(`${orderNo}  order=${order.status}  payments=${order.payments.map((p) => `${p.status}:${p.amountPaise}`).join(",")}`);
    for (const s of order.shipments) console.log(`  shipment ${s.sequence}: ${s.status}  dispatched=${s.dispatchedAt?.toISOString() ?? "-"}  driver=${s.driverId ?? "-"}`);
    for (const l of live) console.log(`  last live position: ${l.latitude},${l.longitude} at ${l.recordedAt.toISOString()}`);
    for (const [name, ok, detail] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} (${detail})`);
    const allOk = checks.every(([, ok]) => ok);

    if (!flag("apply")) { console.log(allOk ? "READ-ONLY — preconditions hold; nothing changed." : "READ-ONLY — preconditions do NOT hold; nothing changed."); }
    else {
      if (!allOk) throw new Error("refused: preconditions do not hold");
      const email = arg("actor-email");
      /* Operators are the ADMIN_EMAILS allowlist (lib/services/admin/authz.ts), not a role column. */
      const allow = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (!email || !allow.includes(email.toLowerCase())) throw new Error("--actor-email must be in ADMIN_EMAILS");
      const admin = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, email: true } });
      if (!admin?.email) throw new Error("--actor-email has no user row");
      const r = await receiveShipmentBack({ shipmentId: onRoad[0].id, actor: { id: admin.id, email: admin.email }, reason: arg("reason") ?? "", goodsReceivedBack: flag("goods-received-back") });
      console.log("APPLIED:", JSON.stringify(r));
      if (!r.ok) process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}
