export function MerchantPerformanceSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="space-y-4 animate-pulse text-text-primary"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/5" />
        <div className="h-6 w-40 rounded bg-white/5" />
      </div>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
        <div className="flex divide-x divide-[rgba(237,232,224,0.06)]">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex-1 px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="h-3 w-20 rounded bg-white/5 mb-2" />
              <div className="h-5 w-24 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card p-3.5 sm:p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-4 w-32 rounded bg-white/5" />
          <div className="h-8 w-[110px] rounded-lg bg-white/5" />
        </div>
        <div className="h-56 sm:h-64 w-full rounded bg-white/5" />
        <div className="flex divide-x divide-[rgba(237,232,224,0.06)] border-t border-[rgba(237,232,224,0.06)]">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex-1 px-3 py-3">
              <div className="h-3 w-16 rounded bg-white/5 mb-2" />
              <div className="h-5 w-20 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden"
          >
            <div className="px-3.5 py-2.5 border-b border-[rgba(237,232,224,0.06)]">
              <div className="h-4 w-28 rounded bg-white/5" />
            </div>
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="h-10 border-b border-[rgba(237,232,224,0.06)] last:border-b-0 px-3.5"
              >
                <div className="h-4 w-full rounded bg-white/5 my-3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
