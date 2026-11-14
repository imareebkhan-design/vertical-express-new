import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csvCell } from "@/lib/orders-csv";
import { addDays, isDateKey, istDateKey, istDayStart } from "@/lib/ist";
import { getAdminUser } from "@/lib/services/admin/authz";
import { recordAudit } from "@/lib/services/audit";
import { EXPORT_LIMIT } from "@/lib/services/admin/orders-list";

export async function handleLedgerExport(request: Request, getAdmin = getAdminUser) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const day = new URL(request.url).searchParams.get("day") ?? istDateKey(new Date());
  if (!isDateKey(day) || day >= "9999-12-31") {
    return NextResponse.json({ error: "Choose a valid IST calendar day." }, { status: 400 });
  }
  const createdAt = { gte: istDayStart(day), lt: istDayStart(addDays(day, 1)) };
  const shared = {
    id: true, amountPaise: true, status: true, createdAt: true, updatedAt: true,
    order: { select: { orderNo: true } },
  } as const;
  const gatewayIds = { gatewayOrderId: true, gatewayPaymentId: true } as const;
  const [payments, refunds] = await db.$transaction([
    db.payment.findMany({ where: { createdAt }, take: EXPORT_LIMIT + 1,
      select: { ...shared, ...gatewayIds } }),
    db.paymentRefund.findMany({ where: { createdAt }, take: EXPORT_LIMIT + 1,
      select: { ...shared, gatewayRefundId: true, paymentId: true, payment: { select: gatewayIds } } }),
  ], { isolationLevel: "RepeatableRead" });
  if (payments.length + refunds.length > EXPORT_LIMIT) {
    return NextResponse.json({ error: "This day exceeds the export row limit." }, { status: 413 });
  }
  const rows = [
    ...payments.map(p => [p.createdAt.toISOString(), "payment", p.id, p.order.orderNo, p.id,
      p.gatewayOrderId ?? "", p.gatewayPaymentId ?? "", "", p.amountPaise, p.status, p.updatedAt.toISOString()]),
    ...refunds.map(r => [r.createdAt.toISOString(), "refund", r.id, r.order.orderNo, r.paymentId,
      r.payment.gatewayOrderId ?? "", r.payment.gatewayPaymentId ?? "", r.gatewayRefundId ?? "",
      r.amountPaise, r.status, r.updatedAt.toISOString()]),
  ];
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])));
  await recordAudit(db, { actorType: "admin", actorId: admin.id, action: "payments.exported",
    entityType: "payment_export", entityId: day, after: { rows: rows.length, day } });
  const header = "created_at_utc,type,row_id,order_no,payment_id,gateway_order_id,gateway_payment_id,gateway_refund_id,amount_paise,status,updated_at_utc";
  return new NextResponse([header, ...rows.map(row => row.map(csvCell).join(","))].join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="payments-refunds-${day}-IST.csv"` },
  });
}
