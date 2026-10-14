/**
 * Staging-only Delhi trial (city Delhi, pincode 110054, its own QA warehouse
 * holding QA TEST item stock only). Dry run unless --apply.
 *
 *   VE_ALLOW_REMOTE_DB=1 DATABASE_URL=<staging> npm run -s qa:delhi-trial -- \
 *     --expect-ref=gjhxhmcsuhxcmrvtkggz --stock=5 --fee-paise=0 --eta-minutes=0 [--live] [--apply]
 *   ... --expect-ref=gjhxhmcsuhxcmrvtkggz --remove --apply   # off + excluded + stock 0; never deletes
 *
 * Same target guard as the QA fixture: staging or a disposable local DB only.
 */
import { qaTargetRefusal } from "../lib/catalog/qa-target";

{
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const flag = (n: string) => process.argv.includes(`--${n}`);
  const refusal = qaTargetRefusal(process.env.DATABASE_URL ?? "", arg("expect-ref"), process.env);
  if (refusal) { console.error(refusal); process.exit(1); }
  const { db } = await import("@/lib/db");
  const { setupDelhiTrial, removeDelhiTrial } = await import("@/lib/services/admin/qa-delhi-trial");
  const apply = flag("apply");
  const num = (n: string) => (arg(n) === undefined ? NaN : Number(arg(n)));
  try {
    await db.$transaction(async (tx) => {
      if (flag("remove")) console.log((await removeDelhiTrial(tx)) ? "Delhi trial removed (off, 110054 excluded, QA stock 0)" : "No Delhi trial found");
      else console.log("Delhi trial set:", await setupDelhiTrial(tx, { stock: num("stock"), deliveryFeePaise: num("fee-paise"), etaMinutes: num("eta-minutes"), live: flag("live") }));
      if (!apply) throw Object.assign(new Error("DRY RUN — rolled back"), { dry: true });
    }).catch((e: Error & { dry?: boolean }) => { if (e.dry) console.log(e.message); else throw e; });
  } finally {
    await db.$disconnect();
  }
}
