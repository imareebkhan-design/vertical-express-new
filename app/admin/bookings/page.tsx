import { adminListBookings, nextBookingStatuses } from "@/lib/services/admin/manage";
import { StatusControl } from "@/components/admin/status-control";

export const dynamic = "force-dynamic";

export default async function AdminBookings() {
  const bookings = await adminListBookings();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Service Bookings ({bookings.length})</h1>
      <div className="overflow-x-auto rounded-card border border-neutral-100 bg-white shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-neutral-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center font-semibold text-neutral-400">
                  No bookings yet.
                </td>
              </tr>
            ) : (
              bookings.map((b) => (
                <tr key={b.id} className="font-bold align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{b.bookingNo}</td>
                  <td className="px-4 py-3">{b.service.name}</td>
                  <td className="px-4 py-3 font-semibold text-neutral-500">
                    {b.name}
                    <br />
                    <span className="text-xs">{b.phone}</span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs font-semibold text-neutral-500">
                    <span className="line-clamp-2">{b.scope}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-chip bg-surface px-2 py-0.5 text-[11px] font-extrabold uppercase text-neutral-600">
                      {b.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusControl kind="booking" id={b.id} options={nextBookingStatuses(b.status)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
