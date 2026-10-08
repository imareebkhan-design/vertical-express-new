import { z } from "zod";
import { parseRupeeInput } from "@/lib/money";

// Offline preparation only. A passing report is not a database apply token.
const text = z.string().trim().min(1);
const integer = z.number().int().min(0).max(2_147_483_647);
const tax = z.object({ hsn: text, ratePct: z.number().min(0).max(100) }).strict();
const contextSchema = z.object({
  products: z.array(z.object({
    slug: text, category: text, status: text, existingSkus: z.array(text),
  }).strict()),
  warehouses: z.array(z.object({ id: text, isActive: z.boolean() }).strict()),
  existingSkus: z.array(text),
  categoryTaxes: z.record(z.string(), tax),
}).strict();
const rowSchema = z.object({
  slug: text,
  sku: text,
  model: text,
  pack: text,
  unitLabel: text,
  priceRupees: text,
  priceSource: text,
  approvedBy: text,
  gstRatePct: z.number().min(0).max(100),
  hsn: z.string().regex(/^\d{4}(?:\d{2})?(?:\d{2})?$/),
  stock: z.array(z.object({ warehouseId: text, qtyOnHand: integer }).strict()).min(1),
}).strict();
const inputSchema = z.object({ rows: z.array(z.unknown()).min(1) }).strict();

export type EnrichmentContext = z.infer<typeof contextSchema>;
export interface EnrichmentIssue { row: number; field: string; message: string }

export function previewEnrichment(input: unknown, contextInput: unknown) {
  const issues: EnrichmentIssue[] = [];
  const candidates: { row: number; slug: string; sku: string; pricePaise: number }[] = [];
  const contextResult = contextSchema.safeParse(contextInput);
  const inputResult = inputSchema.safeParse(input);
  const result = () => ({
    mode: "offline-preview" as const,
    readyForDatabaseReview: issues.length === 0 && candidates.length > 0,
    // Never expose a partial subset as an applicable batch.
    candidates: issues.length ? [] : candidates,
    issues,
    databaseWrites: 0,
  });
  for (const [label, parsed] of [["context", contextResult], ["input", inputResult]] as const) {
    if (!parsed.success) for (const issue of parsed.error.issues) {
      issues.push({ row: 0, field: `${label}.${issue.path.join(".")}`, message: issue.message });
    }
  }
  if (!contextResult.success || !inputResult.success) return result();
  const context = contextResult.data;
  const products = new Map(context.products.map(p => [p.slug, p]));
  const warehouses = new Map(context.warehouses.map(w => [w.id, w]));
  if (products.size !== context.products.length || warehouses.size !== context.warehouses.length) {
    issues.push({ row: 0, field: "context", message: "Duplicate product or warehouse identity in snapshot" });
    return result();
  }
  const existingSkus = new Set([...context.existingSkus, ...context.products.flatMap(p => p.existingSkus)]);
  const seen = new Set<string>();
  inputResult.data.rows.forEach((raw, index) => {
    const row = index + 1;
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) issues.push({ row, field: issue.path.join("."), message: issue.message });
      return;
    }
    const r = parsed.data;
    const add = (field: string, message: string) => issues.push({ row, field, message });
    const product = products.get(r.slug);
    if (!product) add("slug", "Product is absent from the reviewed snapshot");
    else {
      if (product.status !== "draft" && product.status !== "catalog_only") add("slug", "Only existing drafts or catalog-only products may be enriched");
      if (product.existingSkus.length) add("slug", "Product already has variants; reconcile before enrichment");
      const mapped = context.categoryTaxes[product.category];
      if (!mapped) add("hsn", "Category has no explicit tax mapping; fallback is not accepted");
      else if (mapped.hsn !== r.hsn || mapped.ratePct !== r.gstRatePct) {
        add("hsn", "Approved SKU tax differs from current category mapping");
      }
    }
    if (seen.has(r.sku) || existingSkus.has(r.sku)) add("sku", "Duplicate or existing SKU");
    seen.add(r.sku);
    // Plain decimal only; reject malformed grouping instead of stripping commas.
    const pricePaise = /^\d+(?:\.\d{1,2})?$/.test(r.priceRupees) ? parseRupeeInput(r.priceRupees) : null;
    if (pricePaise === null || pricePaise <= 0 || pricePaise > 2_147_483_647) {
      add("priceRupees", "Supply a positive GST-inclusive price with at most two decimals within database limits");
    }
    const stockSeen = new Set<string>();
    for (const s of r.stock) {
      if (stockSeen.has(s.warehouseId)) add("stock", "Duplicate SKU/warehouse stock row");
      stockSeen.add(s.warehouseId);
      if (!warehouses.get(s.warehouseId)?.isActive) add("stock", "Unknown or inactive warehouse");
    }
    if (pricePaise !== null) candidates.push({ row, slug: r.slug, sku: r.sku, pricePaise });
  });
  return result();
}
