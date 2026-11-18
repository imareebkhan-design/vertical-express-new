import { getBiData } from "@/lib/services/admin/bi";
import { DashboardContainer } from "@/components/admin/bi/dashboard-container";
import { adminGate } from "@/lib/services/admin/authz";
import { Suspense } from "react";
import { isDateKey, istDayEnd, istDayStart } from "@/lib/ist";

export const dynamic = "force-dynamic";

export default async function BiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  /* Defence in depth behind the layout's gate, which has already decided
     whether to redirect or explain. This must NOT redirect to /login on its
     own: a page and its layout both run, so a redirect here would fire even
     while the layout was rendering the "not an operator" screen — which is
     precisely the bounce that gate exists to end. Rendering nothing is right;
     the layout is not showing this page's output anyway. */
  const gate = await adminGate();
  if (gate.state !== "admin") return null;

  const params = await searchParams;

  const filters = {
    /* The date inputs send IST calendar days (YYYY-MM-DD). `new Date(key)` reads
       them as UTC midnight, which dropped most of the chosen end day and began the
       range at 5:30 AM IST. Anything that is not a valid day is ignored. */
    startDate: params.startDate && isDateKey(params.startDate) ? istDayStart(params.startDate) : undefined,
    endDate: params.endDate && isDateKey(params.endDate) ? istDayEnd(params.endDate) : undefined,
    warehouseId: params.warehouseId,
    brandId: params.brandId,
    categoryId: params.categoryId,
    paymentMethod: params.paymentMethod,
    orderStatus: params.orderStatus,
    couponCode: params.couponCode,
    productId: params.productId,
    customerType: params.customerType === "new" || params.customerType === "returning" ? (params.customerType as "new" | "returning") : undefined,
  };

  const data = await getBiData(filters);

  return (
    <Suspense fallback={<div className="flex h-96 items-center justify-center text-sm font-bold text-neutral-400">Loading Business Intelligence Suite...</div>}>
      <DashboardContainer initialData={data} />
    </Suspense>
  );
}
