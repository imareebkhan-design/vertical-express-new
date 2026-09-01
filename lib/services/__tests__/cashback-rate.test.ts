import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { creditCashbackForOrder } from "@/lib/services/wallet";

/**
 * Cashback is money leaving the business, so its rate is the owner's to set.
 *
 * It was a hardcoded `orderTotalPaise * 0.05`, run on every order marked
 * delivered. Five percent of every completed order, credited to a wallet, at a
 * rate decided in a source file — ₹2,500 on a ₹50,000 order. No cashback policy
 * exists, and `CLAUDE.md` forbids inventing exactly this kind of rule.
 *
 * The default is now off. These pin both halves: unset pays nothing, and a rate
 * that is deliberately set pays exactly that rate and no more.
 */
const created: string[] = [];

async function makeUser() {
  const u = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  created.push(u.id);
  return u.id;
}

async function balanceOf(userId: string) {
  const w = await db.wallet.findUnique({ where: { userId }, select: { balancePaise: true } });
  return w?.balancePaise ?? 0;
}

test.afterEach(() => {
  delete process.env.WALLET_CASHBACK_PERCENT;
});

test.after(async () => {
  await db.wallet.deleteMany({ where: { userId: { in: created } } });
  await db.user.deleteMany({ where: { id: { in: created } } });
});

test("with no rate configured, a delivered order credits nothing", async () => {
  /* THE REGRESSION. An unset policy must not pay out a plausible-looking
     number — a payout that pretends to be policy is worse than no payout. */
  delete process.env.WALLET_CASHBACK_PERCENT;
  const userId = await makeUser();

  await creditCashbackForOrder({
    userId,
    orderId: randomUUID(),
    orderNo: `CB-${Date.now()}-A`,
    orderTotalPaise: 5_000_000, // ₹50,000
  });

  assert.equal(await balanceOf(userId), 0, "an undecided policy must credit nothing");
});

test("a deliberately configured rate credits exactly that rate", async () => {
  process.env.WALLET_CASHBACK_PERCENT = "5";
  const userId = await makeUser();

  await creditCashbackForOrder({
    userId,
    orderId: randomUUID(),
    orderNo: `CB-${Date.now()}-B`,
    orderTotalPaise: 5_000_000,
  });

  assert.equal(await balanceOf(userId), 250_000, "5% of ₹50,000 is ₹2,500, in paise");
});

test("a nonsensical rate is refused rather than guessed at", async () => {
  for (const bad of ["not-a-number", "-5", "150"]) {
    process.env.WALLET_CASHBACK_PERCENT = bad;
    const userId = await makeUser();

    await creditCashbackForOrder({
      userId,
      orderId: randomUUID(),
      orderNo: `CB-${Date.now()}-${bad}`,
      orderTotalPaise: 5_000_000,
    });

    assert.equal(await balanceOf(userId), 0, `"${bad}" must not credit anything`);
  }
});

test("a rate set in the console beats the environment variable", async () => {
  /* The console is where a shopkeeper changes this, so it has to win. The env
     var stays only so an environment nobody has configured through the UI
     behaves as it did before. */
  process.env.WALLET_CASHBACK_PERCENT = "5";
  await db.setting.upsert({
    where: { key: "cashback.percent" },
    create: { key: "cashback.percent", value: "2" },
    update: { value: "2" },
  });

  const userId = await makeUser();
  await creditCashbackForOrder({
    userId,
    orderId: randomUUID(),
    orderNo: `CB-${Date.now()}-SET`,
    orderTotalPaise: 5_000_000, // ₹50,000
  });

  assert.equal(await balanceOf(userId), 100_000, "2% from the console, not 5% from the env");
  await db.setting.deleteMany({ where: { key: "cashback.percent" } });
});

test("a malformed console value falls back rather than paying something odd", async () => {
  process.env.WALLET_CASHBACK_PERCENT = "5";
  await db.setting.upsert({
    where: { key: "cashback.percent" },
    create: { key: "cashback.percent", value: "banana" },
    update: { value: "banana" },
  });

  const userId = await makeUser();
  await creditCashbackForOrder({
    userId,
    orderId: randomUUID(),
    orderNo: `CB-${Date.now()}-BAD`,
    orderTotalPaise: 5_000_000,
  });

  /* Unparseable is treated as unset, so the env fallback applies. What must
     never happen is a number invented from nonsense. */
  assert.equal(await balanceOf(userId), 250_000, "falls back to the env's 5%, not to a guess");
  await db.setting.deleteMany({ where: { key: "cashback.percent" } });
});
