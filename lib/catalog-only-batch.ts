import { z } from "zod";

export const catalogOnlySelectionSchema = z.array(z.object({
  slug: z.string().trim().min(1),
  imageSha256: z.string().regex(/^[a-f0-9]{64}$/, "An exact reviewed image checksum is required"),
}).passthrough()).min(1).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.slug)) ctx.addIssue({ code: "custom", path: [index, "slug"], message: "Duplicate product slug" });
    seen.add(row.slug);
  });
});

export const catalogOnlyBatchSchema = z.object({
  batch: z.string().trim().min(1),
  products: catalogOnlySelectionSchema,
}).passthrough();

export type CatalogOnlySelection = z.infer<typeof catalogOnlySelectionSchema>[number];
