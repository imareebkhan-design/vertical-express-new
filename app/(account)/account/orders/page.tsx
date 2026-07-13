import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { EmptyState } from "@/components/shop/empty-state";
import { getAuthUserId } from "@/lib/supabase/server";
import { listOrders } from "@/lib/services/orders";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "My Orders | Vertical Express", robots: { index: false } };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login?next=/account/orders");

  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const { orders, total, perPage } = await listOrders(userId, page);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">My Orders</h1>
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <AccountNav active="/account/orders" />

          <div>
            {orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                caption="When you place an order it'll show up here with live tracking."
                actionLabel="Start shopping"
                actionHref="/categories"
              />
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/account/orders/${o.orderNo}`}
                      className="flex items-center gap-4 rounded-card border border-neutral-100 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
                    >
                      <div className="flex -space-x-3">
                        {o.items.slice(0, 3).map((it) => (
                          <span key={it.id} className="size-12 shrink-0 overflow-hidden rounded-lg border-2 border-white bg-tile">
                            {it.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.imageUrl} alt="" className="size-full object-contain p-1" />
                            )}
                          </span>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold">{o.orderNo}</p>
                          <OrderStatusBadge status={o.status} />
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                          {new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                          {o.items.reduce((s, i) => s + i.qty, 0)} items · {formatPaise(o.totalPaise)}
                        </p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-neutral-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {pages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/account/orders?page=${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={`grid size-10 place-items-center rounded-full text-sm font-extrabold ${
                      p === page ? "bg-ink text-white" : "border border-neutral-200 hover:border-ink"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
