export function UserTradingSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <section className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]">
        <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="h-9 bg-bg-page/50 rounded-lg" />
        </div>
        <div className="flex items-center justify-between px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="h-4 w-24 bg-bg-elevated rounded" />
          <div className="h-5 w-12 bg-bg-elevated rounded" />
        </div>
        <div className="px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)] space-y-2">
          <div className="space-y-1">
            <div className="h-3 w-12 bg-bg-elevated rounded" />
            <div className="grid grid-cols-4 gap-0.5 bg-bg-page/50 rounded-lg p-0.5 border border-[rgba(237,232,224,0.06)]">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-7 bg-bg-elevated rounded-md" />
              ))}
            </div>
          </div>
          <div className="flex gap-3 min-w-0">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-4 w-10 bg-bg-elevated rounded shrink-0" />
            ))}
          </div>
        </div>
        <div className="px-2 sm:px-3 py-2.5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[7.5rem] rounded-lg border border-[rgba(237,232,224,0.08)] bg-bg-page/25"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
