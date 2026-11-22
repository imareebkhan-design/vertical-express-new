"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { signOut as firebaseSignOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { announceAuthChanged } from "@/lib/auth/auth-events";
import { deleteMyAccount } from "@/actions/account-deletion";
import type { DeletionBlocker } from "@/lib/services/account-deletion";

type PanelState = "eligible" | "blocked" | "pending" | "deleted";

/**
 * The signed-in half of /delete-account: the reasons it can't happen yet, or
 * the confirmation. Success is shown only when the server says the deletion
 * finished, Firebase sign-in included.
 */
export function DeleteAccountPanel({
  initial,
  blockers: initialBlockers,
}: {
  initial: "eligible" | "blocked" | "pending";
  blockers: DeletionBlocker[];
}) {
  const [state, setState] = useState<PanelState>(initial);
  const [blockers, setBlockers] = useState(initialBlockers);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    start(async () => {
      setError(null);
      const r = await deleteMyAccount({ confirm: true });
      if (r.ok) {
        try {
          await firebaseSignOut(firebaseAuth());
        } catch {
          /* The server session is already cleared and the Firebase user deleted. */
        }
        announceAuthChanged();
        setState("deleted");
        return;
      }
      const meta = r.error.metadata as { blockers?: DeletionBlocker[]; status?: string } | undefined;
      if (meta?.blockers) {
        setBlockers(meta.blockers);
        setState("blocked");
      } else if (meta?.status === "pending") {
        setState("pending");
        setError(r.error.message);
      } else {
        setError(r.error.message);
      }
    });
  };

  if (state === "deleted") {
    return (
      <div role="status" className="rounded-[1.25rem] bg-chip p-5">
        <p className="text-[15px] font-extrabold">Your account has been deleted.</p>
        <p className="mt-1 text-[13px] font-medium text-ink-700">
          You&apos;ve been signed out everywhere. Thank you for shopping with Vertical Express.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-bold">
          Back to the home page
        </Link>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="rounded-[1.25rem] bg-amber-soft p-5">
        <p className="text-[15px] font-extrabold">Your account can&apos;t be deleted yet</p>
        <ul className="mt-3 space-y-3">
          {blockers.map((b, i) => (
            <li key={`${b.code}-${b.orderNo ?? i}`} className="text-[13.5px] leading-relaxed">
              <p className="font-bold">{b.message}</p>
              <p className="font-medium text-ink-700">{b.resolve}</p>
              {b.orderNo && (
                <Link href={`/account/orders/${b.orderNo}`} className="text-[13px] font-bold">
                  Open order #{b.orderNo}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="rounded-[1.25rem] bg-amber-soft p-5">
        <p className="text-[15px] font-extrabold">Deletion isn&apos;t finished yet</p>
        <p role="alert" className="mt-1 text-[13px] font-medium text-ink-700">
          {error ??
            "Your details have been removed, but we couldn't finish closing your sign-in. We'll keep retrying automatically, or you can try again now."}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-4 rounded-full bg-brand-deep px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {pending ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-danger/30 bg-white p-5">
      <p className="text-[15px] font-extrabold">Delete this account</p>
      <label className="mt-3 flex items-start gap-2.5 text-[13.5px] font-medium leading-relaxed">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => {
            setUnderstood(e.target.checked);
          }}
          className="mt-1"
        />
        I understand this deletes my account straight away, can&apos;t be undone, and that order and tax records are
        kept as described above.
      </label>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-bold text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!understood || pending}
        className="mt-4 rounded-full bg-danger px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </div>
  );
}

/**
 * Shown on /delete-account when the server-issued proof cookie is present,
 * which only the delete action sets once deletion has fully finished
 * (Firebase included). Consumes the proof, and ends the client-side Firebase
 * session, which the server cannot reach.
 */
export function AccountDeletedNotice() {
  useEffect(() => {
    /* A plain request, not a server action, so consuming the proof does not
       re-render this page and replace the notice being read. */
    void fetch("/api/auth/deletion-notice", { method: "DELETE" }).catch(() => {
      /* The proof expires on its own within two minutes. */
    });
    firebaseSignOut(firebaseAuth())
      .catch(() => {
        /* The server session is cleared and the Firebase user is deleted already. */
      })
      .finally(() => {
        announceAuthChanged();
      });
  }, []);
  return (
    <div role="status" className="rounded-[1.25rem] bg-chip p-5">
      <p className="text-[15px] font-extrabold">Your account has been deleted.</p>
      <p className="mt-1 text-[13px] font-medium text-ink-700">
        You&apos;ve been signed out everywhere. Thank you for shopping with Vertical Express.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm font-bold">
        Back to the home page
      </Link>
    </div>
  );
}

/**
 * The signed-out area of /delete-account. When the page was rendered with the
 * deletion proof, it keeps showing the confirmation for as long as it stays
 * mounted, even after the proof is consumed and the page re-renders without it
 * (React keeps this component's state across server re-renders). Without the
 * proof it shows its children: the sign-in prompt.
 */
export function SignedOutArea({ proof, children }: { proof: boolean; children: React.ReactNode }) {
  const [deleted] = useState(proof);
  return deleted ? <AccountDeletedNotice /> : <>{children}</>;
}
