export default function CategoryLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true">
      <div className="mb-4 h-4 w-48 animate-pulse rounded bg-surface" />
      <div className="mb-6 h-9 w-64 animate-pulse rounded-lg bg-surface" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 })?.map((_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-neutral-100 bg-white shadow-card">
            <div className="aspect-square animate-pulse bg-surface" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
              <div className="h-4 w-full animate-pulse rounded bg-surface" />
              <div className="h-5 w-1/2 animate-pulse rounded bg-surface" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
