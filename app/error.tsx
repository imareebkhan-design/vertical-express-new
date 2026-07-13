"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service in production
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
      <span className="text-5xl">⚠️</span>
      <h1 className="text-2xl font-extrabold text-ink">Something went wrong</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        An unexpected error occurred. Our team has been notified. You can try again or return home.
      </p>
      {error?.digest && (
        <p className="font-mono text-xs text-neutral-400">Error ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-ink shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.97]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-6 py-2.5 text-sm font-bold text-ink shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.97]"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
