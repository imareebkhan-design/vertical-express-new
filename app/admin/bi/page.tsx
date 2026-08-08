import { getBiData } from "@/lib/services/admin/bi";
import { DashboardContainer } from "@/components/admin/bi/dashboard-container";
import { getAdminUser } from "@/lib/services/admin/authz";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function BiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?next=/admin/bi");

  const params = await searchParams;

  const filters = {
    startDate: params.startDate ? new Date(params.startDate) : undefined,
    endDate: params.endDate ? new Date(params.endDate) : undefined,
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
