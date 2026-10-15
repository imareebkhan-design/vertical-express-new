import "server-only";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/services/admin/authz";
import { exportAdminOrders, EXPORT_LIMIT } from "@/lib/services/admin/orders-list";
import { parseOrdersQuery } from "@/lib/admin-orders-query";
import { ordersCsv } from "@/lib/orders-csv";
import { recordAudit } from "@/lib/services/audit";
import { db } from "@/lib/db";
import { istLocalInput } from "@/lib/ist";

/**
 * The current Orders view as CSV. Admin only; at most EXPORT_LIMIT rows (a
 * wider view is refused and asked to narrow — never silently truncated); no
 * mobile numbers or street addresses; every export audited with its filters
 * and row count. `getAdmin` is injected in tests.
 */
export async function handleOrdersExport(
  request: Request,
  deps: { getAdmin: () => Promise<{ id: string } | null>; limit?: number } = { getAdmin: getAdminUser }
): Promise<NextResponse> {
  const admin = await deps.getAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  const url = new URL(request.url);
  const query = parseOrdersQuery(Object.fromEntries(url.searchParams));
  const limit = deps.limit ?? EXPORT_LIMIT;
  const res = await exportAdminOrders(query, new Date(), limit);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `This view has ${res.total} orders; exports are limited to ${limit}. Narrow the dates or filters.` },
      { status: 413 }
    );
  }
  await recordAudit(db, {
    actorType: "admin", actorId: admin.id, action: "orders.exported", entityType: "order_export", entityId: "orders",
    after: { rows: res.rows.length, query: url.search.slice(0, 1000) },
  });
  const stamp = istLocalInput(new Date()).replace(/[-:]/g, "").replace("T", "-");
  return new NextResponse(ordersCsv(res.rows, res.cityOf), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${stamp}-IST.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
