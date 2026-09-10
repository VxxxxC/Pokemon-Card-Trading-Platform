export function MerchantAnalyticsSkeleton() {
  return (
    <section aria-hidden="true" className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 shrink-0" />
        <div className="h-5 w-48 rounded bg-white/5" />
      </div>

      <div className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]">
        <div className="flex divide-x divide-[rgba(237,232,224,0.06)]">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex-1 px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="h-3 w-20 rounded bg-white/5" />
              <div className="h-5 w-28 rounded bg-white/5 mt-2" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
        <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)] flex justify-between">
          <div className="h-4 w-20 rounded bg-white/5" />
          <div className="h-8 w-[110px] rounded-lg bg-white/5" />
        </div>
        <div className="h-56 sm:h-64 px-1">
          <div className="h-full rounded bg-white/5 m-2" />
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
        <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="h-4 w-24 rounded bg-white/5" />
        </div>
        <div className="p-3 sm:p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 rounded-lg bg-white/5" />
          ))}
        </div>
      </div>
    </section>
  );
}
