import test from "node:test";
import assert from "node:assert/strict";
import { ATTESTED_IMAGE_LICENCES } from "@/lib/catalog-policy";

/* Each code is an owner decision about reuse rights (catalog-policy.ts). A new code must be
   added here on purpose, so one cannot slip into production through an unrelated change. */
test("attested licence codes are exactly the owner-decided ones", () => {
  assert.deepEqual([...ATTESTED_IMAGE_LICENCES], ["manufacturer-official-dealer-use", "homerun-library-owner-licensed"]);
});

test("free-text licences never count as attested", () => {
  const codes: readonly string[] = ATTESTED_IMAGE_LICENCES;
  for (const free of [
    "Owner-directed catalogue use; source retained, independent licence not attested",
    "Owner-authorized HomeRun reference use; exact identity and pack not approved",
  ]) assert.equal(codes.includes(free), false, free);
});
