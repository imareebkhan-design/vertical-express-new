import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutSwitcher } from "@/components/mobile/checkout/checkout-switcher";
import { getAuthUser } from "@/lib/auth/current-user";
import { listAddresses } from "@/lib/services/addresses";
import type { AddressFormValues } from "@/components/account/address-form";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/checkout");

  const rows = await listAddresses(user.id);
  const addresses: (AddressFormValues & { id: string })[] = rows.map((a) => ({
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  }));

  return (
    <CheckoutSwitcher addresses={addresses} email={user.email} />
  );
}
