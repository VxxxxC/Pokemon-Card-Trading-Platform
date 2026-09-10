export function UserCollectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <section className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 sm:px-5 space-y-2">
          <div className="h-3 w-20 rounded bg-white/5" />
          <div className="h-8 w-48 rounded bg-white/5" />
          <div className="h-3 w-36 rounded bg-white/5" />
        </div>
        <div className="flex border-t border-[rgba(237,232,224,0.06)] divide-x divide-[rgba(237,232,224,0.06)]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex-1 px-2 py-2.5 space-y-1.5">
              <div className="h-2.5 w-10 mx-auto sm:mx-0 rounded bg-white/5" />
              <div className="h-4 w-8 mx-auto sm:mx-0 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </section>

      <div className="h-10 rounded-lg bg-white/5" />

      <div className="space-y-2">
        <div className="h-5 w-40 rounded bg-white/5" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-7 w-14 rounded-md bg-white/5 shrink-0" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] h-72 bg-white/[0.03]" />

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] h-40 bg-white/[0.03]" />
    </div>
  );
}
