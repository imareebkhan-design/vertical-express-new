/**
 * Staging-only checkout QA fixture. Dry run unless --apply.
 *
 *   VE_ALLOW_REMOTE_DB=1 DATABASE_URL=<staging> npm run -s qa:fixture -- \
 *     --expect-ref=gjhxhmcsuhxcmrvtkggz --category=painting --warehouse-id=<uuid> \
 *     --price-paise=19900 --stock=20 [--apply]
 *   ... --expect-ref=gjhxhmcsuhxcmrvtkggz --remove --apply     # archive (never delete)
 *
 * Rehearse first on a disposable local database (VE_TEST_DATABASE=1, localhost):
 *   ... --expect-ref=local-test ...
 *
 * Run it through `npm run qa:fixture`, not bare `tsx`: the services it imports
 * start with `import "server-only"`, which only Next's bundler resolves. The npm
 * script puts the committed no-op stub (test-support/stubs) on NODE_PATH, the
 * same way the test runner does.
 *
 * Refuses: any ref other than staging, a URL whose ref differs from --expect-ref,
 * the production ref, and a live payment gateway. Prices/stock are synthetic QA
 * values passed explicitly; nothing is defaulted.
 */
import { qaTargetRefusal } from "../lib/catalog/qa-target";

{
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const flag = (n: string) => process.argv.includes(`--${n}`);
  const refusal = qaTargetRefusal(process.env.DATABASE_URL ?? "", arg("expect-ref"), process.env);
  if (refusal) { console.error(refusal); process.exit(1); }
  const { db } = await import("@/lib/db");
  const { upsertQaFixture, archiveQaFixture } = await import("@/lib/services/admin/qa-fixture");
  const apply = flag("apply");
  try {
    if (flag("remove")) {
      if (!apply) console.log("DRY RUN: would archive the QA fixture (status archived, variant inactive)");
      else console.log((await db.$transaction((tx) => archiveQaFixture(tx))) ? "QA fixture archived" : "No QA fixture found");
    } else {
      const opts = { categorySlug: arg("category") ?? "", warehouseId: arg("warehouse-id") ?? "", pricePaise: Number(arg("price-paise")), stock: Number(arg("stock")) };
      await db.$transaction(async (tx) => {
        const r = await upsertQaFixture(tx, opts);
        console.log(r.sellable.length ? `NOT sellable: ${r.sellable.join("; ")}` : "QA fixture is sellable (published)");
        if (!apply) throw Object.assign(new Error("DRY RUN — rolled back"), { dry: true });
      }).catch((e: Error & { dry?: boolean }) => { if (e.dry) console.log(e.message); else throw e; });
    }
  } finally {
    await db.$disconnect();
  }
}
