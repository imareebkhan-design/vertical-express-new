import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/current-user";
import { getProfileFields } from "@/lib/services/profile";
import { ProfileSwitcher } from "@/components/account/profile-switcher";

export const metadata: Metadata = {
  title: "Profile & GST",
  robots: { index: false },
};

export default async function ProfilePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/account/profile");

  const p = await getProfileFields(user.id);
  return (
    <ProfileSwitcher
      profile={{ fullName: p.fullName, buyerType: p.buyerType, companyName: p.companyName, gstin: p.gstin }}
      phone={user.phone}
      email={user.email}
    />
  );
}
