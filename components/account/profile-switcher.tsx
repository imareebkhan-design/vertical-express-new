"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { ProfileForm } from "@/components/account/profile-form";
import { PageLoader } from "@/components/page-loader";
import { updateMyProfile, type EditableProfile } from "@/actions/profile";

interface ProfileSwitcherProps {
  profile: EditableProfile;
  phone: string | null;
  email: string | null;
}

/** `/account/profile` — one form, in the desktop account frame or the
 *  phone-web one, like the other account pages. */
export function ProfileSwitcher({ profile, phone, email }: ProfileSwitcherProps) {
  const router = useRouter();
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) return <PageLoader />;

  const form = (
    <ProfileForm initial={profile} phone={phone} email={email} save={updateMyProfile} onSaved={() => router.refresh()} />
  );

  if (isMobile) {
    return (
      <div className="min-h-screen bg-canvas pb-10">
        <div className="native-header sticky top-0 z-30 flex items-center gap-3 border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/account"))}
            aria-label="Back"
            className="flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
          >
            <ArrowLeft className="size-4.5" />
          </button>
          <h1 className="text-base font-extrabold leading-none text-ink">Profile &amp; GST</h1>
        </div>
        <main id="main-content" className="p-4">
          {form}
        </main>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="mb-6 text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">Profile &amp; GST</h1>
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <AccountNav active="/account/profile" />
          <div className="max-w-[720px]">{form}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
