import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock, MapPin, Package, Wallet } from "lucide-react";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Button } from "@/components/ui/button";
import { getAuthUserId } from "@/lib/supabase/server";
import { getOrderByNo, type OrderAddressSnapshot } from "@/lib/services/orders";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Order Confirmed | Vertical Express",
  robots: { index: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  const userId = await getAuthUserId();
  if (!userId) redirect(`/login?next=/checkout/confirmation/${orderNo}`);

  const order = await getOrderByNo(userId, orderNo);
  if (!order) notFound();

  const addr = order.address as unknown as OrderAddressSnapshot;
  const isCod = order.paymentMethod === "cod";

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-16 text-success" strokeWidth={1.5} aria-hidden />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">Order confirmed!</h1>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Order <span className="font-extrabold text-ink">{order.orderNo}</span> ·{" "}
            {isCod ? "Pay on delivery" : "Payment received"}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: Clock, label: "ETA", value: order.etaMinutes ? `~${order.etaMinutes} min` : "Soon" },
            { icon: Wallet, label: "Paid", value: isCod ? "On delivery" : formatPaise(order.totalPaise) },
            { icon: Package, label: "Items", value: String(order.items.reduce((s, i) => s + i.qty, 0)) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-card bg-surface/60 p-4">
              <Icon className="mx-auto size-5 text-brand-deep" strokeWidth={1.8} aria-hidden />
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
              <p className="text-sm font-extrabold">{value}</p>
            </div>
          ))}
        </div>

        {/* Items */}
        <div className="mt-8 rounded-card border border-neutral-100 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-extrabold uppercase tracking-widest text-neutral-500">Order details</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-tile">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.title} className="size-full object-contain p-1.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-extrabold">{item.title}</p>
                  <p className="text-xs font-semibold text-neutral-500">
                    {formatPaise(item.unitPricePaise)} × {item.qty}
                  </p>
                </div>
                <span className="text-sm font-extrabold">{formatPaise(item.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t border-neutral-100 pt-4 text-sm font-bold">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd>{formatPaise(order.subtotalPaise)}</dd>
            </div>
            {order.taxPaise > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">GST (18%)</dt>
                <dd>{formatPaise(order.taxPaise)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-neutral-500">Delivery</dt>
              <dd className={order.deliveryFeePaise === 0 ? "text-success" : ""}>
                {order.deliveryFeePaise === 0 ? "FREE" : formatPaise(order.deliveryFeePaise)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-base font-extrabold">
              <dt>Total</dt>
              <dd>{formatPaise(order.totalPaise)}</dd>
            </div>
          </dl>
        </div>

        {/* Delivery address */}
        <div className="mt-4 flex items-start gap-2 rounded-card border border-neutral-100 bg-white p-4 shadow-card">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-deep" aria-hidden />
          <p className="text-sm font-semibold text-neutral-600">
            <span className="font-extrabold text-ink capitalize">{addr.label} · {addr.name}</span>
            <br />
            {addr.line1}
            {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} — {addr.pincode}
            <br />
            {addr.phone}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/account/orders" className="flex-1">
            <Button size="lg" className="w-full">View my orders</Button>
          </Link>
          <Link href="/categories" className="flex-1">
            <Button size="lg" variant="outline" className="w-full">Continue shopping</Button>
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
