import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/prisma/generated/client/client";

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

  // Calculate 5% cashback
  const cashbackPaise = Math.round(orderTotalPaise * 0.05);
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
          description: `5% Cashback for order #${orderNo}`,
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
