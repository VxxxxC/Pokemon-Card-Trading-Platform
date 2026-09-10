export function MerchantProductDetailPageSkeleton() {
  return (
    <div className="flex-1 w-full flex flex-col bg-[#17130f]">
      <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 lg:px-8 py-4 sm:py-6 pb-28 lg:pb-12 animate-fadeIn">
        <div className="h-8 w-16 rounded-lg bg-white/5 animate-pulse mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 items-start gap-6">
          <section className="lg:col-span-5 space-y-3 lg:space-y-3.5">
            <div className="w-full max-w-[280px] sm:max-w-[300px] mx-auto lg:max-w-none aspect-5/7 max-h-[min(48vh,420px)] lg:max-h-none lg:aspect-[3/4] bg-[#26211C] rounded-2xl animate-pulse" />
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2 max-w-[280px] sm:max-w-[300px] mx-auto lg:max-w-none w-full">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-5/7 bg-[#26211C] rounded-lg lg:rounded-xl animate-pulse"
                />
              ))}
            </div>
          </section>
          <section className="lg:col-span-7 space-y-4">
            <div className="h-8 w-40 rounded bg-white/5 animate-pulse" />
            <div className="h-32 rounded-2xl bg-white/5 animate-pulse" />
            <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-48 rounded-xl bg-white/5 animate-pulse" />
          </section>
        </div>
      </main>
    </div>
  );
}
