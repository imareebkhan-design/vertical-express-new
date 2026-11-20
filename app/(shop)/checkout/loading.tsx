export default function CheckoutLoading() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6">
      <div className="mb-6 h-8 w-32 rounded-full bg-neutral-200" />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left — form skeleton */}
        <div className="space-y-6">
          <div className="h-48 rounded-card bg-neutral-100" />
          <div className="h-32 rounded-card bg-neutral-100" />
          <div className="h-14 w-full rounded-full bg-neutral-200" />
        </div>
        {/* Right — summary skeleton */}
        <div className="h-80 rounded-card bg-neutral-100" />
      </div>
    </main>
  );
}
