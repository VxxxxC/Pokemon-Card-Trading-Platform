export function ProductDetailSkeleton() {
  return (
    <div className="flex-1 w-full flex flex-col bg-[#17130f]">
      <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 lg:px-8 py-6 pb-6 lg:pb-12 animate-fadeIn">
        <div className="h-8 w-16 rounded-lg bg-white/5 animate-pulse mb-2" />
        <div className="mb-6 flex items-center gap-1.5">
          <div className="h-3 w-24 rounded bg-white/5 animate-pulse" />
          <div className="h-3 w-3 rounded bg-white/5 animate-pulse" />
          <div className="h-3 w-32 rounded bg-white/5 animate-pulse" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 items-start">
          <section className="lg:col-span-5 mb-6 lg:mb-0">
            <div className="w-full max-w-[200px] sm:max-w-[220px] mx-auto lg:max-w-[240px] aspect-5/7 max-h-[min(38vh,300px)] rounded-lg bg-[#17130f] animate-pulse" />
          </section>

          <section className="lg:col-span-7 space-y-6">
            <div className="space-y-2 pb-4 border-b border-[rgba(237,232,224,0.06)]">
              <div className="h-8 w-3/4 rounded-lg bg-white/5 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-white/5 animate-pulse" />
              <div className="h-3 w-40 rounded bg-white/5 animate-pulse" />
            </div>

            <div className="bg-[#26211C] p-5 rounded-2xl border border-white/5 h-28 animate-pulse" />
            <div className="bg-[#26211C] p-4 rounded-xl border border-[rgba(237,232,224,0.08)] h-72 animate-pulse" />
            <div className="bg-[#26211C] border border-[rgba(237,232,224,0.08)] rounded-2xl p-6 h-96 animate-pulse" />
          </section>
        </div>
      </main>
    </div>
  );
}
