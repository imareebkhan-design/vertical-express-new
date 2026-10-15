import { handleOrdersExport } from "@/lib/services/admin/orders-export";

export const dynamic = "force-dynamic";

/** GET /admin/orders/export?<the Orders list's params> — see handleOrdersExport. */
export function GET(request: Request) {
  return handleOrdersExport(request);
}
