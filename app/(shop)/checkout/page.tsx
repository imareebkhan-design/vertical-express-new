import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutSwitcher } from "@/components/mobile/checkout/checkout-switcher";
import { getAuthUser } from "@/lib/auth/current-user";
import { listAddresses } from "@/lib/services/addresses";
import type { AddressFormValues } from "@/components/account/address-form";
import Link from "next/link";
import { ORDERING_CLOSED_MESSAGE, orderingOpen } from "@/lib/commerce-mode";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/checkout");

  /* COMMERCE_MODE=catalogue: say so here rather than show a form the server
     would refuse (the refusal itself is in placeOrder; this is only the screen). */
  if (!orderingOpen()) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-ink">Ordering isn&apos;t open yet</h1>
        <p className="mt-3 text-sm font-semibold text-neutral-600">{ORDERING_CLOSED_MESSAGE}</p>
        <Link href="/cart" className="mt-6 inline-block text-sm font-bold text-ink underline underline-offset-2">
          Back to your list
        </Link>
      </main>
    );
  }

  const rows = await listAddresses(user.id);
  const addresses: (AddressFormValues & { id: string })[] = rows.map((a) => ({
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    accessNote: a.accessNote,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    latitude: a.latitude,
    longitude: a.longitude,
    placeId: a.placeId,
    isDefault: a.isDefault,
  }));

  return (
    <CheckoutSwitcher addresses={addresses} email={user.email} />
  );
}
