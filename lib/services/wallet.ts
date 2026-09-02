import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/prisma/generated/client/client";
import { log } from "@/lib/observability";
import { SETTING_KEYS, readSetting, parsePercent } from "@/lib/services/settings";

/**
 * The cashback rate, as a percentage of the order total.
 *
 * THIS USED TO BE A HARDCODED 5% AND IT PAID OUT.
 *
 * It now comes from the settings table, edited in the console, because the
 * person who owns this number is a shopkeeper rather than an engineer. A value
 * on a screen gets questioned; a constant in a file paid out for weeks without
 * anybody noticing.
 *
 * `creditCashbackForOrder` runs whenever an order is marked delivered, so every
 * completed order was crediting five percent of its value to the customer's
 * wallet at a rate nobody had chosen — ₹2,500 on a ₹50,000 order, as a standing
 * liability, decided in a source file. `CLAUDE.md` is explicit that a rule like
 * this is the owner's to set, and no cashback policy exists.
 *
 * So the rate now comes from configuration and defaults to **off**. Unset means
 * no cashback is credited and nothing is promised, which is the only honest
 * default when the policy is undecided. Setting WALLET_CASHBACK_PERCENT=5 turns
 * it on deliberately, by someone who meant to.
 *
 * Deliberately not a silent fallback to a plausible number: a payout that
 * pretends to be policy is worse than no payout.
 */
async function cashbackPercent(): Promise<number> {
  /* The console is the source of truth. WALLET_CASHBACK_PERCENT remains as a
     fallback so an environment that has not been configured through the UI
     behaves as before — but the setting wins, because the person who owns this
     number should not need a deploy to change it. */
  const fromSettings = parsePercent(await readSetting(SETTING_KEYS.cashbackPercent));
  if (fromSettings !== null) return fromSettings;

  const raw = process.env.WALLET_CASHBACK_PERCENT;
  if (!raw) return 0;
  const pct = parsePercent(raw);
  if (pct === null) {
    log("ERROR", {
      service: "wallet-service",
      event: "invalid_cashback_percent",
      metadata: { source: "env" },
    });
    return 0;
  }
  return pct;
}


export async function getOrCreateWallet(userId: string) {
  let wallet = await db.wallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    wallet = await db.wallet.create({
      data: {
        userId,
        balancePaise: 0,
      },
    });
  }

  return wallet;
}

export async function creditCashbackForOrder(params: {
  userId: string;
  orderId: string;
  orderNo: string;
  orderTotalPaise: number;
}) {
  const { userId, orderId, orderNo, orderTotalPaise } = params;

  const pct = await cashbackPercent();
  if (pct === 0) return;

  /* Integer paise throughout — the order total is already paise, and rounding
     once at the end keeps a fraction of a paisa from becoming a real one. */
  const cashbackPaise = Math.round((orderTotalPaise * pct) / 100);
  if (cashbackPaise <= 0) return;

  const wallet = await getOrCreateWallet(userId);

  try {
    await db.$transaction(async (tx) => {
      const existingTx = await tx.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          type: "cashback_credit",
          referenceId: orderId,
        },
      });

      if (existingTx) return;

      // 30 days expiry
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountPaise: cashbackPaise,
          type: "cashback_credit",
          referenceId: orderId,
          description: `Cashback for order #${orderNo}`,
          expiresAt,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balancePaise: { increment: cashbackPaise },
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Duplicate cashback credit attempt caught by DB unique constraint @@unique([referenceId, type])
      return;
    }
    throw e;
  }
}

export async function getUserWallet(userId: string) {
  const wallet = await getOrCreateWallet(userId);
  const transactions = await db.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    wallet,
    transactions,
  };
}
