import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { CheckoutView } from "@/components/shop/checkout-view";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listAddresses } from "@/lib/services/addresses";
import type { AddressFormValues } from "@/components/account/address-form";

export const metadata: Metadata = {
  title: "Checkout | Vertical Express",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/checkout");

  const rows = await listAddresses(data.user.id);
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
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Checkout</h1>
        <CheckoutView addresses={addresses} email={data.user.email ?? null} />
      </main>
      <Footer />
    </>
  );
}
