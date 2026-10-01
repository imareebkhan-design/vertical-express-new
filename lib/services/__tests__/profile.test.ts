import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  apiProfileSchema,
  firstProfileIssue,
  getProfileFields,
  saveProfile,
  webProfileSchema,
} from "@/lib/services/profile";

/**
 * W-14: the web's profile editing and the app's `PATCH /api/v1/me` share one
 * set of rules (`lib/services/profile.ts`). The `/me` transport itself is
 * covered in v1-account-location.test.ts; this is the shared behaviour.
 */

let userA: string;
let userB: string;

const mkUser = async () =>
  (
    await db.user.create({
      data: { id: randomUUID(), firebaseUid: `uid-prof-${randomUUID().slice(0, 8)}`, phone: `+9195${String(Math.random()).slice(2, 10)}` },
      select: { id: true },
    })
  ).id;

before(async () => {
  userA = await mkUser();
  userB = await mkUser();
});

after(async () => {
  await db.profile.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

test("a customer with no profile row gets one on first save", async () => {
  assert.equal(await db.profile.count({ where: { userId: userA } }), 0);
  const parsed = webProfileSchema.parse({ fullName: "  Bilal Ahmad ", buyerType: "contractor" });
  const saved = await saveProfile(userA, parsed);
  assert.equal(saved.fullName, "Bilal Ahmad");
  assert.equal(saved.buyerType, "contractor");
  assert.deepEqual(await getProfileFields(userA), { ...saved });
});

test("a GSTIN is normalised before it is checked and stored", async () => {
  const parsed = webProfileSchema.parse({ companyName: "Ahmad Builders", gstin: " 01abcde1234f1ze " });
  const saved = await saveProfile(userA, parsed);
  assert.equal(saved.gstin, "01ABCDE1234F1ZE");
  assert.equal(saved.companyName, "Ahmad Builders");
  assert.equal(saved.fullName, "Bilal Ahmad", "fields not sent are left alone");
});

test("refusals name the field and the reason; nothing is written", async () => {
  const before = await getProfileFields(userA);
  const cases: [unknown, string, RegExp][] = [
    [{ gstin: "01ABCDE1234F1Z9" }, "gstin", /GSTIN doesn't look right/],
    [{ gstin: "SHORT" }, "gstin", /GSTIN doesn't look right/],
    [{ fullName: "B" }, "fullName", /Enter your name/],
    [{ fullName: "" }, "fullName", /Enter your name/],
    [{ companyName: "A" }, "companyName", /business name/],
    [{ buyerType: "builder" }, "buyerType", /./],
  ];
  for (const [input, field, message] of cases) {
    const r = webProfileSchema.safeParse(input);
    assert.equal(r.success, false, JSON.stringify(input));
    const issue = firstProfileIssue(r.error!);
    assert.equal(issue.field, field);
    assert.match(issue.message, message);
  }
  assert.deepEqual(await getProfileFields(userA), before);
});

test("null clears the business fields", async () => {
  const saved = await saveProfile(userA, webProfileSchema.parse({ companyName: null, gstin: null }));
  assert.equal(saved.companyName, null);
  assert.equal(saved.gstin, null);
});

test("the web cannot close onboarding; the app can, with the server's clock", async () => {
  /* Unknown keys are dropped by the web schema, so this is "nothing to update". */
  const web = webProfileSchema.safeParse({ onboardedAt: "now" });
  assert.equal(web.success, false);
  assert.equal(firstProfileIssue(web.error!).message, "Nothing to update");

  const t0 = Date.now();
  const saved = await saveProfile(userB, apiProfileSchema.parse({ onboardedAt: "now" }));
  assert.ok(saved.onboardedAt && saved.onboardedAt.getTime() >= t0 - 1000);
  assert.equal(apiProfileSchema.safeParse({ onboardedAt: "2020-01-01" }).success, false);
});

test("a save touches only the given customer's profile", async () => {
  const bBefore = await getProfileFields(userB);
  await saveProfile(userA, webProfileSchema.parse({ fullName: "Someone Else", companyName: "Other Firm" }));
  assert.deepEqual(await getProfileFields(userB), bBefore);
});
