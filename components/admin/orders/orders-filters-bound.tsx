"use client";

import { useRouter } from "next/navigation";
import { OrdersFilters, type FilterOptions } from "@/components/admin/orders/orders-filters";
import type { OrdersQuery } from "@/lib/admin-orders-query";

/** The Orders filter bar, navigating with the app router. */
export function OrdersFiltersBound({ query, options }: { query: OrdersQuery; options: FilterOptions }) {
  const router = useRouter();
  return <OrdersFilters query={query} options={options} navigate={(href) => router.push(href)} />;
}
