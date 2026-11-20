/**
 * Which attributes a category is browsed by.
 *
 * A contractor buying cement chooses a *grade*. Someone buying tile chooses a
 * *type* first — vitrified or ceramic — then a size, a finish, and where it is
 * going. Those are different questions, so a single hardcoded "Shop by grade"
 * rail is wrong for nineteen of the twenty-one categories.
 *
 * The order matters: the first entry drives the "Shop by …" rail on the
 * category landing page, and all of them appear as filter groups in the
 * sidebar, in this order.
 *
 * Values are never listed here. They are read from each product's own `specs`,
 * so a category shows exactly the types it actually stocks and gains new ones
 * without a code change. That also means a category with no attribute data
 * shows no rail and no attribute filters, rather than an empty scaffold.
 */

export interface CategoryAttributeConfig {
  /** Attribute labels, matched case-insensitively against `specs[].label`. */
  attributes: string[];
  /** Heading for the landing-page rail, e.g. "Shop by grade". */
  railLabel?: string;
}

const CONFIG: Record<string, CategoryAttributeConfig> = {
  // Civil & Interiors
  cement: { attributes: ["Grade", "Weight"], railLabel: "Shop by grade" },
  tiling: {
    attributes: ["Type", "Size", "Finish", "Room"],
    railLabel: "Shop by type",
  },
  painting: { attributes: ["Finish", "Base", "Volume"], railLabel: "Shop by finish" },
  waterproofing: { attributes: ["Type", "Coverage", "Volume"], railLabel: "Shop by type" },
  "plywood-mdf-hdhmr": {
    attributes: ["Type", "Thickness", "Grade"],
    railLabel: "Shop by type",
  },
  fevicol: { attributes: ["Type", "Weight"], railLabel: "Shop by type" },

  // Furniture & Architectural Hardware
  "hinges-channels-handles": { attributes: ["Type", "Finish", "Size"], railLabel: "Shop by type" },
  "kitchen-systems-accessories": { attributes: ["Type", "Finish"], railLabel: "Shop by type" },
  "wardrobe-bed-fittings": { attributes: ["Type", "Finish"], railLabel: "Shop by type" },
  "door-locks-hardware": { attributes: ["Type", "Finish"], railLabel: "Shop by type" },
  "general-hardware-tools": { attributes: ["Type", "Size"], railLabel: "Shop by type" },

  // Electrical
  "wires-mcb-distribution-boards": {
    attributes: ["Type", "Rating", "Length"],
    railLabel: "Shop by type",
  },
  "switches-sockets": { attributes: ["Type", "Rating", "Finish"], railLabel: "Shop by type" },
  "conduits-gi-boxes": { attributes: ["Type", "Size"], railLabel: "Shop by type" },
  lighting: { attributes: ["Type", "Wattage", "Colour"], railLabel: "Shop by type" },
  "ceiling-fans-exhaust": { attributes: ["Type", "Sweep", "Finish"], railLabel: "Shop by type" },
  "appliances-power-backup": { attributes: ["Type", "Capacity"], railLabel: "Shop by type" },
  "power-tools-accessories": { attributes: ["Type", "Power"], railLabel: "Shop by type" },

  // Plumbing, Sanitary & Bath
  "cpvc-pipes-overhead-tanks": {
    attributes: ["Type", "Size", "Capacity"],
    railLabel: "Shop by type",
  },
  "sanitary-bath-fittings": { attributes: ["Type", "Finish"], railLabel: "Shop by type" },
  "kitchen-sinks-faucets": { attributes: ["Type", "Size", "Finish"], railLabel: "Shop by type" },
};

const FALLBACK: CategoryAttributeConfig = { attributes: ["Type"], railLabel: "Shop by type" };

export function attributeConfigFor(categorySlug: string): CategoryAttributeConfig {
  return CONFIG[categorySlug] ?? FALLBACK;
}

/** Reads one labelled attribute off a product's specs JSON. */
export function attributeValue(specs: unknown, label: string): string | null {
  if (!Array.isArray(specs)) return null;
  const wanted = label.trim().toLowerCase();
  const row = (specs as { label?: string; value?: string }[]).find(
    (sp) => typeof sp?.label === "string" && sp.label.trim().toLowerCase() === wanted
  );
  return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : null;
}

/** Every attribute a product carries, keyed by its label. */
export function attributesOf(specs: unknown): Record<string, string> {
  if (!Array.isArray(specs)) return {};
  const out: Record<string, string> = {};
  for (const sp of specs as { label?: string; value?: string }[]) {
    if (typeof sp?.label === "string" && typeof sp?.value === "string" && sp.value.trim()) {
      out[sp.label.trim()] = sp.value.trim();
    }
  }
  return out;
}
