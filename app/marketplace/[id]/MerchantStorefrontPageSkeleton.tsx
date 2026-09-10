export function MerchantStorefrontPageSkeleton() {
  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 lg:px-8 py-6 pb-28 lg:pb-12 animate-fadeIn">
      <section className="rounded-2xl border border-[rgba(212,165,116,0.18)] bg-[#26211C] p-5 lg:p-6 mb-6">
        <div className="space-y-3">
          <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-4 w-72 rounded bg-white/5 animate-pulse" />
          <div className="h-16 w-full max-w-[760px] rounded bg-white/5 animate-pulse" />
          <div className="h-6 w-28 rounded-full bg-white/5 animate-pulse" />
        </div>
      </section>

      <div className="hidden lg:block h-9 w-40 rounded-lg bg-white/5 animate-pulse mb-6" />

      <div className="mb-6 flex gap-2 items-center">
        <div className="lg:hidden h-12 w-14 rounded-[10px] bg-white/5 animate-pulse shrink-0" />
        <div className="flex-1 h-12 rounded-[10px] bg-white/5 animate-pulse" />
        <div className="h-12 w-14 rounded-[10px] bg-white/5 animate-pulse shrink-0" />
      </div>

      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8 items-start">
        <aside className="hidden lg:block space-y-4">
          <div className="rounded-xl border border-white/8 bg-[#26211C] p-4 h-40 animate-pulse" />
          <div className="rounded-xl border border-white/8 bg-[#26211C] p-4 h-64 animate-pulse" />
        </aside>

        <div className="grid grid-cols-3 gap-2 md:gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="bg-[#26211C] rounded-2xl border border-white/5 overflow-hidden animate-pulse"
            >
              <div className="w-full aspect-[3/4] bg-white/5" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 rounded bg-white/5" />
                <div className="h-3 w-1/2 rounded bg-white/5" />
                <div className="h-5 w-1/3 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
