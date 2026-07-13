import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found | Vertical Express",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
      <span className="text-8xl font-extrabold tracking-tighter text-brand">404</span>
      <h1 className="text-2xl font-extrabold text-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-ink shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.97]"
      >
        Back to home
      </Link>
    </main>
  );
}
