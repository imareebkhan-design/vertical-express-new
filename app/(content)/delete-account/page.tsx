import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { readSession, readSessionAllowingRevoked } from "@/lib/auth/session";
import { isDeletedUid, resolveUserFromToken } from "@/lib/auth/current-user";
import { signInPathFor } from "@/lib/auth/sign-in-path";
import { CONTACT } from "@/lib/data";
import { DELETION_EXPLAINER, getDeletionStatus } from "@/lib/services/account-deletion";
import { DeleteAccountPanel } from "@/components/account/delete-account-panel";

/**
 * The public account-deletion page: linked from Account settings on the
 * website, and the URL given to Google Play as the place a customer can delete
 * their account without the app. Anyone can read what deletion does; signing
 * in is what lets them do it.
 */

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your Vertical Express account, what is deleted and what we have to keep.",
};

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const token = await readSession();
  let state: "signed_out" | "eligible" | "blocked" | "pending" = "signed_out";
  let blockers: Awaited<ReturnType<typeof getDeletionStatus>> = null;

  if (token) {
    const userId = await resolveUserFromToken(token);
    if (userId) {
      blockers = await getDeletionStatus(userId);
      state = blockers?.state ?? "signed_out";
    } else if (await isDeletedUid(token.uid)) {
      state = "pending";
    }
  } else {
    const revoked = await readSessionAllowingRevoked();
    if (revoked && (await isDeletedUid(revoked.uid))) state = "pending";
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-[2.5rem] sm:leading-tight">Delete your account</h1>
        <p className="mt-4 text-[15px] font-medium leading-relaxed text-ink-700">
          You can delete your Vertical Express account here or from Account in the app. It happens straight away and
          can&apos;t be undone.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.25rem] bg-white p-5 shadow-card">
            <h2 className="text-[15px] font-extrabold">What we delete</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] font-medium leading-relaxed text-ink-700">
              {DELETION_EXPLAINER.deleted.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[1.25rem] bg-white p-5 shadow-card">
            <h2 className="text-[15px] font-extrabold">What we keep, and why</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] font-medium leading-relaxed text-ink-700">
              {DELETION_EXPLAINER.kept.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>
        <p className="mt-4 text-[13.5px] font-medium leading-relaxed text-ink-700">{DELETION_EXPLAINER.after}</p>
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-ink-700">
          You can&apos;t delete an account while an order, refund, return or service booking is still open, or while
          your wallet has money in it. We&apos;ll tell you exactly what is in the way and what to do.
        </p>

        <div className="mt-8">
          {state === "signed_out" ? (
            <div className="rounded-[1.25rem] bg-chip p-5">
              <p className="text-[14px] font-bold">Sign in to the account you want to delete.</p>
              <p className="mt-1 text-[13px] font-medium text-ink-700">
                Use the same phone number or Google account you shop with. You&apos;ll come straight back here.
              </p>
              <Link
                href={signInPathFor("/delete-account")}
                className="mt-4 inline-block rounded-full bg-brand-deep px-5 py-2.5 text-sm font-extrabold text-white no-underline"
              >
                Sign in to continue
              </Link>
            </div>
          ) : (
            <DeleteAccountPanel
              initial={state}
              blockers={blockers?.state === "blocked" ? blockers.blockers : []}
            />
          )}
        </div>

        <p className="mt-10 text-[12.5px] font-medium text-ink-500">
          Questions about your data? Email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>. Read our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
