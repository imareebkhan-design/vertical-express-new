import "server-only";
import type { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import type { DbClient } from "./audit";
import { orderingOpen } from "@/lib/commerce-mode";
import { strictCatalogue } from "@/lib/deploy-env";
import { explainCatalogState, type CatalogState, type CatalogStateSnapshot } from "@/lib/catalog-explain";
import { validateCommercialReadiness } from "./admin/commercial-readiness";

/** Exactly the fields `explainCatalogState` reads. */
export const CATALOG_STATE_SELECT = {
  id: true,
  slug: true,
  status: true,
  identityConfirmed: true,
  identityApprovedAt: true,
  identityApprovedBy: true,
  identityApprovalReason: true,
  commercialReview: true,
  brand: { select: { isActive: true } },
  category: { select: { isActive: true } },
  images: {
    where: { isPrimary: true },
    select: {
      licence: true, sourceVerified: true, identityApproved: true, approvalStatus: true, severity: true,
      approvedAt: true, approvedBy: true, approvalReason: true, sha256: true,
    },
  },
  variants: {
    select: { isDefault: true, isActive: true, pricePaise: true, inventory: { select: { warehouse: { select: { isActive: true } } } } },
  },
} as const satisfies Prisma.ProductSelect;

/**
 * Explain, for the console, why each product is or is not shown and sold.
 * Runs the commercial readiness check only for products that would otherwise
 * be purchasable, so the answer is complete without checking every row.
 * Read-only; never decides what the storefront serves.
 */
export async function explainProducts(productIds: readonly string[], client: DbClient = db): Promise<Map<string, CatalogState>> {
  const rows = await client.product.findMany({ where: { id: { in: [...productIds] } }, select: CATALOG_STATE_SELECT });
  const ctx = { orderingOpen: orderingOpen(), strict: strictCatalogue() };
  const out = new Map<string, CatalogState>();
  for (const row of rows) {
    const snapshot = row as CatalogStateSnapshot;
    const first = explainCatalogState(snapshot, ctx);
    const needsCommercial = first.visible && row.status === "published";
    out.set(row.id, needsCommercial
      ? explainCatalogState(snapshot, { ...ctx, commercialIssues: await validateCommercialReadiness(client, row.id) })
      : first);
  }
  return out;
}
