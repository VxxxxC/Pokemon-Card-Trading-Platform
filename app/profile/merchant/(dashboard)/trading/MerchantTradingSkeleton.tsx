export function MerchantTradingSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]">
        <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="h-9 bg-bg-page/50 rounded-lg" />
        </div>
        <div className="px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="h-5 w-24 bg-bg-page/50 rounded" />
        </div>
        <div className="px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="h-8 bg-[#17130f] rounded-lg" />
        </div>
        <div className="px-2 sm:px-3 py-2.5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="bg-bg-page/30 rounded-xl border border-[rgba(237,232,224,0.06)] h-28"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
