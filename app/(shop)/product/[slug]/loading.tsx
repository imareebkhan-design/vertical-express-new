export default function ProductLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6" aria-busy="true">
      <div className="mb-6 h-4 w-64 animate-pulse rounded bg-surface" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="aspect-square animate-pulse rounded-panel bg-surface" />
        <div className="space-y-4">
          <div className="h-3 w-24 animate-pulse rounded bg-surface" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-surface" />
          <div className="h-10 w-40 animate-pulse rounded bg-surface" />
          <div className="h-28 w-full animate-pulse rounded-card bg-surface" />
          <div className="h-11 w-full animate-pulse rounded-full bg-surface" />
          <div className="h-16 w-full animate-pulse rounded-card bg-surface" />
        </div>
      </div>
    </main>
  );
}
