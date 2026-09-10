export function MarketplacePageSkeleton() {
  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 lg:px-8 py-4 lg:py-6 pb-28 lg:pb-12 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 lg:mb-4">
        <div className="space-y-1.5">
          <div className="h-6 lg:h-7 w-28 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-3 w-44 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="hidden lg:block h-9 w-40 rounded-lg bg-white/5 animate-pulse" />
      </div>

      <div className="mb-3 lg:mb-4 flex gap-2 items-center">
        <div className="lg:hidden h-10 w-12 rounded-lg bg-white/5 animate-pulse shrink-0" />
        <div className="flex-1 h-10 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-10 w-12 rounded-lg bg-white/5 animate-pulse shrink-0" />
      </div>

      <div className="lg:grid lg:grid-cols-[288px_1fr] lg:gap-6 items-start">
        <aside className="hidden lg:block space-y-3">
          <div className="rounded-xl border border-white/[0.06] bg-[#26211C] p-3 h-36 animate-pulse" />
          <div className="rounded-xl border border-white/[0.06] bg-[#26211C] p-3 h-52 animate-pulse" />
        </aside>

        <div className="grid grid-cols-3 gap-2 md:gap-3 lg:grid-cols-4 lg:gap-4 items-stretch">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="bg-[#26211C] rounded-xl border border-white/[0.06] overflow-hidden animate-pulse"
            >
              <div className="w-full aspect-[3/4] bg-white/5" />
              <div className="p-2 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-white/5" />
                <div className="h-2.5 w-1/2 rounded bg-white/5" />
                <div className="flex justify-between gap-1">
                  <div className="h-4 w-12 rounded bg-white/5" />
                  <div className="h-4 w-14 rounded bg-white/5" />
                </div>
                <div className="h-3 w-2/3 rounded bg-white/5" />
                <div className="h-8 w-full rounded-lg bg-white/5 mt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
