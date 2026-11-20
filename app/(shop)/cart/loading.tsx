export default function CartLoading() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6">
      <div className="mb-6 h-8 w-32 rounded-full bg-neutral-200" />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-card border border-neutral-100 bg-white p-4">
              <div className="size-24 rounded-panel bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-neutral-200" />
                <div className="h-3 w-1/2 rounded bg-neutral-100" />
                <div className="h-3 w-1/4 rounded bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-64 rounded-card bg-neutral-100" />
      </div>
    </main>
  );
}
