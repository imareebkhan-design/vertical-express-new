import { createHash } from "node:crypto";

/**
 * Moving approved product photos from the staging bucket to a production one
 * (handover 03 §B, blocker E-6). Production must hold **approved photos only**,
 * each object byte-identical to the sha256 the database recorded at import.
 *
 * This module only plans and checks. Copying objects and rewriting
 * `product_images.url` in the production database are separate, owner-approved
 * steps (G-2, G-8); nothing here writes anywhere.
 */

/**
 * A photo the production catalogue would show. The caller selects these with
 * `approvedImageWhere()` (lib/catalog-policy.ts) under production rules, so the
 * approval and licence rules live in one place and are not restated here.
 */
export interface ImageRow {
  id: string;
  url: string;
  sha256: string | null;
}

export interface RehomeItem {
  id: string;
  sha256: string;
  from: string;
  to: string;
}

export interface RehomePlan {
  copy: RehomeItem[];
  /** Approved, but served by the app itself (e.g. `/qa/…`), so there is nothing to copy. */
  local: { id: string; url: string }[];
  /** Approved rows the plan cannot move safely; the cutover must stop until each is resolved. */
  problems: { id: string; url: string; reason: string }[];
}

const SHA = /^[0-9a-f]{64}$/;

function withSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Which objects to copy, and where. The object path under the bucket is kept
 * unchanged, so only the base changes.
 */
export function rehomePlan(rows: ImageRow[], opts: { sourceBase: string; destBase: string }): RehomePlan {
  const source = withSlash(opts.sourceBase);
  const dest = withSlash(opts.destBase);
  if (source === dest) throw new Error("source and destination bases must differ");
  const plan: RehomePlan = { copy: [], local: [], problems: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.url.startsWith("/")) {
      plan.local.push({ id: r.id, url: r.url });
      continue;
    }
    if (!r.url.startsWith(source)) {
      plan.problems.push({ id: r.id, url: r.url, reason: "not in the source bucket" });
      continue;
    }
    if (!r.sha256 || !SHA.test(r.sha256)) {
      plan.problems.push({ id: r.id, url: r.url, reason: "no recorded sha256" });
      continue;
    }
    /* Object names are not reliable evidence (some are `<sha>.<ext>`, the official
       photos `products/<slug>/<slug>-official-1-display.webp`); the content hash is,
       and `--check` verifies it at both ends. */
    const path = r.url.slice(source.length);
    if (seen.has(path)) continue; // one object can back several rows
    seen.add(path);
    plan.copy.push({ id: r.id, sha256: r.sha256, from: r.url, to: dest + path });
  }
  return plan;
}

/** Does this object's content match the recorded hash? */
export function matchesSha256(bytes: Uint8Array, sha256: string): boolean {
  return createHash("sha256").update(bytes).digest("hex") === sha256;
}
