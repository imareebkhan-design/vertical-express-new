import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { EmptyState } from "@/components/shop/empty-state";
import { getAuthUserId } from "@/lib/supabase/server";
import { listMyBookings } from "@/lib/services/bookings";

export const metadata: Metadata = { title: "My Bookings | Vertical Express", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  scheduled: "Scheduled",
  visited: "Site visited",
  quoted: "Quote sent",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function BookingsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login?next=/account/bookings");

  const bookings = await listMyBookings(userId);

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">My Bookings</h1>
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <AccountNav active="/account/bookings" />
          <div>
            {bookings.length === 0 ? (
              <EmptyState
                title="No service bookings yet"
                caption="Book a professional from our Services page and it'll appear here."
                actionLabel="Explore services"
                actionHref="/services"
              />
            ) : (
              <ul className="space-y-3">
                {bookings.map((b) => (
                  <li key={b.id} className="rounded-card border border-neutral-100 bg-white p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold">{b.service.name}</p>
                      <span className="rounded-chip bg-surface px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-neutral-600">
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-neutral-500">
                      {b.bookingNo} · {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-neutral-600">{b.scope}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
