export default function AccountLoading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6">
      <div className="mb-6 h-8 w-48 rounded-full bg-neutral-200" />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        {/* Sidebar nav skeleton */}
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 rounded-full bg-neutral-100" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-card bg-neutral-100" />
            ))}
          </div>
          <div className="h-64 rounded-card bg-neutral-100" />
        </div>
      </div>
    </main>
  );
}
