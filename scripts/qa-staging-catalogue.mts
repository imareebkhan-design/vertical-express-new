/**
 * Staging-only synthetic UAT products (lib/services/admin/qa-catalogue.ts). Dry run unless --apply.
 *
 *   DATABASE_URL=<staging> npm run -s qa:catalogue -- \
 *     --expect-ref=gjhxhmcsuhxcmrvtkggz --warehouse-id=<uuid> [--apply]
 *   ... --expect-ref=gjhxhmcsuhxcmrvtkggz --remove --apply     # archive (never delete)
 *
 * Rehearse on a disposable local database first: --expect-ref=local-test with VE_TEST_DATABASE=1.
 * Refuses production, any non-staging ref, a mismatched URL and a live payment gateway
 * (same guard as qa:fixture).
 */
import { qaTargetRefusal } from "../lib/catalog/qa-target";

{
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const flag = (n: string) => process.argv.includes(`--${n}`);
  const refusal = qaTargetRefusal(process.env.DATABASE_URL ?? "", arg("expect-ref"), process.env);
  if (refusal) { console.error(refusal); process.exit(1); }
  const { db } = await import("@/lib/db");
  const { upsertQaCatalogue, archiveQaCatalogue } = await import("@/lib/services/admin/qa-catalogue");
  const apply = flag("apply");
  try {
    await db.$transaction(async (tx) => {
      if (flag("remove")) console.log(`Archived ${await archiveQaCatalogue(tx)} QA catalogue products`);
      else console.log(JSON.stringify(await upsertQaCatalogue(tx, arg("warehouse-id") ?? ""), null, 2));
      if (!apply) throw Object.assign(new Error("DRY RUN — rolled back"), { dry: true });
    }, { timeout: 60_000 }).catch((e: Error & { dry?: boolean }) => { if (e.dry) console.log(e.message); else throw e; });
  } finally {
    await db.$disconnect();
  }
}
