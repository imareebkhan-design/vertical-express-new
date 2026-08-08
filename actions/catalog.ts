"use server";

import { listProducts, type CatalogQuery } from "@/lib/services/catalog";

export async function fetchProductsAction(filters: CatalogQuery) {
  return listProducts(filters);
}
