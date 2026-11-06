/**
 * Product specifications as rows.
 *
 * Stored as `[{ label, value }]` (every imported product, 519 on staging,
 * 19 Oct 2026). A few older rows may hold a plain `{ label: value }` object.
 * Both read the same here; anything else reads as no specs rather than as
 * "[object Object]" — the approvals screen used to show exactly that, so an
 * owner approving a product's identity could not see its grade, weight or pack.
 */
export interface SpecRow {
  label: string;
  value: string;
}

export const MAX_SPEC_ROWS = 40;

export function specRows(specs: unknown): SpecRow[] {
  if (Array.isArray(specs)) {
    return specs.flatMap((s) => {
      if (!s || typeof s !== "object") return [];
      const { label, value } = s as { label?: unknown; value?: unknown };
      if (typeof label !== "string" || !label.trim()) return [];
      if (typeof value !== "string" && typeof value !== "number") return [];
      return [{ label: label.trim(), value: String(value).trim() }];
    });
  }
  if (specs && typeof specs === "object") {
    return Object.entries(specs as Record<string, unknown>).flatMap(([label, value]) =>
      typeof value === "string" || typeof value === "number" ? [{ label, value: String(value) }] : []
    );
  }
  return [];
}
