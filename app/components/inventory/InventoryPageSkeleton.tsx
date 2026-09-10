function InventoryAccordionRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <div className="w-12 h-[3.5rem] rounded-md bg-bg-elevated/30 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-28 max-w-[55%] rounded bg-bg-elevated/30" />
          <div className="h-4 w-10 rounded-md bg-bg-elevated/20 shrink-0" />
        </div>
        <div className="h-3 w-20 rounded bg-bg-elevated/20" />
      </div>
      <div className="h-3.5 w-3.5 rounded-sm bg-bg-elevated/20 shrink-0" />
    </div>
  );
}

export function InventoryPageSkeleton() {
  return (
    <section
      className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)] animate-pulse"
      aria-hidden="true"
      aria-label="載入掛單列表"
    >
      <div className="flex gap-1 px-3 py-2 sm:px-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-6 w-[4.75rem] rounded-md bg-bg-elevated/25 shrink-0"
          />
        ))}
      </div>

      <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
        <div className="h-9 rounded-lg border border-[rgba(237,232,224,0.06)] bg-bg-elevated/25" />
      </div>

      <div className="px-2 sm:px-3 py-2.5 space-y-2.5 divide-y divide-[rgba(237,232,224,0.06)]">
        {Array.from({ length: 3 }).map((_, index) => (
          <InventoryAccordionRowSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}
